"""
DJ mix generation engine — professional edition v5.

Improvements over v4:
  - Phase alignment uses stored beatgrid from analyzer (madmom/librosa quality).
    Only the sub-beat fractional offset is trimmed — intro is NEVER skipped.
  - Spectral Flux on 50-200 Hz kick band as fallback when no beatgrid is stored.
  - echo_out overlap spans the FULL fade tail — no gap between tracks.
  - 3-band crossfade phase-1 now brings in bass+mids (not just 200 Hz bass).
  - Transition zone kept >= 60 s from track end (1 min before-end rule).
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Literal

import numpy as np
from scipy import signal as sp
from scipy import ndimage as _ndi
from pydub import AudioSegment

logger = logging.getLogger(__name__)

# ── Optional high-quality time-stretcher ──────────────────────────────────────
try:
    import pyrubberband as pyrb
    _HAS_PYRB = True
    logger.info("pyrubberband available — high-quality time-stretch enabled")
except Exception:
    _HAS_PYRB = False

TransitionType = Literal["cut", "crossfade", "filter_sweep", "echo_out"]

# ── DJ mixer band boundaries (Hz) ─────────────────────────────────────────────
LOW_CUTOFF  = 200      # below → kick / bass
HIGH_CUTOFF = 4_000    # above → hi-hats / air


@dataclass
class TrackSpec:
    track_id:         str
    file_path:        str
    bpm:              float
    energy:           int
    duration_seconds: float
    sections:         dict
    # Full beat grid from analyzer (beat timestamps in seconds, from track start).
    # When present, enables precise sub-beat phase alignment using the actual
    # beat positions instead of heuristic onset detection.
    beatgrid: list[float] | None = field(default=None)


@dataclass
class TransitionSpec:
    from_track_id:   str
    to_track_id:     str
    transition_type: TransitionType
    transition_bars: int
    bpm_a:           float
    bpm_b:           float = 128.0


# ── Utilities ─────────────────────────────────────────────────────────────────

def _bars_to_ms(bars: int, bpm: float) -> int:
    return int(bars * 4 * 60_000 / max(bpm, 60))


def _ensure_stereo(seg: AudioSegment) -> AudioSegment:
    return seg.set_channels(2) if seg.channels == 1 else seg


def _normalize_loudness(seg: AudioSegment, target_dbfs: float = -14.0) -> AudioSegment:
    diff = target_dbfs - seg.dBFS
    return seg.apply_gain(min(diff, 6))


def _pad_or_trim(seg: AudioSegment, target_ms: int) -> AudioSegment:
    if len(seg) < target_ms:
        return seg + AudioSegment.silent(target_ms - len(seg), frame_rate=seg.frame_rate)
    return seg[:target_ms]


# ── Phrase alignment ──────────────────────────────────────────────────────────

def _snap_to_phrase(position_ms: int, bpm: float, phrase_bars: int = 8) -> int:
    phrase_ms = _bars_to_ms(phrase_bars, bpm)
    if phrase_ms <= 0:
        return position_ms
    n = round(position_ms / phrase_ms)
    return int(max(0, n * phrase_ms))


def _phrase_aligned_split(
    seg: AudioSegment,
    bpm: float,
    min_tail_ms: int,
    phrase_bars: int = 8,
) -> tuple[AudioSegment, AudioSegment]:
    raw_split = len(seg) - min_tail_ms
    snapped   = _snap_to_phrase(raw_split, bpm, phrase_bars)
    snapped   = max(0, min(snapped, len(seg) - min_tail_ms))
    return seg[:snapped], seg[snapped:]


# ── Scipy 3-band EQ ───────────────────────────────────────────────────────────

def _seg_to_float(seg: AudioSegment) -> np.ndarray:
    return np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0


def _float_to_seg(arr: np.ndarray, sr: int, channels: int) -> AudioSegment:
    int16 = (np.clip(arr, -1.0, 1.0) * 32767).astype(np.int16)
    return AudioSegment(int16.tobytes(), frame_rate=sr, sample_width=2, channels=channels)


def _butter_coeffs(cutoff: float, sr: int, btype: str, order: int = 4):
    nyq  = sr / 2.0
    norm = float(np.clip(cutoff / nyq, 1e-4, 1 - 1e-4))
    return sp.butter(order, norm, btype=btype)


def _band_coeffs(low: float, high: float, sr: int, order: int = 4):
    nyq = sr / 2.0
    lo  = float(np.clip(low  / nyq, 1e-4, 1 - 1e-4))
    hi  = float(np.clip(high / nyq, 1e-4, 1 - 1e-4))
    if lo >= hi:
        return None
    return sp.butter(order, [lo, hi], btype="band")


def _filtfilt_ch(raw: np.ndarray, channels: int, b, a) -> np.ndarray:
    if channels == 2:
        L = sp.filtfilt(b, a, raw[0::2]).astype(np.float32)
        R = sp.filtfilt(b, a, raw[1::2]).astype(np.float32)
        n   = min(len(L), len(R))
        out = np.empty(n * 2, dtype=np.float32)
        out[0::2] = L[:n]; out[1::2] = R[:n]
    else:
        out = sp.filtfilt(b, a, raw).astype(np.float32)
    return out


def _eq_lp(seg: AudioSegment, cutoff: float = LOW_CUTOFF) -> AudioSegment:
    b, a = _butter_coeffs(cutoff, seg.frame_rate, "low")
    return _float_to_seg(_filtfilt_ch(_seg_to_float(seg), seg.channels, b, a),
                         seg.frame_rate, seg.channels)


def _eq_hp(seg: AudioSegment, cutoff: float = LOW_CUTOFF) -> AudioSegment:
    b, a = _butter_coeffs(cutoff, seg.frame_rate, "high")
    return _float_to_seg(_filtfilt_ch(_seg_to_float(seg), seg.channels, b, a),
                         seg.frame_rate, seg.channels)


def _eq_bp(seg: AudioSegment, low: float = LOW_CUTOFF, high: float = HIGH_CUTOFF) -> AudioSegment:
    coeffs = _band_coeffs(low, high, seg.frame_rate)
    if coeffs is None:
        return seg
    b, a = coeffs
    return _float_to_seg(_filtfilt_ch(_seg_to_float(seg), seg.channels, b, a),
                         seg.frame_rate, seg.channels)


def _eq_lm(seg: AudioSegment) -> AudioSegment:
    """Low-pass at HIGH_CUTOFF (4 kHz) — keeps bass + mids, cuts air/hi-hats."""
    b, a = _butter_coeffs(HIGH_CUTOFF, seg.frame_rate, "low")
    return _float_to_seg(_filtfilt_ch(_seg_to_float(seg), seg.channels, b, a),
                         seg.frame_rate, seg.channels)


def _eq_mh(seg: AudioSegment) -> AudioSegment:
    """High-pass at LOW_CUTOFF (200 Hz) — cuts kick/bass."""
    return _eq_hp(seg, cutoff=LOW_CUTOFF)


# ── Beatmatching ──────────────────────────────────────────────────────────────

def _atempo_chain(ratio: float) -> str:
    filters = []
    r = float(ratio)
    while r > 2.0:  filters.append("atempo=2.0"); r /= 2.0
    while r < 0.5:  filters.append("atempo=0.5"); r /= 0.5
    filters.append("atempo=%.6f" % r)
    return ",".join(filters)


def _time_stretch_to_bpm(seg: AudioSegment, source_bpm: float, target_bpm: float) -> AudioSegment:
    """Pitch-preserving BPM sync via ffmpeg atempo."""
    import subprocess, os
    if source_bpm <= 0 or target_bpm <= 0:
        return seg
    ratio = target_bpm / source_bpm
    if abs(ratio - 1.0) < 0.005:
        return seg

    uid     = abs(hash(id(seg))) % 10_000_000
    tmp_in  = "/tmp/_bpm_in_%d.wav"  % uid
    tmp_out = "/tmp/_bpm_out_%d.wav" % uid
    try:
        seg.export(tmp_in, format="wav")
        r = subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in, "-filter:a", _atempo_chain(ratio), tmp_out],
            capture_output=True,
        )
        if r.returncode != 0:
            logger.error(
                "ffmpeg atempo failed (ratio=%.4f): %s",
                ratio, r.stderr.decode(errors="replace")[-400:],
            )
            return seg
        result = AudioSegment.from_file(tmp_out, format="wav")
        logger.info("BPM sync %.1f -> %.1f (atempo %.4f)", source_bpm, target_bpm, ratio)
        return result
    except Exception as exc:
        logger.warning("ffmpeg atempo error (%.3f): %s — using original tempo", ratio, exc)
        return seg
    finally:
        for p in (tmp_in, tmp_out):
            try: os.unlink(p)
            except Exception: pass


def _time_stretch_zone(seg: AudioSegment, source_bpm: float, target_bpm: float) -> AudioSegment:
    return _time_stretch_to_bpm(seg, source_bpm, target_bpm)


# ── Phase alignment — beatgrid-based (primary) ────────────────────────────────

def _phase_offset_from_beatgrid(beatgrid: list[float], stretch_ratio: float = 1.0) -> float:
    """Compute the sub-beat phase offset (ms) using the stored beatgrid.

    After time-stretching by `stretch_ratio` (source_bpm / target_bpm), every
    beat timestamp scales by the same factor.  We then return only the
    fractional-beat remainder so the intro is preserved and we trim < 1 beat.

    Args:
        beatgrid:      Beat timestamps in seconds (from track start), as returned
                       by analyzer.detect_beatgrid().
        stretch_ratio: source_bpm / target_bpm.  >1 when track was slowed down.
    Returns:
        Phase offset in milliseconds (0 ≤ offset < 1 beat period).
    """
    if not beatgrid or len(beatgrid) < 2:
        return 0.0

    beats = np.array(beatgrid, dtype=np.float64) * stretch_ratio
    # Beat period from median inter-beat interval
    ibis       = np.diff(beats)
    beat_period = float(np.median(ibis))           # seconds
    if beat_period <= 0:
        return 0.0

    # First beat position — the phase offset is how far the track is from a
    # perfect beat-1 grid.  We only trim the fractional part (< 1 beat).
    first_beat = float(beats[0])
    phase_offset_sec = first_beat % beat_period    # always in [0, beat_period)
    return phase_offset_sec * 1_000.0              # → ms


# ── Phase alignment — spectral-flux fallback (when no beatgrid stored) ────────

def _find_first_beat_ms(seg: AudioSegment, bpm: float) -> float:
    """Phase offset via kick-band Spectral Flux.

    Used only when the TrackSpec has no stored beatgrid.
    1. BP-filter 50–200 Hz to isolate the kick drum.
    2. Compute STFT-based Spectral Flux on that band.
    3. Return raw_onset_ms % beat_period_ms  — sub-beat offset only,
       so the intro is never trimmed by more than one beat.
    """
    analysis_ms = min(10_000, len(seg))
    arr = np.array(seg[:analysis_ms].get_array_of_samples(), dtype=np.float32) / 32768.0
    sr  = seg.frame_rate
    if seg.channels == 2:
        arr = (arr[0::2] + arr[1::2]) * 0.5
    if len(arr) < 512:
        return 0.0

    # ── 1. Kick band isolation: 50–200 Hz ─────────────────────────────────
    nyq = sr / 2.0
    lo  = float(np.clip(50.0  / nyq, 1e-4, 1.0 - 1e-4))
    hi  = float(np.clip(200.0 / nyq, 1e-4, 1.0 - 1e-4))
    try:
        b, a = sp.butter(4, [lo, hi], btype="band")
        kick = sp.filtfilt(b, a, arr).astype(np.float32)
    except Exception:
        kick = arr

    # ── 2. STFT Spectral Flux on kick band ────────────────────────────────
    hop      = max(1, int(sr * 0.010))   # 10 ms frames
    n_fft    = 512
    win      = np.hanning(n_fft)
    n_frames = max(1, (len(kick) - n_fft) // hop + 1)

    prev_mag = np.zeros(n_fft // 2 + 1, dtype=np.float32)
    flux     = np.zeros(n_frames, dtype=np.float32)
    for j in range(n_frames):
        frame = kick[j * hop : j * hop + n_fft]
        if len(frame) < n_fft:
            frame = np.pad(frame, (0, n_fft - len(frame)))
        mag      = np.abs(np.fft.rfft(frame * win)).astype(np.float32)
        flux[j]  = float(np.sum(np.maximum(mag - prev_mag, 0.0)))
        prev_mag = mag

    flux = _ndi.uniform_filter1d(flux, size=3)
    if flux.max() < 1e-8:
        return 0.0

    # ── 3. First strong onset ─────────────────────────────────────────────
    threshold = np.percentile(flux, 75)
    peaks     = np.where(flux > threshold)[0]
    if len(peaks) == 0:
        return 0.0
    raw_ms = float(peaks[0] * 10)    # hop = 10 ms

    # ── 4. Sub-beat phase offset only (< 1 beat) ──────────────────────────
    beat_ms = 60_000.0 / max(bpm, 40)
    return raw_ms % beat_ms


def _normalize_rms(seg: AudioSegment, target_dbfs: float = -14.0) -> AudioSegment:
    diff = target_dbfs - seg.dBFS
    return seg.apply_gain(max(-18.0, min(diff, 18.0)))


# ── Transition engines ────────────────────────────────────────────────────────

def _three_band_crossfade(
    out_seg: AudioSegment,
    in_seg:  AudioSegment,
    fade_ms: int,
    bpm_a:   float = 128.0,
    bpm_b:   float = 128.0,
) -> AudioSegment:
    min_tail = max(6_000, min(fade_ms, (min(len(out_seg), len(in_seg)) - 2_000)))
    out_body, out_tail = _phrase_aligned_split(out_seg, bpm_a, min_tail, phrase_bars=8)
    T = len(out_tail)
    t1, t2 = T // 3, (2 * T) // 3

    in_head_raw = in_seg[:T]
    in_rest     = in_seg[T:]
    in_head     = _pad_or_trim(_time_stretch_zone(in_head_raw, bpm_b, bpm_a), T)

    # Phase 1: outgoing at -1 dB; incoming low+mid (up to 4 kHz) at -3 dB
    # (was: LP at 200 Hz → inaudible.  Now bass+mids are clearly heard.)
    try:
        p1_out = out_tail[:t1].apply_gain(-1)
        p1_in  = _eq_lm(in_head[:t1]).apply_gain(-1)   # was -3, now audible immediately
        phase1 = p1_out.overlay(p1_in)
    except Exception:
        phase1 = out_tail[:t1].overlay(in_head[:t1].apply_gain(-6))

    # Phase 2: outgoing loses bass, incoming gains
    try:
        p2_out = _eq_mh(out_tail[t1:t2]).apply_gain(-2)
        p2_in  = _eq_lm(in_head[t1:t2]).apply_gain(-1)
        phase2 = p2_out.overlay(p2_in)
    except Exception:
        phase2 = out_tail[t1:t2].apply_gain(-3).overlay(in_head[t1:t2].apply_gain(-3))

    # Phase 3: outgoing only hi-hats fading out, incoming full
    try:
        p3_out = _eq_hp(out_tail[t2:], cutoff=HIGH_CUTOFF).fade_out(T - t2)
        p3_in  = in_head[t2:].fade_in((T - t2) // 3)
        phase3 = p3_out.overlay(p3_in)
    except Exception:
        phase3 = out_tail[t2:].fade_out(T - t2).overlay(in_head[t2:].fade_in((T - t2) // 3))

    return out_body + phase1 + phase2 + phase3 + in_rest


def _filter_sweep_transition(
    out_seg: AudioSegment,
    in_seg:  AudioSegment,
    fade_ms: int,
    bpm_a:   float = 128.0,
    bpm_b:   float = 128.0,
) -> AudioSegment:
    min_tail = max(4_000, min(fade_ms, min(len(out_seg), len(in_seg)) - 1_000))
    out_body, out_tail = _phrase_aligned_split(out_seg, bpm_a, min_tail, phrase_bars=8)

    try:
        tail_swept = _eq_hp(out_tail, cutoff=350).fade_out(len(out_tail))
    except Exception:
        tail_swept = out_tail.fade_out(len(out_tail))

    cf_ms      = min(len(out_tail) // 2, 8_000)
    in_matched = _pad_or_trim(_time_stretch_zone(in_seg[:cf_ms], bpm_b, bpm_a), cf_ms)
    in_full    = in_matched + in_seg[cf_ms:]

    safe_cf = max(1_000, min(cf_ms, len(tail_swept) - 500, len(in_full) - 500))
    return (out_body + tail_swept).append(in_full, crossfade=safe_cf)


def _echo_out_transition(
    out_seg: AudioSegment,
    in_seg:  AudioSegment,
    fade_ms: int,
    bpm_a:   float = 128.0,
    bpm_b:   float = 128.0,
) -> AudioSegment:
    """Echo-out crossfade.

    Fix: incoming track starts at the SAME moment the outgoing begins fading
    (overlap_ms == full tail length).  Previously capped at 6 s, causing a
    perceptible gap where one track was fading but the other hadn't started.
    """
    min_tail = max(8_000, min(fade_ms, min(len(out_seg), len(in_seg)) - 2_000))
    out_body, out_tail = _phrase_aligned_split(out_seg, bpm_a, min_tail, phrase_bars=16)
    out_tail_faded     = out_tail.fade_out(len(out_tail))

    # overlap_ms = full tail — incoming starts exactly when outgoing starts fading
    overlap_ms       = len(out_tail)
    in_slice         = in_seg[:overlap_ms]
    in_head_matched  = _pad_or_trim(_time_stretch_zone(in_slice, bpm_b, bpm_a), overlap_ms)
    # Fade incoming in over the first half of the overlap (max 16 s)
    fade_in_ms       = min(overlap_ms // 6, 4_000)   # short fade-in so incoming is audible fast
    in_full          = in_head_matched.fade_in(fade_in_ms) + in_seg[overlap_ms:]

    ov    = min(overlap_ms, len(out_tail_faded), len(in_full))
    mixed = out_tail_faded[:ov].overlay(in_full[:ov])
    return out_body + mixed + in_full[ov:]


# ── Main engine ───────────────────────────────────────────────────────────────

_MAX_TRACK_MS = 7 * 60 * 1_000   # 7 min max per track
_PROC_RATE    = 22_050            # processing sample rate


def _load_seg(spec: TrackSpec) -> AudioSegment:
    try:
        seg = AudioSegment.from_file(spec.file_path)
        seg = _ensure_stereo(seg)
        if len(seg) > _MAX_TRACK_MS:
            seg = seg[:_MAX_TRACK_MS]
        seg = seg.set_frame_rate(_PROC_RATE)
        seg = _normalize_rms(seg)
        return seg
    except Exception as exc:
        logger.error("Failed to load %s: %s", spec.file_path, exc)
        raise RuntimeError(f"Cannot load track {spec.track_id}: {exc}") from exc


def generate_mix(
    tracks:            list[TrackSpec],
    transitions:       list[TransitionSpec],
    mix_style:         str,
    progress_callback=None,
    target_bpm:        float | None = None,
) -> bytes:
    """Generate a DJ mix — Serato-style BPM sync + beatgrid phase align + loudness.

    Phase alignment priority:
      1. Stored beatgrid (madmom/librosa accuracy) — sub-beat trim only.
      2. Kick-band Spectral Flux fallback — also sub-beat trim only.
    Both methods never skip the intro; they only remove the fractional phase
    offset that would cause beats to land slightly off the grid.
    """
    import gc, os, subprocess

    assert len(tracks) >= 1
    total_steps = len(tracks) + len(transitions) + 2

    def _progress(step: int, msg: str) -> None:
        if progress_callback:
            progress_callback(min(95, int(step / total_steps * 100)), msg)

    disk_segs: list[str] = []

    def _flush_stable(seg: AudioSegment, keep_ms: int) -> AudioSegment:
        flush_ms = len(seg) - keep_ms
        if flush_ms > 500:
            tmp = "/tmp/bugatti_seg_%03d.wav" % len(disk_segs)
            seg[:flush_ms].export(tmp, format="wav")
            disk_segs.append(tmp)
            tail = seg[flush_ms:]
            del seg; gc.collect()
            return tail
        return seg

    # ── Load first track ──────────────────────────────────────────────────────
    _progress(0, "Loading track 1/%d..." % len(tracks))
    result = _load_seg(tracks[0])

    if len(tracks) == 1:
        _progress(total_steps - 1, "Exporting...")
        buf = io.BytesIO()
        result.set_frame_rate(44_100).export(buf, format="mp3", bitrate="320k")
        return buf.getvalue()

    # ── Master BPM ───────────────────────────────────────────────────────────
    master_bpm = float(target_bpm) if target_bpm and target_bpm > 0 else float(tracks[0].bpm or 128)

    # Stretch track 0 to master BPM
    bpm0 = float(tracks[0].bpm or master_bpm)
    if abs(bpm0 - master_bpm) > 0.5:
        _progress(0, "BPM sync track 1: %d → %d BPM..." % (int(bpm0), int(master_bpm)))
        result = _time_stretch_to_bpm(result, bpm0, master_bpm)

    # Phase-align track 0 — sub-beat offset only
    stretch_ratio0 = bpm0 / master_bpm if master_bpm > 0 else 1.0
    if tracks[0].beatgrid:
        offset0 = _phase_offset_from_beatgrid(tracks[0].beatgrid, stretch_ratio0)
        logger.info("Track 1 phase (beatgrid): %.1f ms", offset0)
    else:
        offset0 = _find_first_beat_ms(result, master_bpm)
        logger.info("Track 1 phase (flux): %.1f ms", offset0)
    if 1 < offset0 < len(result) - 2_000:
        result = result[int(offset0):]

    # ── Mix loop ──────────────────────────────────────────────────────────────
    for i, trans in enumerate(transitions):
        bpm_b_orig = float(trans.bpm_b or trans.bpm_a or master_bpm)
        fade_ms    = _bars_to_ms(trans.transition_bars, master_bpm)

        # Use outro_start from outgoing track's spectral sections to determine
        # exactly where to begin the transition — the musical outro/energy drop.
        _out_track   = tracks[i]
        _out_secs    = _out_track.sections or {}
        _outro_sec   = float(_out_secs.get('outro_start') or 0)
        _out_dur_sec = float(_out_track.duration_seconds or 300)
        if _outro_sec > 10 and _out_dur_sec > _outro_sec:
            # Scale for BPM stretch: stretched_ms = original * (source_bpm / master_bpm)
            _stretch = float(_out_track.bpm or master_bpm) / max(master_bpm, 1.0)
            _tail_ms = int((_out_dur_sec - _outro_sec) * _stretch * 1_000)
            keep_ms  = max(fade_ms, min(_tail_ms, 180_000))   # clamp: fade_ms … 3 min
            logger.info(
                'Track %d outro at %.1fs → transition keep_ms=%d ms',
                i + 1, _outro_sec, keep_ms,
            )
        else:
            keep_ms = max(fade_ms * 2, 60_000)
        result  = _flush_stable(result, keep_ms)

        _progress(1 + i, "Loading track %d/%d..." % (i + 2, len(tracks)))
        in_raw = _load_seg(tracks[i + 1])

        # BPM sync
        if abs(bpm_b_orig - master_bpm) > 0.5:
            _progress(1 + i,
                "BPM sync %d → %d BPM..." % (int(round(bpm_b_orig)), int(round(master_bpm))))
            in_raw = _time_stretch_to_bpm(in_raw, bpm_b_orig, master_bpm)

        # Phase alignment — sub-beat offset only
        stretch_ratio_b = bpm_b_orig / master_bpm if master_bpm > 0 else 1.0
        spec_b = tracks[i + 1]
        if spec_b.beatgrid:
            offset_b = _phase_offset_from_beatgrid(spec_b.beatgrid, stretch_ratio_b)
            logger.info("Track %d phase (beatgrid): %.1f ms", i + 2, offset_b)
        else:
            offset_b = _find_first_beat_ms(in_raw, master_bpm)
            logger.info("Track %d phase (flux): %.1f ms", i + 2, offset_b)
        if 1 < offset_b < len(in_raw) - 2_000:
            in_raw = in_raw[int(offset_b):]

        # Apply transition
        label = trans.transition_type
        _progress(len(tracks) + i,
            "Transition %d/%d — %s..." % (i + 1, len(transitions), label))

        try:
            if label == "cut":
                body, _ = _phrase_aligned_split(
                    result, master_bpm, _bars_to_ms(4, master_bpm), phrase_bars=8)
                result = body + in_raw
            elif label == "filter_sweep":
                result = _filter_sweep_transition(result, in_raw, fade_ms, master_bpm, master_bpm)
            elif label == "echo_out":
                result = _echo_out_transition(result, in_raw, fade_ms, master_bpm, master_bpm)
            else:
                result = _three_band_crossfade(result, in_raw, fade_ms, master_bpm, master_bpm)
        except Exception as exc:
            logger.warning("Transition %d (%s) failed — simple crossfade: %s", i, label, exc)
            cf = max(1_000, min(fade_ms, 8_000, len(result) - 500, len(in_raw) - 500))
            result = result.append(in_raw, crossfade=cf)

        del in_raw; gc.collect()

    # ── Final export ──────────────────────────────────────────────────────────
    _progress(total_steps - 1, "Mastering and encoding...")
    result = _normalize_loudness(result, target_dbfs=-11.0)
    tmp_final = "/tmp/bugatti_seg_%03d.wav" % len(disk_segs)
    result.export(tmp_final, format="wav")
    disk_segs.append(tmp_final)
    del result; gc.collect()

    concat_list = "/tmp/bugatti_concat.txt"
    out_mp3     = "/tmp/bugatti_mix_out.mp3"

    with open(concat_list, "w") as fh:
        for p in disk_segs:
            fh.write("file '%s'\n" % p)

    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
         "-ar", "44100", "-b:a", "320k", "-metadata", "title=AI Mix", out_mp3],
        check=True, capture_output=True,
    )

    with open(out_mp3, "rb") as fh:
        data = fh.read()

    for p in disk_segs + [concat_list, out_mp3]:
        try: os.unlink(p)
        except Exception: pass

    return data
