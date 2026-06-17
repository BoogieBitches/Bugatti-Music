"""
DJ mix generation engine — professional edition v4.

Key features:
  - Phrase-aligned transitions: snaps start to the nearest 8-bar boundary.
  - High-quality BPM beatmatching via pyrubberband (falls back to scipy resample).
  - Scipy Butterworth 3-band EQ crossfade — mirrors a real DJ mixer:
      LOW  (0 – 200 Hz)   kick / bass
      MID  (200 – 4000 Hz) melody / harmony
      HIGH (4000 Hz+)      hi-hats / air / brightness
  - Filter-sweep and echo-out with phrase alignment + beatmatching.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Literal

import numpy as np
from scipy import signal as sp
from pydub import AudioSegment

logger = logging.getLogger(__name__)

# ── Optional high-quality time-stretcher ──────────────────────────────────────
try:
    import pyrubberband as pyrb
    _HAS_PYRB = True
    logger.info("pyrubberband available — high-quality time-stretch enabled")
except Exception:
    _HAS_PYRB = False
    logger.info("pyrubberband not found — falling back to scipy resample")

TransitionType = Literal["cut", "crossfade", "filter_sweep", "echo_out"]

# ── DJ mixer band boundaries (Hz) ─────────────────────────────────────────────
LOW_CUTOFF  = 200    # below → kick / bass
HIGH_CUTOFF = 4_000  # above → hi-hats / air


@dataclass
class TrackSpec:
    track_id: str
    file_path: str
    bpm: float
    energy: int
    duration_seconds: float
    sections: dict


@dataclass
class TransitionSpec:
    from_track_id: str
    to_track_id: str
    transition_type: TransitionType
    transition_bars: int
    bpm_a: float
    bpm_b: float = 128.0


# ── Utilities ─────────────────────────────────────────────────────────────────

def _bars_to_ms(bars: int, bpm: float) -> int:
    beat_ms = 60_000 / max(bpm, 60)
    return int(bars * 4 * beat_ms)


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
    """Snap a position to the nearest musical phrase boundary."""
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
    """Split seg at the nearest phrase boundary that still leaves >= min_tail_ms."""
    raw_split = len(seg) - min_tail_ms
    snapped = _snap_to_phrase(raw_split, bpm, phrase_bars)
    snapped = max(0, min(snapped, len(seg) - min_tail_ms))
    return seg[:snapped], seg[snapped:]


# ── Scipy 3-band EQ ───────────────────────────────────────────────────────────

def _seg_to_float(seg: AudioSegment) -> np.ndarray:
    return np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0


def _float_to_seg(arr: np.ndarray, sr: int, channels: int) -> AudioSegment:
    int16 = (np.clip(arr, -1.0, 1.0) * 32767).astype(np.int16)
    return AudioSegment(int16.tobytes(), frame_rate=sr, sample_width=2, channels=channels)


def _butter_coeffs(cutoff: float, sr: int, btype: str, order: int = 4):
    nyq = sr / 2.0
    norm = float(np.clip(cutoff / nyq, 1e-4, 1 - 1e-4))
    return sp.butter(order, norm, btype=btype)


def _band_coeffs(low: float, high: float, sr: int, order: int = 4):
    nyq = sr / 2.0
    lo = float(np.clip(low / nyq, 1e-4, 1 - 1e-4))
    hi = float(np.clip(high / nyq, 1e-4, 1 - 1e-4))
    if lo >= hi:
        return None
    return sp.butter(order, [lo, hi], btype="band")


def _filtfilt_channels(raw: np.ndarray, channels: int, b, a) -> np.ndarray:
    if channels == 2:
        L = sp.filtfilt(b, a, raw[0::2]).astype(np.float32)
        R = sp.filtfilt(b, a, raw[1::2]).astype(np.float32)
        n = min(len(L), len(R))
        out = np.empty(n * 2, dtype=np.float32)
        out[0::2] = L[:n]
        out[1::2] = R[:n]
    else:
        out = sp.filtfilt(b, a, raw).astype(np.float32)
    return out


def _eq_lp(seg: AudioSegment, cutoff: float = LOW_CUTOFF) -> AudioSegment:
    b, a = _butter_coeffs(cutoff, seg.frame_rate, "low")
    raw = _seg_to_float(seg)
    return _float_to_seg(_filtfilt_channels(raw, seg.channels, b, a), seg.frame_rate, seg.channels)


def _eq_hp(seg: AudioSegment, cutoff: float = LOW_CUTOFF) -> AudioSegment:
    b, a = _butter_coeffs(cutoff, seg.frame_rate, "high")
    raw = _seg_to_float(seg)
    return _float_to_seg(_filtfilt_channels(raw, seg.channels, b, a), seg.frame_rate, seg.channels)


def _eq_bp(seg: AudioSegment, low: float = LOW_CUTOFF, high: float = HIGH_CUTOFF) -> AudioSegment:
    coeffs = _band_coeffs(low, high, seg.frame_rate)
    if coeffs is None:
        return seg
    b, a = coeffs
    raw = _seg_to_float(seg)
    return _float_to_seg(_filtfilt_channels(raw, seg.channels, b, a), seg.frame_rate, seg.channels)


def _eq_lm(seg: AudioSegment) -> AudioSegment:
    b, a = _butter_coeffs(HIGH_CUTOFF, seg.frame_rate, "low")
    raw = _seg_to_float(seg)
    return _float_to_seg(_filtfilt_channels(raw, seg.channels, b, a), seg.frame_rate, seg.channels)


def _eq_mh(seg: AudioSegment) -> AudioSegment:
    return _eq_hp(seg, cutoff=LOW_CUTOFF)


# ── Beatmatching ──────────────────────────────────────────────────────────────

def _time_stretch_zone(seg: AudioSegment, source_bpm: float, target_bpm: float) -> AudioSegment:
    """
    Time-stretch a short zone to target_bpm.
    pyrubberband: high quality pitch-preserving stretch.
    Fallback: scipy resample (changes pitch slightly but no system deps).
    Only applied when BPM delta is 2-15%.
    """
    if source_bpm <= 0 or target_bpm <= 0:
        return seg
    ratio_lib = target_bpm / source_bpm
    ratio_pyrb = source_bpm / target_bpm
    if abs(ratio_lib - 1.0) < 0.02 or not (0.85 <= ratio_lib <= 1.15):
        return seg

    sr = seg.frame_rate
    raw = np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0

    try:
        if _HAS_PYRB:
            if seg.channels == 2:
                stretched_2d = pyrb.time_stretch(raw.reshape(-1, 2), sr, ratio_pyrb)
                out = stretched_2d.flatten().astype(np.float32)
            else:
                out = pyrb.time_stretch(raw, sr, ratio_pyrb).astype(np.float32)
        else:
            # scipy resample fallback — no system deps required
            new_len = int(round(len(raw) / ratio_lib))
            if seg.channels == 2:
                L = sp.resample(raw[0::2], int(round(len(raw[0::2]) / ratio_lib))).astype(np.float32)
                R = sp.resample(raw[1::2], int(round(len(raw[1::2]) / ratio_lib))).astype(np.float32)
                n = min(len(L), len(R))
                out = np.empty(n * 2, dtype=np.float32)
                out[0::2] = L[:n]
                out[1::2] = R[:n]
            else:
                out = sp.resample(raw, new_len).astype(np.float32)

        int16 = (np.clip(out, -1.0, 1.0) * 32767).astype(np.int16)
        return AudioSegment(int16.tobytes(), frame_rate=sr, sample_width=2, channels=seg.channels)
    except Exception as exc:
        logger.warning("time_stretch failed (%s) — using original", exc)
        return seg


# ── Transition engines ────────────────────────────────────────────────────────

def _three_band_crossfade(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
    bpm_a: float = 128.0,
    bpm_b: float = 128.0,
) -> AudioSegment:
    min_tail = max(6_000, min(fade_ms, (min(len(out_seg), len(in_seg)) - 2_000)))
    out_body, out_tail = _phrase_aligned_split(out_seg, bpm_a, min_tail, phrase_bars=8)
    T = len(out_tail)
    t1, t2 = T // 3, (2 * T) // 3

    in_head_raw = in_seg[:T]
    in_rest = in_seg[T:]
    in_head = _pad_or_trim(_time_stretch_zone(in_head_raw, bpm_b, bpm_a), T)

    try:
        p1_out = out_tail[:t1].apply_gain(-1)
        p1_in  = _eq_lp(in_head[:t1]).apply_gain(0)
        phase1 = p1_out.overlay(p1_in)
    except Exception:
        phase1 = out_tail[:t1].overlay(in_head[:t1].apply_gain(-6))

    try:
        p2_out = _eq_mh(out_tail[t1:t2]).apply_gain(-2)
        p2_in  = _eq_lm(in_head[t1:t2]).apply_gain(-1)
        phase2 = p2_out.overlay(p2_in)
    except Exception:
        phase2 = out_tail[t1:t2].apply_gain(-3).overlay(in_head[t1:t2].apply_gain(-3))

    try:
        p3_out = _eq_hp(out_tail[t2:], cutoff=HIGH_CUTOFF).fade_out(T - t2)
        p3_in  = in_head[t2:].fade_in((T - t2) // 3)
        phase3 = p3_out.overlay(p3_in)
    except Exception:
        phase3 = out_tail[t2:].fade_out(T - t2).overlay(in_head[t2:].fade_in((T - t2) // 3))

    return out_body + phase1 + phase2 + phase3 + in_rest


def _filter_sweep_transition(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
    bpm_a: float = 128.0,
    bpm_b: float = 128.0,
) -> AudioSegment:
    min_tail = max(4_000, min(fade_ms, min(len(out_seg), len(in_seg)) - 1_000))
    out_body, out_tail = _phrase_aligned_split(out_seg, bpm_a, min_tail, phrase_bars=8)

    try:
        tail_swept = _eq_hp(out_tail, cutoff=350).fade_out(len(out_tail))
    except Exception:
        tail_swept = out_tail.fade_out(len(out_tail))

    cf_ms = min(len(out_tail) // 2, 8_000)
    in_matched = _pad_or_trim(_time_stretch_zone(in_seg[:cf_ms], bpm_b, bpm_a), cf_ms)
    in_full = in_matched + in_seg[cf_ms:]

    safe_cf = max(1_000, min(cf_ms, len(tail_swept) - 500, len(in_full) - 500))
    return (out_body + tail_swept).append(in_full, crossfade=safe_cf)


def _echo_out_transition(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
    bpm_a: float = 128.0,
    bpm_b: float = 128.0,
) -> AudioSegment:
    min_tail = max(8_000, min(fade_ms, min(len(out_seg), len(in_seg)) - 2_000))
    out_body, out_tail = _phrase_aligned_split(out_seg, bpm_a, min_tail, phrase_bars=16)
    out_tail_faded = out_tail.fade_out(len(out_tail))

    overlap_ms = min(len(out_tail) // 2, 6_000)
    in_head_matched = _pad_or_trim(
        _time_stretch_zone(in_seg[:overlap_ms], bpm_b, bpm_a), overlap_ms
    )
    in_full = (in_head_matched + in_seg[overlap_ms:]).fade_in(min(overlap_ms // 2, 3_000))

    out_with_tail = out_body + out_tail_faded
    ov = min(overlap_ms, len(out_with_tail), len(in_full))
    mixed = out_with_tail[-ov:].overlay(in_full[:ov])
    return out_with_tail[:-ov] + mixed + in_full[ov:]


# ── Main engine ───────────────────────────────────────────────────────────────

# Max track length to keep in memory — 7 min is plenty for a DJ set
# Max track length — 7 min is enough for any DJ set
_MAX_TRACK_MS = 7 * 60 * 1000
# Processing rate — half of CD quality, halves every audio array in RAM
_PROC_RATE = 22_050


def _load_seg(spec: TrackSpec) -> AudioSegment:
    """Load one track at _PROC_RATE Hz, trimmed to _MAX_TRACK_MS."""
    try:
        seg = AudioSegment.from_file(spec.file_path)
        seg = _ensure_stereo(seg)
        if len(seg) > _MAX_TRACK_MS:
            seg = seg[:_MAX_TRACK_MS]
        seg = seg.set_frame_rate(_PROC_RATE)
        seg = _normalize_loudness(seg)
        return seg
    except Exception as exc:
        logger.error("Failed to load %s: %s", spec.file_path, exc)
        raise RuntimeError(f"Cannot load track {spec.track_id}: {exc}") from exc


def generate_mix(
    tracks: list[TrackSpec],
    transitions: list[TransitionSpec],
    mix_style: str,
    progress_callback=None,
) -> bytes:
    """Generate a DJ mix — constant-RAM strategy via disk segments.

    Only (transition tail + next track) live in RAM at any time.
    Stable bodies are flushed to temp WAV files; ffmpeg concatenates at end.
    Handles 10-20+ tracks on Railway free tier (512 MB).
    """
    import gc, os, subprocess

    assert len(tracks) >= 1
    total_steps = len(tracks) + len(transitions) + 2

    def _progress(step: int, msg: str) -> None:
        if progress_callback:
            pct = min(95, int(step / total_steps * 100))
            progress_callback(pct, msg)

    disk_segs: list[str] = []

    def _flush_stable(seg: AudioSegment, keep_ms: int) -> AudioSegment:
        """Write seg[:-keep_ms] to a temp WAV on disk; keep only tail in RAM."""
        flush_ms = len(seg) - keep_ms
        if flush_ms > 500:
            tmp = "/tmp/bugatti_seg_%03d.wav" % len(disk_segs)
            seg[:flush_ms].export(tmp, format="wav")
            disk_segs.append(tmp)
            tail = seg[flush_ms:]
            del seg
            gc.collect()
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

    # ── Mix ───────────────────────────────────────────────────────────────────
    for i, trans in enumerate(transitions):
        bpm_a = trans.bpm_a or 128.0
        bpm_b = trans.bpm_b or bpm_a
        fade_ms = _bars_to_ms(trans.transition_bars, bpm_a)

        # Flush stable body to disk — keep 2x transition zone in RAM
        keep_ms = max(fade_ms * 2, 30_000)
        result = _flush_stable(result, keep_ms)

        _progress(1 + i, "Loading track %d/%d..." % (i + 2, len(tracks)))
        in_raw = _load_seg(tracks[i + 1])

        label = trans.transition_type
        _progress(
            len(tracks) + i,
            "Transition %d/%d — %s (3-band EQ)..." % (i + 1, len(transitions), label),
        )

        try:
            if label == "cut":
                body, _ = _phrase_aligned_split(result, bpm_a, _bars_to_ms(4, bpm_a), phrase_bars=8)
                result = body + in_raw
            elif label == "filter_sweep":
                result = _filter_sweep_transition(result, in_raw, fade_ms, bpm_a, bpm_b)
            elif label == "echo_out":
                result = _echo_out_transition(result, in_raw, fade_ms, bpm_a, bpm_b)
            else:
                result = _three_band_crossfade(result, in_raw, fade_ms, bpm_a, bpm_b)
        except Exception as exc:
            logger.warning("Transition %d (%s) failed — simple crossfade: %s", i, label, exc)
            cf = max(1_000, min(fade_ms, 8_000, len(result) - 500, len(in_raw) - 500))
            result = result.append(in_raw, crossfade=cf)

        del in_raw
        gc.collect()

    # ── Flush final segment ───────────────────────────────────────────────────
    _progress(total_steps - 1, "Mastering and encoding...")
    result = _normalize_loudness(result, target_dbfs=-11.0)
    tmp_final = "/tmp/bugatti_seg_%03d.wav" % len(disk_segs)
    result.export(tmp_final, format="wav")
    disk_segs.append(tmp_final)
    del result
    gc.collect()

    # ── Concat all segments via ffmpeg (streams — no RAM spike) ───────────────
    concat_list = "/tmp/bugatti_concat.txt"
    out_mp3 = "/tmp/bugatti_mix_out.mp3"

    with open(concat_list, "w") as fh:
        for p in disk_segs:
            fh.write("file '%s'\n" % p)

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_list,
            "-ar", "44100",
            "-b:a", "320k",
            "-metadata", "title=AI Mix",
            out_mp3,
        ],
        check=True,
        capture_output=True,
    )

    with open(out_mp3, "rb") as fh:
        data = fh.read()

    for p in disk_segs + [concat_list, out_mp3]:
        try:
            os.unlink(p)
        except Exception:
            pass

    return data
