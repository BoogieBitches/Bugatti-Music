"""
DJ mix generation engine using pydub.

Strategy (MVP):
  - Cut:          hard cut at phrase boundary
  - Crossfade:    linear amplitude crossfade
  - Filter sweep: high-pass fade-out + crossfade
  - Echo out:     long crossfade with reverb-like tail (fade + overlap)
"""

from __future__ import annotations

import io
import logging
import math
from dataclasses import dataclass
from typing import Literal

import numpy as np
from pydub import AudioSegment
from pydub.effects import high_pass_filter, low_pass_filter

logger = logging.getLogger(__name__)

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
    bpm_a: float  # BPM of outgoing track


def _bars_to_ms(bars: int, bpm: float) -> int:
    """Convert musical bars to milliseconds (4/4 time)."""
    beat_ms = 60_000 / max(bpm, 60)
    return int(bars * 4 * beat_ms)


def _ensure_stereo(seg: AudioSegment) -> AudioSegment:
    if seg.channels == 1:
        return seg.set_channels(2)
    return seg


def _normalize_loudness(seg: AudioSegment, target_dbfs: float = -14.0) -> AudioSegment:
    diff = target_dbfs - seg.dBFS
    return seg.apply_gain(min(diff, 6))  # cap at +6 dB to avoid clipping


def _find_outro_start(seg: AudioSegment, spec: TrackSpec) -> int:
    """Return ms position to start the outro (where we begin the transition out)."""
    outro_s = spec.sections.get("outro_start") or (spec.duration_seconds * 0.8)
    return int(min(outro_s * 1000, len(seg) - 8_000))


def _crossfade_transition(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
) -> AudioSegment:
    """Standard linear crossfade: overlap the tail of out_seg with head of in_seg."""
    fade_ms = max(2_000, min(fade_ms, min(len(out_seg), len(in_seg)) - 1_000))
    return out_seg.append(in_seg, crossfade=fade_ms)


def _filter_sweep_transition(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
) -> AudioSegment:
    """
    Filter sweep: apply increasing high-pass to the tail of out_seg,
    then crossfade into in_seg.
    """
    fade_ms = max(4_000, min(fade_ms, min(len(out_seg), len(in_seg)) - 1_000))
    tail_start = max(0, len(out_seg) - fade_ms)
    body = out_seg[:tail_start]
    tail = out_seg[tail_start:]

    # Apply high-pass filter to simulate filter-sweep effect
    try:
        tail_filtered = high_pass_filter(tail, cutoff=300)
        out_filtered = body + tail_filtered
    except Exception:
        out_filtered = out_seg  # fallback if filter fails

    return out_filtered.append(in_seg, crossfade=min(fade_ms // 2, 8_000))


def _echo_out_transition(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
) -> AudioSegment:
    """Echo out: long fade on the outgoing, long overlap with incoming."""
    fade_ms = max(8_000, min(fade_ms, min(len(out_seg), len(in_seg)) - 2_000))

    tail_start = max(0, len(out_seg) - fade_ms)
    body = out_seg[:tail_start]
    tail = out_seg[tail_start:]

    # Fade out the tail
    tail_faded = tail.fade_out(len(tail))

    # Fade in the incoming
    in_faded = in_seg.fade_in(min(fade_ms // 2, 6_000))

    out_with_tail = body + tail_faded
    # Overlap: mix the last portion of out with the start of in
    overlap_ms = min(fade_ms // 2, 6_000, len(out_with_tail), len(in_faded))
    out_final = out_with_tail[:-overlap_ms]
    mixed_overlap = out_with_tail[-overlap_ms:].overlay(in_faded[:overlap_ms])
    return out_final + mixed_overlap + in_faded[overlap_ms:]


def generate_mix(
    tracks: list[TrackSpec],
    transitions: list[TransitionSpec],
    mix_style: str,
    progress_callback=None,
) -> bytes:
    """
    Generate a DJ mix and return the MP3 bytes.

    progress_callback: optional callable(percent: int, message: str)
    """
    assert len(tracks) >= 1
    total_steps = len(tracks) + len(transitions) + 2

    def _progress(step: int, msg: str):
        if progress_callback:
            pct = min(95, int(step / total_steps * 100))
            progress_callback(pct, msg)

    # ── Load all tracks ─────────────────────────────────────────────────────
    segments: list[AudioSegment] = []
    for i, spec in enumerate(tracks):
        _progress(i, f"Loading {spec.track_id[:8]}...")
        try:
            seg = AudioSegment.from_file(spec.file_path)
            seg = _ensure_stereo(seg).set_frame_rate(44100)
            seg = _normalize_loudness(seg)
            segments.append(seg)
        except Exception as e:
            logger.error("Failed to load %s: %s", spec.file_path, e)
            raise RuntimeError(f"Cannot load track {spec.track_id}: {e}") from e

    if len(segments) == 1:
        _progress(total_steps - 1, "Exporting...")
        buf = io.BytesIO()
        segments[0].export(buf, format="mp3", bitrate="320k")
        return buf.getvalue()

    # ── Build mix ───────────────────────────────────────────────────────────
    result = segments[0]
    track_map = {t.track_id: t for t in tracks}

    for i, (trans, in_seg_raw) in enumerate(zip(transitions, segments[1:])):
        _progress(len(tracks) + i, f"Applying transition {i + 1}/{len(transitions)}...")

        bpm = trans.bpm_a or 128.0
        fade_ms = _bars_to_ms(trans.transition_bars, bpm)

        try:
            if trans.transition_type == "cut":
                result = result + in_seg_raw
            elif trans.transition_type == "filter_sweep":
                result = _filter_sweep_transition(result, in_seg_raw, fade_ms)
            elif trans.transition_type == "echo_out":
                result = _echo_out_transition(result, in_seg_raw, fade_ms)
            else:  # crossfade (default)
                result = _crossfade_transition(result, in_seg_raw, fade_ms)
        except Exception as e:
            logger.warning("Transition %d failed (%s), falling back to crossfade: %s", i, trans.transition_type, e)
            result = _crossfade_transition(result, in_seg_raw, min(fade_ms, 8_000))

    # ── Export ──────────────────────────────────────────────────────────────
    _progress(total_steps - 1, "Mastering and encoding...")
    result = _normalize_loudness(result, target_dbfs=-11.0)
    buf = io.BytesIO()
    result.export(buf, format="mp3", bitrate="320k", tags={"title": f"AI Mix — {mix_style}"})
    _progress(total_steps, "Done")
    return buf.getvalue()
