"""
DJ mix generation engine — professional edition v6.

Key fixes over v5:
  - BEAT-PERFECT SYNC: Mix point split now happens UPSTREAM (before crossfade),
    ensuring out_tail always starts at an exact 8-bar phrase boundary from beat-1.
    v5 was splitting inside the crossfade from the tail's own 0, which drifted
    from the actual beat grid.
  - EARLIER MIX POINT: Uses MIN(outro_start, 32-bars-from-end) so mixing always
    starts early enough. v5 sometimes missed the outro and started too late.
  - CLEAN PHASE TRACKING: After every crossfade, incoming track's beat-1 is at
    position 0 of current_seg. Mix point for the next track is always calculated
    from beat-1 = position 0. No complex offset tracking needed.
  - Beatgrid-aware phrase snapping for the most precise mix-start calculation.
"""

from __future__ import annotations

import gc
import io
import logging
import os
import subprocess
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

try:
    import librosa as _librosa_gen
    _HAS_LIBROSA_GEN = True
    logger.info("librosa available — pitch-preserving BPM sync enabled")
except Exception:
    _HAS_LIBROSA_GEN = False
    logger.warning("librosa not available — BPM sync falls back to ffmpeg atempo")

TransitionType = Literal["cut", "crossfade", "filter_sweep", "echo_out"]

LOW_CUTOFF  = 200
HIGH_CUTOFF = 4_000


@dataclass
class TrackSpec:
    track_id:         str
    file_path:        str
    bpm:              float
    energy:           int
    duration_seconds: float
    sections:         dict
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
    return seg.apply_gain(max(-6.0, min(diff, 9.0)))


def _pad_or_trim(seg: AudioSegment, target_ms: int) -> AudioSegment:
    if len(seg) < target_ms:
        return seg + AudioSegment.silent(target_ms - len(seg), frame_rate=seg.frame_rate)
    return seg[:target_ms]


def _seg_to_float(seg: AudioSegment) -> np.ndarray:
    return np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0


def _float_to_seg(arr: np.ndarray, sr: int, channels: int) -> AudioSegment:
    int16 = (np.clip(arr, -1.0, 1.0) * 32767).astype(np.int16)
    return AudioSegment(int16.tobytes(), frame_rate=sr, sample_width=2, channels=channels)


def _butter_coeffs(cutoff: float, sr: int, btype: str, order: int = 4):
    nyq  = sr / 2.0
    norm = float(np.clip(cutoff / nyq, 1e-4, 1 - 1e-4))
    return sp.butter(order, norm, btype=btype)


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


def _eq_hp(seg: AudioSegment, cutoff: float = LOW_CUTOFF) -> AudioSegment:
    b, a = _butter_coeffs(cutoff, seg.frame_rate, "high")
    return _float_to_seg(_filtfilt_ch(_seg_to_float(seg), seg.channels, b, a),
                         seg.frame_rate, seg.channels)


def _normalize_rms(seg: AudioSegment, target_dbfs: float = -14.0) -> AudioSegment:
    diff = target_dbfs - seg.dBFS
    return seg.apply_gain(max(-18.0, min(diff, 18.0)))


# ── Beatmatching ──────────────────────────────────────────────────────────────

def _atempo_chain(ratio: float) -> str:
    filters = []
    r = float(ratio)
    while r > 2.0:  filters.append("atempo=2.0"); r /= 2.0
    while r < 0.5:  filters.append("atempo=0.5"); r /= 0.5
    filters.append("atempo=%.6f" % r)
    return ",".join(filters)


def _time_stretch_to_bpm(seg: AudioSegment, source_bpm: float, target_bpm: float) -> AudioSegment:
    """Pitch-preserving BPM sync: librosa phase vocoder → ffmpeg atempo fallback."""
    if source_bpm <= 0 or target_bpm <= 0:
        return seg
    ratio = target_bpm / source_bpm
    if abs(ratio - 1.0) < 0.005:
        return seg

    sr       = seg.frame_rate
    channels = seg.channels
    arr      = np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0

    if _HAS_LIBROSA_GEN:
        try:
            if channels == 2:
                L = _librosa_gen.effects.time_stretch(arr[0::2].copy(), rate=ratio)
                R = _librosa_gen.effects.time_stretch(arr[1::2].copy(), rate=ratio)
                n   = min(len(L), len(R))
                out = np.empty(n * 2, dtype=np.float32)
                out[0::2] = L[:n]; out[1::2] = R[:n]
            else:
                out = _librosa_gen.effects.time_stretch(arr.copy(), rate=ratio)
            int16  = (np.clip(out, -1.0, 1.0) * 32767).astype(np.int16)
            result = AudioSegment(int16.tobytes(), frame_rate=sr, sample_width=2, channels=channels)
            logger.info("BPM sync %.1f→%.1f via librosa (ratio=%.4f, pitch intact)", source_bpm, target_bpm, ratio)
            return result
        except Exception as exc:
            logger.warning("librosa time_stretch failed (ratio=%.4f): %s — trying ffmpeg", ratio, exc)

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
            logger.error("ffmpeg atempo FAILED stderr: %s", r.stderr.decode(errors="replace")[-400:])
            return seg
        result = AudioSegment.from_file(tmp_out, format="wav")
        logger.info("BPM sync %.1f→%.1f via ffmpeg atempo (ratio=%.4f)", source_bpm, target_bpm, ratio)
        return result
    except Exception as exc:
        logger.warning("ffmpeg atempo error: %s — keeping original tempo", exc)
        return seg
    finally:
        for p in (tmp_in, tmp_out):
            try: os.unlink(p)
            except Exception: pass


# ── Phase alignment ───────────────────────────────────────────────────────────

def _phase_offset_from_beatgrid(beatgrid: list[float], stretch_ratio: float = 1.0) -> float:
    """Sub-beat phase offset (ms) using stored beatgrid.

    Returns the fractional-beat offset so that after trimming this amount
    from the track start, beat-1 lands exactly at t=0 ms.
    """
    if not beatgrid or len(beatgrid) < 2:
        return 0.0
    beats = np.array(beatgrid, dtype=np.float64) * stretch_ratio
    ibis        = np.diff(beats)
    beat_period = float(np.median(ibis))
    if beat_period <= 0:
        return 0.0
    first_beat      = float(beats[0])
    phase_offset_sec = first_beat % beat_period
    return phase_offset_sec * 1_000.0


def _find_first_beat_ms(seg: AudioSegment, bpm: float) -> float:
    """Phase offset via kick-band spectral flux (fallback when no beatgrid)."""
    analysis_ms = min(10_000, len(seg))
    arr = np.array(seg[:analysis_ms].get_array_of_samples(), dtype=np.float32) / 32768.0
    sr  = seg.frame_rate
    if seg.channels == 2:
        arr = (arr[0::2] + arr[1::2]) * 0.5
    if len(arr) < 512:
        return 0.0

    nyq = sr / 2.0
    lo  = float(np.clip(50.0  / nyq, 1e-4, 1.0 - 1e-4))
    hi  = float(np.clip(200.0 / nyq, 1e-4, 1.0 - 1e-4))
    try:
        b, a = sp.butter(4, [lo, hi], btype="band")
        kick = sp.filtfilt(b, a, arr).astype(np.float32)
    except Exception:
        kick = arr

    hop      = max(1, int(sr * 0.010))
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

    threshold = np.percentile(flux, 75)
    peaks     = np.where(flux > threshold)[0]
    if len(peaks) == 0:
        return 0.0
    raw_ms   = float(peaks[0] * 10)
    beat_ms  = 60_000.0 / max(bpm, 40)
    return raw_ms % beat_ms


# ── Mix point calculation (the core v6 fix) ───────────────────────────────────

def _calculate_mix_point_ms(
    spec: TrackSpec,
    master_bpm: float,
    phrase_ms: int,
    min_tail_ms: int,
    current_seg_len_ms: int,
    beatgrid: list[float] | None = None,
) -> int:
    """Calculate the phrase-perfect mix start position.

    Key insight: current_seg always starts at beat-1 of the outgoing track
    (after phase trim and transitions). So mix_start_ms is measured directly
    from beat-1 = position 0 of current_seg.

    Algorithm:
      1. Calculate outro_start in stretched time (from beat-1).
      2. Calculate 32-bars-from-end as safety net.
      3. Use the EARLIER of the two → avoids mixing too late.
      4. Snap DOWN to nearest 8-bar phrase boundary.
      5. If beatgrid available, use it for sub-bar precision.
      6. Clamp to valid range.
    """
    bpm_orig = float(spec.bpm or master_bpm)

    # Stretch factor: track is sped up or slowed to master_bpm
    stretch_factor = bpm_orig / master_bpm

    # Use actual audio length (current_seg_len_ms) for the 32-bar rule.
    # spec.duration_seconds can be 0 or stale — don't rely on it for positioning.
    bars32_ms    = _bars_to_ms(32, master_bpm)
    bars32_start = max(0, current_seg_len_ms - bars32_ms)

    # outro_start from spectral analysis (in original time → scale to stretched)
    outro_sec = float((spec.sections or {}).get("outro_start") or 0)
    if outro_sec > 0:
        # Scale outro_sec to stretched time, then convert to ms from seg start
        # current_seg length ≈ duration_stretched; use ratio with actual length
        orig_dur_sec = float(spec.duration_seconds or 0)
        if orig_dur_sec > 0:
            outro_ratio = outro_sec / orig_dur_sec
        else:
            outro_ratio = 0.75  # sensible default: 75% through the track
        outro_ms = int(outro_ratio * current_seg_len_ms)
    else:
        outro_ms = 0

    # 32-bars-from-end (safety: always start mixing before last 32 bars)

    # Choose the earlier of outro and 32-bar limit
    if outro_ms > 0:
        target_ms = min(outro_ms, bars32_start)
    else:
        target_ms = bars32_start

    target_ms = max(0, target_ms)

    # ── Beatgrid-aware phrase snapping ─────────────────────────────────────
    # If we have the beatgrid, find the exact phrase boundary in beat timestamps
    # rather than using heuristic ms arithmetic.
    mix_start_ms: int

    if beatgrid and len(beatgrid) >= 2 and phrase_ms > 0:
        beats = [b * stretch_factor for b in beatgrid]
        beats_per_phrase = 32  # 8-bar phrase = 32 beats in 4/4

        # Convert target_ms to seconds
        target_sec = target_ms / 1000.0

        # Walk through beat indices; find the last phrase-boundary beat ≤ target
        best_beat_sec = 0.0
        for idx in range(0, len(beats) - beats_per_phrase, beats_per_phrase):
            if beats[idx] <= target_sec:
                best_beat_sec = beats[idx]
            else:
                break

        mix_start_ms = int(best_beat_sec * 1000)
        logger.info(
            "Mix point (beatgrid): %.1f s (target=%.1f s, outro=%.1f s, 32bars=%.1f s)",
            best_beat_sec, target_sec, outro_sec, bars32_start / 1000.0,
        )
    else:
        # Heuristic: snap DOWN to nearest 8-bar phrase
        if phrase_ms > 0 and target_ms > 0:
            n = target_ms // phrase_ms  # floor = last phrase at or before target
            mix_start_ms = int(n * phrase_ms)
        else:
            mix_start_ms = target_ms
        logger.info(
            "Mix point (heuristic): %d ms (target=%d ms, outro=%.1f s, 32bars=%d ms)",
            mix_start_ms, target_ms, outro_sec, bars32_start,
        )

    # Clamp to valid range
    max_mix_start = max(0, current_seg_len_ms - min_tail_ms)
    mix_start_ms  = max(0, min(mix_start_ms, max_mix_start))

    return mix_start_ms


# ── Transition engines (v6: take pre-split out_tail, no internal split) ───────

def _three_band_crossfade_v2(
    out_tail: AudioSegment,
    in_seg: AudioSegment,
    bpm: float = 128.0,
) -> AudioSegment:
    """Professional equal-power DJ crossfade with bass EQ swap.

    v6 change: receives the pre-split out_tail (already at a phrase boundary
    from beat-1). Fades out the ENTIRE out_tail while fading in the first
    len(out_tail) ms of in_seg. Returns crossfade_zone + in_seg remainder.

    This guarantees beat-in-beat alignment:
      - out_tail starts at n*phrase_ms from beat-1 → phrase boundary.
      - in_seg starts at beat-1 (phase-trimmed) → also phrase boundary.
      - Both overlapping → downbeats land together.
    """
    T        = len(out_tail)
    in_head  = _pad_or_trim(in_seg[:T], T)
    in_rest  = in_seg[T:]

    sr = out_tail.frame_rate
    ch = out_tail.channels

    out_arr = _seg_to_float(out_tail)
    in_arr  = _seg_to_float(in_head)
    n       = min(len(out_arr), len(in_arr))
    out_arr = out_arr[:n]
    in_arr  = in_arr[:n]

    n_ch = n // ch if ch > 1 else n
    t          = np.linspace(0.0, 1.0, n_ch, dtype=np.float32)
    g_out      = np.cos(t * np.pi / 2.0)
    g_in       = np.sin(t * np.pi / 2.0)
    t_bass     = np.clip((t - 0.25) / 0.50, 0.0, 1.0)
    g_bass_out = np.cos(t_bass * np.pi / 2.0)
    g_bass_in  = np.sin(t_bass * np.pi / 2.0)

    if ch == 2:
        g_out      = np.repeat(g_out,      2)[:n]
        g_in       = np.repeat(g_in,       2)[:n]
        g_bass_out = np.repeat(g_bass_out, 2)[:n]
        g_bass_in  = np.repeat(g_bass_in,  2)[:n]

    try:
        b_lp, a_lp = _butter_coeffs(LOW_CUTOFF, sr, "low",  order=4)
        b_hp, a_hp = _butter_coeffs(LOW_CUTOFF, sr, "high", order=4)

        def _filt2(arr: np.ndarray, b, a) -> np.ndarray:
            if ch == 2:
                L  = sp.filtfilt(b, a, arr[0::2]).astype(np.float32)
                R  = sp.filtfilt(b, a, arr[1::2]).astype(np.float32)
                nn = min(len(L), len(R))
                r  = np.empty(nn * 2, dtype=np.float32)
                r[0::2] = L[:nn]; r[1::2] = R[:nn]
                return r
            return sp.filtfilt(b, a, arr).astype(np.float32)

        out_bass = _filt2(out_arr, b_lp, a_lp)[:n]
        out_mids = _filt2(out_arr, b_hp, a_hp)[:n]
        in_bass  = _filt2(in_arr,  b_lp, a_lp)[:n]
        in_mids  = _filt2(in_arr,  b_hp, a_hp)[:n]

        mixed = (
            out_bass * g_bass_out + out_mids * g_out +
            in_bass  * g_bass_in  + in_mids  * g_in
        )
        logger.info(
            "Crossfade v2: equal-power + bass-swap, T=%d ms (%.1f bars @ %.0f BPM) — BEAT ALIGNED",
            T, T / max(_bars_to_ms(1, bpm), 1), bpm,
        )
    except Exception as exc:
        logger.warning("Bass-split crossfade failed (%s) — equal-power fallback", exc)
        mixed = out_arr * g_out + in_arr * g_in

    mixed_seg = _float_to_seg(mixed[:n], sr, ch)
    # Invariant: in_seg's beat-1 is at position 0 of the returned segment.
    return mixed_seg + in_rest


def _filter_sweep_v2(
    out_tail: AudioSegment,
    in_seg: AudioSegment,
    bpm: float = 128.0,
) -> AudioSegment:
    """Filter sweep: high-pass out_tail while fading in in_seg. Pre-split version."""
    T = len(out_tail)
    try:
        swept = _eq_hp(out_tail, cutoff=350).fade_out(T)
    except Exception:
        swept = out_tail.fade_out(T)

    in_head = _pad_or_trim(in_seg[:T], T)
    in_rest = in_seg[T:]

    cf_ms = max(1_000, min(T // 4, 8_000))
    try:
        mixed = swept.append(in_head, crossfade=cf_ms)
    except Exception:
        mixed = swept + in_head

    return mixed + in_rest


def _echo_out_v2(
    out_tail: AudioSegment,
    in_seg: AudioSegment,
    bpm: float = 128.0,
) -> AudioSegment:
    """Echo-out: reverb tail into in_seg intro. Pre-split version."""
    T              = len(out_tail)
    out_tail_faded = out_tail.fade_out(T)
    in_head        = _pad_or_trim(in_seg[:T], T)
    in_rest        = in_seg[T:]

    fade_in_ms = min(T // 6, 4_000)
    in_faded   = in_head.fade_in(fade_in_ms)

    ov    = min(T, len(out_tail_faded), len(in_faded))
    mixed = out_tail_faded[:ov].overlay(in_faded[:ov])
    return mixed + in_rest


# ── Main engine ───────────────────────────────────────────────────────────────

_MAX_TRACK_MS = 7 * 60 * 1_000
_PROC_RATE    = 22_050


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
    """Generate a DJ mix with beat-perfect sync and intelligent mix points.

    v6 algorithm:
      1. Load + BPM-sync + phase-trim each track so beat-1 is at t=0 ms.
      2. For each transition, calculate mix_start_ms via _calculate_mix_point_ms:
           - Uses MIN(outro_start, 32-bars-from-end) to never mix too late.
           - Snaps DOWN to 8-bar phrase boundary from beat-1.
           - With beatgrid: uses actual beat timestamps for sub-bar precision.
      3. Split: out_body = current_seg[:mix_start_ms], out_tail = current_seg[mix_start_ms:]
           out_tail starts at an exact phrase boundary from beat-1.
      4. in_seg (phase-trimmed) also starts at beat-1.
         => out_tail[0] and in_seg[0] are both at a phrase boundary => beats align.
      5. After crossfade: current_seg = crossfade_zone + in_seg[T:]
         in_seg's beat-1 is at position 0 of current_seg => tracking resets.
    """
    assert len(tracks) >= 1

    total_steps = len(tracks) * 2 + len(transitions) + 2
    step_count  = [0]

    def _progress(msg: str) -> None:
        step_count[0] += 1
        if progress_callback:
            progress_callback(min(95, int(step_count[0] / total_steps * 100)), msg)

    # ── Master BPM ────────────────────────────────────────────────────────────
    master_bpm = float(target_bpm) if target_bpm and target_bpm > 0 else float(tracks[0].bpm or 128)
    phrase_ms  = _bars_to_ms(8, master_bpm)

    logger.info("generate_mix: %d tracks, master_bpm=%.1f, style=%s", len(tracks), master_bpm, mix_style)

    # ── Load + sync + phase-trim track 0 ─────────────────────────────────────
    _progress("Loading track 1/%d..." % len(tracks))
    current_seg = _load_seg(tracks[0])

    bpm0 = float(tracks[0].bpm or master_bpm)
    if abs(bpm0 - master_bpm) > 0.5:
        _progress("BPM sync track 1: %d→%d BPM..." % (int(bpm0), int(master_bpm)))
        current_seg = _time_stretch_to_bpm(current_seg, bpm0, master_bpm)
        current_seg = _normalize_rms(current_seg)

    # Phase align: beat-1 at t=0 ms
    stretch0 = bpm0 / master_bpm
    if tracks[0].beatgrid:
        offset0 = _phase_offset_from_beatgrid(tracks[0].beatgrid, stretch0)
        logger.info("Track 1 phase (beatgrid): %.1f ms", offset0)
    else:
        offset0 = _find_first_beat_ms(current_seg, master_bpm)
        logger.info("Track 1 phase (flux): %.1f ms", offset0)
    if 1 < offset0 < len(current_seg) - 2_000:
        current_seg = current_seg[int(offset0):]

    if len(tracks) == 1:
        _progress("Exporting...")
        buf = io.BytesIO()
        current_seg.set_frame_rate(44_100).export(buf, format="mp3", bitrate="320k")
        return buf.getvalue()

    # ── Finished segments (written to disk for memory efficiency) ─────────────
    disk_parts: list[str] = []

    def _save_to_disk(seg: AudioSegment, tag: str) -> str:
        path = "/tmp/bugatti_%s_%03d.wav" % (tag, len(disk_parts))
        seg.export(path, format="wav")
        return path

    # ── Mix loop ──────────────────────────────────────────────────────────────
    for i, trans in enumerate(transitions):
        bpm_b_orig = float(trans.bpm_b or trans.bpm_a or master_bpm)
        fade_ms    = _bars_to_ms(trans.transition_bars, master_bpm)
        min_tail   = max(fade_ms, 8_000)

        # ── Mix point: phrase-aligned from beat-1 of current outgoing track ──
        # current_seg always starts at beat-1 (invariant maintained after each iter).
        mix_start_ms = _calculate_mix_point_ms(
            spec             = tracks[i],
            master_bpm       = master_bpm,
            phrase_ms        = phrase_ms,
            min_tail_ms      = min_tail,
            current_seg_len_ms = len(current_seg),
            beatgrid         = tracks[i].beatgrid,
        )

        logger.info(
            "Track %d/%d: mix_start=%d ms (%.1f bars), seg_len=%d ms",
            i + 1, len(tracks), mix_start_ms,
            mix_start_ms / max(_bars_to_ms(1, master_bpm), 1),
            len(current_seg),
        )

        # Split: body plays as-is; tail is the crossfade zone
        out_body = current_seg[:mix_start_ms]
        out_tail = current_seg[mix_start_ms:]

        # Cap crossfade zone to 32 bars max — avoids OOM on large tails.
        # Anything beyond 32 bars before the mix point becomes extra body.
        max_xfade_ms = _bars_to_ms(32, master_bpm)
        if len(out_tail) > max_xfade_ms:
            extra = out_tail[:-max_xfade_ms]
            out_tail = out_tail[-max_xfade_ms:]
            # extra goes to disk as part of the body
            if len(extra) > 200:
                disk_parts.append(_save_to_disk(extra, "body_extra"))
            del extra

        # Save body to disk
        if len(out_body) > 200:
            disk_parts.append(_save_to_disk(out_body, "body"))
        del out_body
        gc.collect()

        # ── Load + sync + phase-trim incoming track ──────────────────────────
        _progress("Loading track %d/%d..." % (i + 2, len(tracks)))
        in_raw = _load_seg(tracks[i + 1])

        if abs(bpm_b_orig - master_bpm) > 0.5:
            _progress("BPM sync %d→%d BPM..." % (int(round(bpm_b_orig)), int(round(master_bpm))))
            in_raw = _time_stretch_to_bpm(in_raw, bpm_b_orig, master_bpm)
            in_raw = _normalize_rms(in_raw)

        # Phase align incoming: beat-1 at position 0
        stretch_b = bpm_b_orig / master_bpm
        if tracks[i + 1].beatgrid:
            offset_b = _phase_offset_from_beatgrid(tracks[i + 1].beatgrid, stretch_b)
            logger.info("Track %d phase (beatgrid): %.1f ms", i + 2, offset_b)
        else:
            offset_b = _find_first_beat_ms(in_raw, master_bpm)
            logger.info("Track %d phase (flux): %.1f ms", i + 2, offset_b)
        if 1 < offset_b < len(in_raw) - 2_000:
            in_raw = in_raw[int(offset_b):]

        # ── Apply transition ─────────────────────────────────────────────────
        # out_tail starts at mix_start_ms = n*phrase_ms from beat-1 → phrase boundary.
        # in_raw starts at beat-1 (phase-trimmed) → also at phrase boundary.
        # Invariant: after this block, current_seg starts at in_raw's beat-1 (pos 0).

        label = trans.transition_type
        _progress("Transition %d/%d — %s..." % (i + 1, len(transitions), label))

        try:
            if label == "cut":
                # Even a "cut" transition gets a short 2-bar crossfade so the
                # switch is audible but quick — avoids a completely abrupt jump.
                cut_xfade_ms = max(1_000, min(_bars_to_ms(2, master_bpm), len(out_tail) // 2, len(in_raw) // 2))
                current_seg = out_tail.append(in_raw, crossfade=cut_xfade_ms)
            elif label == "filter_sweep":
                current_seg = _filter_sweep_v2(out_tail, in_raw, master_bpm)
            elif label == "echo_out":
                current_seg = _echo_out_v2(out_tail, in_raw, master_bpm)
            else:
                # crossfade (default and most common)
                current_seg = _three_band_crossfade_v2(out_tail, in_raw, master_bpm)
        except Exception as exc:
            logger.warning("Transition %d (%s) failed — simple crossfade: %s", i, label, exc)
            cf = max(1_000, min(fade_ms, 8_000, len(out_tail) - 500, len(in_raw) - 500))
            current_seg = out_tail.append(in_raw, crossfade=cf)

        # After transition: current_seg starts at in_raw's beat-1 (position 0).
        # Invariant maintained: next iteration's _calculate_mix_point_ms
        # correctly measures from beat-1 = position 0 of current_seg.

        del out_tail, in_raw
        gc.collect()

    # ── Final segment ─────────────────────────────────────────────────────────
    _progress("Mastering and encoding...")
    current_seg = _normalize_loudness(current_seg, target_dbfs=-11.0)
    disk_parts.append(_save_to_disk(current_seg, "final"))
    del current_seg
    gc.collect()

    # ── Concatenate all parts via ffmpeg ──────────────────────────────────────
    concat_list = "/tmp/bugatti_concat.txt"
    out_mp3     = "/tmp/bugatti_mix_out.mp3"

    with open(concat_list, "w") as fh:
        for p in disk_parts:
            fh.write("file '%s'\n" % p)

    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
         "-ar", "44100", "-b:a", "320k", "-metadata", "title=AI Mix", out_mp3],
        check=True, capture_output=True,
    )

    with open(out_mp3, "rb") as fh:
        data = fh.read()

    for p in disk_parts + [concat_list, out_mp3]:
        try: os.unlink(p)
        except Exception: pass

    return data
