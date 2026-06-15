"""
DJ mix generation engine — professional edition v2.

Upgrades over v1:
  - BPM beatmatching via librosa phase-vocoder time_stretch on the transition zone
  - DJ-style bass-swap crossfade (LP on incoming, HP on outgoing — classic technique)
  - Improved filter_sweep and echo_out with beatmatching
  - bpm_b field on TransitionSpec for incoming-track tempo
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
    return seg.apply_gain(min(diff, 6))  # cap at +6 dB to avoid clipping


def _pad_or_trim(seg: AudioSegment, target_ms: int) -> AudioSegment:
    """Ensure segment is exactly target_ms long."""
    if len(seg) < target_ms:
        return seg + AudioSegment.silent(target_ms - len(seg), frame_rate=seg.frame_rate)
    return seg[:target_ms]


# ── Beatmatching ──────────────────────────────────────────────────────────────

def _time_stretch_zone(seg: AudioSegment, source_bpm: float, target_bpm: float) -> AudioSegment:
    """
    Time-stretch a short audio zone using librosa's phase vocoder so it plays
    at target_bpm instead of source_bpm.

    Only applied when the BPM delta is between 2% and 15% — outside that range
    the quality degrades noticeably, so we leave the audio unchanged.
    """
    if source_bpm <= 0 or target_bpm <= 0:
        return seg
    ratio = target_bpm / source_bpm
    if abs(ratio - 1.0) < 0.02 or not (0.85 <= ratio <= 1.15):
        return seg  # too similar or too far — don't stretch

    sr = seg.frame_rate
    raw = np.array(seg.get_array_of_samples(), dtype=np.float32) / 32768.0

    try:
        if seg.channels == 2:
            L = raw[0::2]
            R = raw[1::2]
            Ls = librosa.effects.time_stretch(L, rate=ratio)
            Rs = librosa.effects.time_stretch(R, rate=ratio)
            n = min(len(Ls), len(Rs))
            out = np.empty(n * 2, dtype=np.float32)
            out[0::2] = Ls[:n]
            out[1::2] = Rs[:n]
        else:
            out = librosa.effects.time_stretch(raw, rate=ratio)

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
    Professional DJ bass-swap crossfade — the classic technique:

    Phase 1 (first half):
      • Outgoing: full spectrum, -2 dB
      • Incoming: low-pass ≤250 Hz (bass only), beatmatched to outgoing BPM
        → brings the groove/kick of the new track under the old one

    Phase 2 (second half):
      • Outgoing: high-pass ≥200 Hz (bass removed), fading to silence
        → kills the bass to avoid mud / double-kick
      • Incoming: full spectrum, fading in from slight cut
    """
    max_fade = min(len(out_seg), len(in_seg)) - 2_000
    fade_ms = max(4_000, min(fade_ms, max_fade))
    half = fade_ms // 2

    out_body = out_seg[:-fade_ms]
    out_tail = out_seg[-fade_ms:]
    in_head_raw = in_seg[:fade_ms]
    in_rest = in_seg[fade_ms:]

    # Beatmatch: stretch incoming zone to outgoing BPM
    in_head = _pad_or_trim(_time_stretch_zone(in_head_raw, bpm_b, bpm_a), fade_ms)

    # Phase 1
    p1_out = out_tail[:half].apply_gain(-2)
    try:
        p1_in = low_pass_filter(in_head[:half], cutoff=250).apply_gain(-1)
    except Exception:
        p1_in = in_head[:half].apply_gain(-5)
    phase1 = p1_out.overlay(p1_in)

    # Phase 2
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
    High-pass filter sweep on the outgoing tail (simulates turning the filter
    knob on the CDJ), then crossfade into a beatmatched incoming track.
    """
    max_fade = min(len(out_seg), len(in_seg)) - 1_000
    fade_ms = max(4_000, min(fade_ms, max_fade))

    tail_start = max(0, len(out_seg) - fade_ms)
    body = out_seg[:tail_start]
    tail = out_seg[tail_start:]

    try:
        tail_filtered = high_pass_filter(tail, cutoff=300).fade_out(len(tail))
    except Exception:
        tail_filtered = tail.fade_out(len(tail))

    cf_ms = min(fade_ms // 2, 8_000)
    in_head_matched = _pad_or_trim(_time_stretch_zone(in_seg[:cf_ms], bpm_b, bpm_a), cf_ms)
    in_full = in_head_matched + in_seg[cf_ms:]

    safe_cf = max(1_000, min(cf_ms, len(tail_filtered) - 500, len(in_full) - 500))
    return (body + tail_filtered).append(in_full, crossfade=safe_cf)


def _echo_out_transition(
    out_seg: AudioSegment,
    in_seg: AudioSegment,
    fade_ms: int,
    bpm_a: float = 128.0,
    bpm_b: float = 128.0,
) -> AudioSegment:
    """Long reverb-tail fade on outgoing; incoming fades in with beatmatching."""
    max_fade = min(len(out_seg), len(in_seg)) - 2_000
    fade_ms = max(8_000, min(fade_ms, max_fade))

    tail_start = max(0, len(out_seg) - fade_ms)
    body = out_seg[:tail_start]
    tail = out_seg[tail_start:].fade_out(len(out_seg[tail_start:]))

    overlap_ms = min(fade_ms // 2, 6_000)
    in_head_matched = _pad_or_trim(_time_stretch_zone(in_seg[:overlap_ms], bpm_b, bpm_a), overlap_ms)
    in_full = (in_head_matched + in_seg[overlap_ms:]).fade_in(min(overlap_ms // 2, 3_000))

    out_with_tail = body + tail
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
        _progress(len(tracks) + i, f"Transition {i + 1}/{len(transitions)} — {label}...")

        bpm_a = trans.bpm_a or 128.0
        bpm_b = trans.bpm_b or bpm_a
        fade_ms = _bars_to_ms(trans.transition_bars, bpm_a)

        try:
            if label == "cut":
                result = result + in_raw
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
