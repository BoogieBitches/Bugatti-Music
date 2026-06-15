"""
DJ mix generation engine — professional edition v3.

Key features:
  - Phrase-aligned transitions: snaps the transition start to the nearest
    8-bar boundary so cuts always land on a musically correct downbeat.
  - High-quality BPM beatmatching: uses pyrubberband (offline, transient-aware)
    when available; falls back to librosa phase-vocoder.
  - DJ-style bass-swap crossfade: LP on incoming / HP on outgoing.
  - Filter-sweep and echo-out with beatmatching.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Literal

import librosa
import numpy as np
from pydub import AudioSegment
from pydub.effects import high_pass_filter, low_pass_filter

logger = logging.getLogger(__name__)

# ── Optional high-quality time-stretcher ──────────────────────────────────────
try:
    import pyrubberband as pyrb
    _HAS_PYRB = True
    logger.info("pyrubberband available — using high-quality time-stretch")
except Exception:
    _HAS_PYRB = False
    logger.info("pyrubberband not available — falling back to librosa")

TransitionType = Literal["cut", "crossfade", "filter_sweep", "echo_out"]


@dataclass
class TrackSpec:
    track_id: str
    file_path: str
    bpm: float
    energy: int
    duration_seconds: float
    sections: dict  # intro_end, drop_start, break_start, outro_start


@dataclass
class TransitionSpec:
    from_track_id: str
    to_track_id: str
    transition_type: TransitionType
    transition_bars: int
    bpm_a: float        # BPM of outgoing track
    bpm_b: float = 128.0  # BPM of incoming track (for beatmatching)


# ── Utilities ─────────────────────────────────────────────────────────────────

def _bars_to_ms(bars: int, bpm: float) -> int:
    """Convert musical bars (4/4 time) to milliseconds."""
    beat_ms = 60_000 / max(bpm, 60)
    return int(bars * 4 * beat_ms)


def _ensure_stereo(seg: AudioSegment) -> AudioSegment:
    return seg.set_channels(2) if seg.channels == 1 else seg


def _normalize_loudness(seg: AudioSegment, target_dbfs: float = -14.0) -> AudioSegment:
    diff = target_dbfs - seg.dBFS
    return seg.apply_gain(min(diff, 6))


def _pad_or_trim(seg: AudioSegment, target_ms: int) -> AudioSegment:
    """Ensure segment is exactly target_ms long."""
    if len(seg) < target_ms:
        return seg + AudioSegment.silent(target_ms - len(seg), frame_rate=seg.frame_rate)
    return seg[:target_ms]


# ── Phrase alignment ──────────────────────────────────────────────────────────

def _snap_to_phrase(position_ms: int, bpm: float, phrase_bars: int = 8) -> int:
    """
    Snap a millisecond position to the nearest phrase boundary.

    With phrase_bars=8 (default) each phrase is 8 bars = 32 beats in 4/4.
    This ensures transitions always start on a musical downbeat — the same
    principle as pressing the cue button at the right moment on a CDJ.
    """
    bar_ms = _bars_to_ms(1, bpm)
    phrase_ms = bar_ms * phrase_bars
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
    """
    Split seg into (body, tail) where the split point is snapped to the
    nearest 8-bar boundary that still leaves at least min_tail_ms of tail.
    """
    raw_split = len(seg) - min_tail_ms
    snapped = _snap_to_phrase(raw_split, bpm, phrase_bars)

    # Clamp: must leave at least min_tail_ms of tail and some body
    snapped = max(0, min(snapped, len(seg) - min_tail_ms))

    return seg[:snapped], seg[snapped:]


# ── Beatmatching ──────────────────────────────────────────────────────────────

def _time_stretch_zone(seg: AudioSegment, source_bpm: float, target_bpm: float) -> AudioSegment:
    """
    Time-stretch a short audio zone to target_bpm from source_bpm.

    Uses pyrubberband (offline, transient-preserving) when installed;
    otherwise falls back to librosa's phase vocoder.

    Only applied when the BPM delta is 2–15% — outside that range the
    perceptible quality degrades more than the tempo difference matters.

    pyrubberband rate convention: rate = output_duration / input_duration.
      • To speed up (match higher BPM): rate = source_bpm / target_bpm  (<1)
    librosa rate convention: rate = output_speed_factor.
      • To speed up: rate = target_bpm / source_bpm  (>1)
    """
    if source_bpm <= 0 or target_bpm <= 0:
        return seg
    ratio_librosa = target_bpm / source_bpm   # >1 = faster (shorter)
    ratio_pyrb    = source_bpm / target_bpm   # <1 = shorter (pyrb convention)

    if abs(ratio_librosa - 1.0) < 0.02 or not (0.85 <= ratio_librosa <= 1.15):
        return seg  # too similar or too different — skip

    sr = seg.frame_rate
    raw = np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0

    try:
        if _HAS_PYRB:
            # pyrubberband expects shape (n_samples,) for mono or (n_samples, 2) for stereo
            if seg.channels == 2:
                samples_2d = raw.reshape(-1, 2)
                stretched_2d = pyrb.time_stretch(samples_2d, sr, ratio_pyrb)
                out = stretched_2d.flatten().astype(np.float32)
            else:
                out = pyrb.time_stretch(raw, sr, ratio_pyrb).astype(np.float32)
        else:
            # librosa phase-vocoder fallback
            if seg.channels == 2:
                L = raw[0::2]
                R = raw[1::2]
                Ls = librosa.effects.time_stretch(L, rate=ratio_librosa)
                Rs = librosa.effects.time_stretch(R, rate=ratio_librosa)
                n = min(len(Ls), len(Rs))
                out = np.empty(n * 2, dtype=np.float32)
                out[0::2] = Ls[:n]
                out[1::2] = Rs[:n]
            else:
                out = librosa.effects.time_stretch(raw, rate=ratio_librosa)

        int16 = (np.clip(out, -1.0, 1.0) * 32767).astype(np.int16)
        return AudioSegment(
            int16.tobytes(),
            frame_rate=sr,
            sample_width=2,
            channels=seg.channels,
        )
    except Exception as exc:
        logger.warning("time_stretch failed (%s) — using original", exc)
        return seg


# ── Transition engines ────────────────────────────────────────────────────────

def _bass_swap_crossfade(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
    bpm_a: float = 128.0,
    bpm_b: float = 128.0,
) -> AudioSegment:
    """
    Professional DJ bass-swap crossfade with phrase alignment + beatmatching.

    Step 1 — Phrase alignment:
      Split the outgoing track at the nearest 8-bar boundary before the
      natural transition point. Cuts always land on a downbeat.

    Step 2 — Beatmatch:
      Time-stretch the incoming transition zone to outgoing BPM so both
      tracks play at the same tempo during the overlap.

    Step 3 — Bass swap:
      Phase 1 (first half): outgoing full spectrum (-2 dB) + incoming
        low-pass ≤250 Hz (bass/kick only). Brings the groove of the new
        track underneath without harmonic clash.
      Phase 2 (second half): outgoing high-pass ≥200 Hz fading to silence
        (bass removed — avoids double-kick mud) + incoming full spectrum
        fading in.
    """
    min_tail = max(4_000, min(fade_ms, min(len(out_seg), len(in_seg)) // 2))

    out_body, out_tail = _phrase_aligned_split(out_seg, bpm_a, min_tail, phrase_bars=8)
    actual_fade = len(out_tail)
    half = actual_fade // 2

    in_head_raw = in_seg[:actual_fade]
    in_rest = in_seg[actual_fade:]

    # Beatmatch incoming zone to outgoing BPM
    in_head = _pad_or_trim(_time_stretch_zone(in_head_raw, bpm_b, bpm_a), actual_fade)

    # Phase 1: outgoing full + incoming bass only
    p1_out = out_tail[:half].apply_gain(-2)
    try:
        p1_in = low_pass_filter(in_head[:half], cutoff=250).apply_gain(-1)
    except Exception:
        p1_in = in_head[:half].apply_gain(-5)
    phase1 = p1_out.overlay(p1_in)

    # Phase 2: outgoing bass-removed (fading) + incoming full (fading in)
    try:
        p2_out = high_pass_filter(out_tail[half:], cutoff=200).fade_out(half)
    except Exception:
        p2_out = out_tail[half:].fade_out(half)
    p2_in = in_head[half:].fade_in(half // 3)
    phase2 = p2_out.overlay(p2_in)

    return out_body + phase1 + phase2 + in_rest


def _filter_sweep_transition(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
    bpm_a: float = 128.0,
    bpm_b: float = 128.0,
) -> AudioSegment:
    """
    Phrase-aligned high-pass sweep on outgoing, beatmatched crossfade into
    incoming. Mimics turning the high-pass filter knob fully right on a mixer.
    """
    min_tail = max(4_000, min(fade_ms, min(len(out_seg), len(in_seg)) - 1_000))

    out_body, out_tail = _phrase_aligned_split(out_seg, bpm_a, min_tail, phrase_bars=8)

    try:
        tail_filtered = high_pass_filter(out_tail, cutoff=300).fade_out(len(out_tail))
    except Exception:
        tail_filtered = out_tail.fade_out(len(out_tail))

    cf_ms = min(len(out_tail) // 2, 8_000)
    in_head_matched = _pad_or_trim(_time_stretch_zone(in_seg[:cf_ms], bpm_b, bpm_a), cf_ms)
    in_full = in_head_matched + in_seg[cf_ms:]

    safe_cf = max(1_000, min(cf_ms, len(tail_filtered) - 500, len(in_full) - 500))
    return (out_body + tail_filtered).append(in_full, crossfade=safe_cf)


def _echo_out_transition(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
    bpm_a: float = 128.0,
    bpm_b: float = 128.0,
) -> AudioSegment:
    """
    Phrase-aligned long reverb-tail fade; incoming track fades in with
    beatmatching. Works best for energy drops between sections.
    """
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

def generate_mix(
    tracks: list[TrackSpec],
    transitions: list[TransitionSpec],
    mix_style: str,
    progress_callback=None,
) -> bytes:
    """Generate a DJ mix and return 320 kbps MP3 bytes."""
    assert len(tracks) >= 1
    total_steps = len(tracks) + len(transitions) + 2

    def _progress(step: int, msg: str):
        if progress_callback:
            pct = min(95, int(step / total_steps * 100))
            progress_callback(pct, msg)

    # ── Load ──────────────────────────────────────────────────────────────────
    segments: list[AudioSegment] = []
    for i, spec in enumerate(tracks):
        _progress(i, f"Loading {spec.track_id[:8]}...")
        try:
            seg = AudioSegment.from_file(spec.file_path)
            seg = _ensure_stereo(seg).set_frame_rate(44100)
            seg = _normalize_loudness(seg)
            segments.append(seg)
        except Exception as exc:
            logger.error("Failed to load %s: %s", spec.file_path, exc)
            raise RuntimeError(f"Cannot load track {spec.track_id}: {exc}") from exc

    if len(segments) == 1:
        _progress(total_steps - 1, "Exporting...")
        buf = io.BytesIO()
        segments[0].export(buf, format="mp3", bitrate="320k")
        return buf.getvalue()

    # ── Mix ───────────────────────────────────────────────────────────────────
    result = segments[0]

    for i, (trans, in_raw) in enumerate(zip(transitions, segments[1:])):
        label = trans.transition_type
        _progress(
            len(tracks) + i,
            f"Transition {i + 1}/{len(transitions)} — {label} (phrase-aligned)...",
        )

        bpm_a = trans.bpm_a or 128.0
        bpm_b = trans.bpm_b or bpm_a
        fade_ms = _bars_to_ms(trans.transition_bars, bpm_a)

        try:
            if label == "cut":
                # Still phrase-align hard cuts: trim outgoing to phrase boundary
                body, tail = _phrase_aligned_split(result, bpm_a, _bars_to_ms(4, bpm_a), phrase_bars=8)
                result = body + in_raw
            elif label == "filter_sweep":
                result = _filter_sweep_transition(result, in_raw, fade_ms, bpm_a, bpm_b)
            elif label == "echo_out":
                result = _echo_out_transition(result, in_raw, fade_ms, bpm_a, bpm_b)
            else:  # crossfade → professional bass-swap
                result = _bass_swap_crossfade(result, in_raw, fade_ms, bpm_a, bpm_b)
        except Exception as exc:
            logger.warning(
                "Transition %d (%s) failed — falling back to basic crossfade: %s",
                i, label, exc,
            )
            cf = max(1_000, min(fade_ms, 8_000, len(result) - 500, len(in_raw) - 500))
            result = result.append(in_raw, crossfade=cf)

    # ── Master & export ───────────────────────────────────────────────────────
    _progress(total_steps - 1, "Mastering and encoding...")
    result = _normalize_loudness(result, target_dbfs=-11.0)
    buf = io.BytesIO()
    result.export(buf, format="mp3", bitrate="320k", tags={"title": f"AI Mix — {mix_style}"})
    _progress(total_steps, "Done")
    return buf.getvalue()
