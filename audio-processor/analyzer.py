"""Audio analysis — madmom/librosa beat tracking + spectral section detection.

Priority chain for beat detection:
  1. madmom  — RNN deep-learning, ~98 % beat accuracy (Serato-class)
  2. librosa — dynamic-programming beat tracker, well-maintained fallback
  3. scipy   — spectral-flux autocorrelation (original, lowest accuracy)

Section detection uses spectral energy analysis:
  - Full-band RMS energy (overall intensity)
  - Low-band (50–200 Hz) kick-drum energy to find drops/breakdowns
  - 8-bar smoothing window aligned to the detected BPM
"""
from __future__ import annotations

import logging
import numpy as np
from scipy import ndimage
from scipy import signal as sp_sig
from pydub import AudioSegment

logger = logging.getLogger(__name__)

_SR    = 22_050
_HOP   = 512
_N_FFT = 2_048

# ── Optional high-accuracy beat trackers ──────────────────────────────────────
try:
    from madmom.features.beats import RNNBeatProcessor, BeatTrackingProcessor
    _HAS_MADMOM = True
    logger.info("madmom available — deep-learning beat tracking enabled")
except Exception:
    _HAS_MADMOM = False

try:
    import librosa as _librosa
    _HAS_LIBROSA = True
    logger.info("librosa available — ML beat tracking enabled")
except Exception:
    _HAS_LIBROSA = False

if not _HAS_MADMOM and not _HAS_LIBROSA:
    logger.warning(
        "Neither madmom nor librosa found — using scipy beat tracking (lower accuracy). "
        "Run: pip install librosa"
    )

# ── Camelot / key tables ───────────────────────────────────────────────────────
CAMELOT_MINOR = {0:"8A",1:"3A",2:"10A",3:"5A",4:"12A",5:"7A",
                 6:"2A",7:"9A",8:"4A",9:"11A",10:"6A",11:"1A"}
CAMELOT_MAJOR = {0:"8B",1:"3B",2:"10B",3:"5B",4:"12B",5:"7B",
                 6:"2B",7:"9B",8:"4B",9:"11B",10:"6B",11:"1B"}
KEY_NAMES      = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
MAJOR_PROFILE  = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MINOR_PROFILE  = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])


# ── Raw audio loader (pydub → numpy float32 mono) ─────────────────────────────
def _load(path: str, duration_sec: float | None = None) -> np.ndarray:
    seg = AudioSegment.from_file(path)
    if duration_sec is not None:
        seg = seg[: int(duration_sec * 1_000)]
    seg = seg.set_frame_rate(_SR).set_channels(1)
    raw = np.array(seg.get_array_of_samples(), dtype=np.float32)
    return raw / float(2 ** (seg.sample_width * 8 - 1))


# ── STFT helper ───────────────────────────────────────────────────────────────
def _stft(y: np.ndarray) -> np.ndarray:
    win  = np.hanning(_N_FFT)
    pad  = _N_FFT // 2
    yp   = np.pad(y, pad)
    n_fr = 1 + (len(yp) - _N_FFT) // _HOP
    frames = np.lib.stride_tricks.as_strided(
        yp,
        shape=(n_fr, _N_FFT),
        strides=(yp.strides[0] * _HOP, yp.strides[0]),
    )
    return np.abs(np.fft.rfft(frames * win, axis=1)).T   # (bins, frames)


# ── Scipy fallback BPM (spectral flux autocorrelation) ────────────────────────
def _detect_bpm_scipy(y: np.ndarray) -> float:
    spec    = _stft(y)
    flux    = np.sum(np.maximum(np.diff(spec, axis=1), 0.0), axis=0)
    flux    = ndimage.uniform_filter1d(flux, size=5)
    corr    = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
    fps     = float(_SR) / _HOP
    lag_min = max(1, int(round(fps * 60 / 200)))
    lag_max = min(int(round(fps * 60 / 60)), len(corr) - 1)
    lag     = int(np.argmax(corr[lag_min : lag_max + 1])) + lag_min
    return round(float(np.clip(fps * 60.0 / lag, 60.0, 200.0)), 1)


# ── Main beat-detection entry point ───────────────────────────────────────────
def detect_beatgrid(
    file_path: str,
    duration_sec: float | None = 90.0,
) -> tuple[float, list[float]]:
    """Return (bpm, beat_times_seconds) using the best available tracker."""

    # ── 1. madmom (RNN, best accuracy) ────────────────────────────────────
    if _HAS_MADMOM:
        try:
            act   = RNNBeatProcessor()(file_path)
            beats = BeatTrackingProcessor(fps=100)(act)
            if len(beats) >= 4:
                ibis       = np.diff(beats)
                median_ibi = float(np.median(ibis))
                bpm        = round(float(np.clip(60.0 / median_ibi, 60.0, 200.0)), 1)
                if duration_sec:
                    beats = beats[beats <= duration_sec]
                logger.info("madmom: %.1f BPM, %d beats", bpm, len(beats))
                return bpm, [round(float(b), 4) for b in beats]
        except Exception as exc:
            logger.warning("madmom failed: %s — falling back to librosa", exc)

    # ── 2. librosa (dynamic-programming, solid fallback) ──────────────────
    if _HAS_LIBROSA:
        try:
            y, sr           = _librosa.load(file_path, sr=_SR, mono=True,
                                             duration=duration_sec)
            tempo, beat_fr  = _librosa.beat.beat_track(y=y, sr=sr, units="frames")
            beat_times      = _librosa.frames_to_time(beat_fr, sr=sr)
            bpm             = round(float(np.clip(float(tempo), 60.0, 200.0)), 1)
            logger.info("librosa: %.1f BPM, %d beats", bpm, len(beat_times))
            return bpm, [round(float(b), 4) for b in beat_times]
        except Exception as exc:
            logger.warning("librosa failed: %s — falling back to scipy", exc)

    # ── 3. scipy fallback (spectral flux, synthesised beatgrid) ───────────
    y        = _load(file_path, duration_sec=duration_sec)
    bpm      = _detect_bpm_scipy(y)
    period   = 60.0 / bpm
    duration = len(y) / _SR
    beats    = list(np.arange(0.0, min(duration, duration_sec or duration), period))
    logger.info("scipy fallback: %.1f BPM, %d synthesised beats", bpm, len(beats))
    return bpm, [round(float(b), 4) for b in beats]


# ── Legacy alias ──────────────────────────────────────────────────────────────
def detect_bpm(y: np.ndarray) -> float:
    return _detect_bpm_scipy(y)


# ── Key detection ─────────────────────────────────────────────────────────────
def detect_key(y: np.ndarray) -> tuple[str, str]:
    spec  = _stft(y)
    freqs = np.fft.rfftfreq(_N_FFT, d=1.0 / _SR)
    nrg   = (spec ** 2).sum(axis=1)
    chroma = np.zeros(12)
    for i in range(1, len(freqs)):
        midi = 69.0 + 12.0 * np.log2(freqs[i] / 440.0)
        chroma[int(round(midi)) % 12] += nrg[i]
    chroma /= chroma.sum() + 1e-10

    maj = np.array([float(np.corrcoef(np.roll(MAJOR_PROFILE, i), chroma)[0, 1]) for i in range(12)])
    mn  = np.array([float(np.corrcoef(np.roll(MINOR_PROFILE, i), chroma)[0, 1]) for i in range(12)])
    mi, ni = int(np.argmax(maj)), int(np.argmax(mn))
    if maj[mi] >= mn[ni]:
        return f"{KEY_NAMES[mi]} maj", CAMELOT_MAJOR[mi]
    return f"{KEY_NAMES[ni]}m", CAMELOT_MINOR[ni]


# ── Energy estimation ─────────────────────────────────────────────────────────
def compute_energy(y: np.ndarray) -> int:
    spec  = _stft(y)
    rms   = np.sqrt(np.mean(spec ** 2, axis=0))
    peak  = float(np.max(rms))
    mean  = float(np.mean(rms))
    ratio = mean / peak if peak > 0 else 0.5
    return round(min(98, max(30, ratio * 120 + 35)))


# ── Spectral section detection ────────────────────────────────────────────────

def detect_sections_spectral(
    y: np.ndarray,
    bpm: float,
    duration: float,
) -> dict:
    """Find breakdown / drop / outro positions via spectral energy analysis.

    Algorithm:
    1. Compute RMS energy per 1-second frame (overall intensity).
    2. Compute low-frequency (50–200 Hz) kick-drum energy per frame.
    3. Smooth both curves with an 8-bar window aligned to BPM.
    4. Breakdown = sustained region where kick energy < 55% of median.
    5. Drop      = sustained region where kick energy > 135% of median.
    6. Outro     = last frame in the final 35% of the track where both
                   RMS and kick drop and stay low for the next 16 bars.

    Falls back gracefully on very short or very quiet tracks.
    """
    hop_sec  = 1.0                       # 1-second per frame
    win_sec  = 4.0                       # 4-second analysis window
    hop_len  = int(hop_sec * _SR)
    win_len  = int(win_sec  * _SR)
    n_frames = max(4, len(y) // hop_len)

    # ── Full-band RMS ─────────────────────────────────────────────────────
    rms = np.zeros(n_frames, dtype=np.float32)
    for j in range(n_frames):
        seg = y[j * hop_len : j * hop_len + win_len]
        rms[j] = float(np.sqrt(np.mean(seg ** 2))) if len(seg) > 0 else 0.0

    # ── Kick-drum band: 50–200 Hz ──────────────────────────────────────────
    nyq = _SR / 2.0
    lo  = float(np.clip(50.0  / nyq, 1e-4, 0.9999))
    hi  = float(np.clip(200.0 / nyq, 1e-4, 0.9999))
    try:
        b_k, a_k  = sp_sig.butter(4, [lo, hi], btype="band")
        y_kick    = sp_sig.filtfilt(b_k, a_k, y).astype(np.float32)
        kick_rms  = np.zeros(n_frames, dtype=np.float32)
        for j in range(n_frames):
            seg = y_kick[j * hop_len : j * hop_len + win_len]
            kick_rms[j] = float(np.sqrt(np.mean(seg ** 2))) if len(seg) > 0 else 0.0
    except Exception:
        kick_rms = rms.copy()

    # ── Normalise to [0, 1] ───────────────────────────────────────────────
    rms_n  = rms      / (rms.max()      + 1e-10)
    kick_n = kick_rms / (kick_rms.max() + 1e-10)

    # ── Smooth over 8 bars ────────────────────────────────────────────────
    bar_sec      = 60.0 / max(bpm, 60) * 4        # seconds per bar
    smooth_width = max(3, int(8 * bar_sec / hop_sec))
    rms_s  = ndimage.uniform_filter1d(rms_n,  size=smooth_width)
    kick_s = ndimage.uniform_filter1d(kick_n, size=smooth_width)

    med_rms  = float(np.median(rms_s))
    med_kick = float(np.median(kick_s))
    frame_times = np.arange(n_frames) * hop_sec   # seconds

    # ── Boolean masks ─────────────────────────────────────────────────────
    drop_mask      = kick_s > (med_kick * 1.30)   # kick well above median
    breakdown_mask = kick_s < (med_kick * 0.55)   # kick well below median

    # Minimum run length for a valid section: 4 bars
    min_run = max(2, int(4 * bar_sec / hop_sec))

    def _first_sustained(mask: np.ndarray, after: float, before: float) -> float | None:
        """Return time (sec) of first sustained run ≥ min_run frames in mask,
        searching in [after_sec, before_sec) range."""
        f_start = max(0, int(after  / hop_sec))
        f_end   = min(n_frames, int(before / hop_sec))
        run = 0
        for f in range(f_start, f_end):
            if mask[f]:
                run += 1
                if run >= min_run:
                    onset = f - run + 1
                    return round(float(frame_times[onset]), 1)
            else:
                run = 0
        return None

    def _last_sustained_low(after_frac: float) -> float | None:
        """Find last frame in [after_frac … end] where energy drops and stays
        low for the next 16 bars (typical outro length)."""
        look_bars = max(1, int(16 * bar_sec / hop_sec))
        f_start   = int(after_frac * n_frames)
        threshold = med_rms * 0.72
        for f in range(f_start, n_frames - look_bars):
            window = rms_s[f : f + look_bars]
            if float(np.mean(window)) < threshold and rms_s[f] < threshold:
                return round(float(frame_times[f]), 1)
        return None

    # ── Locate each section ───────────────────────────────────────────────

    # intro_end: first sustained DROP in the first 35% of the track
    intro_end = (
        _first_sustained(drop_mask, after=0.0, before=duration * 0.35)
        or round(min(bar_sec * 16, duration * 0.25), 1)
    )

    # drop_start: first sustained DROP between 20% and 55%
    drop_start = (
        _first_sustained(drop_mask, after=duration * 0.20, before=duration * 0.55)
        or round(duration * 0.35, 1)
    )

    # break_start: first sustained BREAKDOWN between 30% and 72%
    # Prefer a breakdown that comes after a drop (the classic "breakdown after drop 1")
    break_start = (
        _first_sustained(breakdown_mask, after=max(drop_start, duration * 0.30),
                         before=duration * 0.72)
        or _first_sustained(breakdown_mask, after=duration * 0.30, before=duration * 0.72)
        or round(duration * 0.55, 1)
    )

    # outro_start: last time energy permanently drops in the final 35%
    # This is exactly WHERE a DJ should start mixing out.
    outro_start = (
        _last_sustained_low(after_frac=0.65)
        or round(max(duration - bar_sec * 16, duration * 0.75), 1)
    )

    logger.info(
        "Sections: intro_end=%.1f drop=%.1f break=%.1f outro=%.1f (dur=%.1f bpm=%.1f)",
        intro_end, drop_start, break_start, outro_start, duration, bpm,
    )
    return {
        "intro_end":   intro_end,
        "drop_start":  drop_start,
        "break_start": break_start,
        "outro_start": outro_start,
    }


def detect_sections(duration: float, bpm: float) -> dict:
    """Heuristic fallback (percentage-based). Used when spectral detection fails."""
    bar = 60.0 / max(bpm, 60) * 4
    return {
        "intro_end":   round(min(bar * 16,  duration * 0.25), 1),
        "drop_start":  round(duration * 0.35,                  1),
        "break_start": round(duration * 0.55,                  1),
        "outro_start": round(max(duration - bar * 16, duration * 0.75), 1),
    }


def classify_genre(bpm: float, energy: int) -> str:
    if bpm < 115: return "Deep House"
    if bpm < 122: return "Progressive"
    if bpm < 126: return "Tech House"
    if bpm < 130: return "House"
    if bpm < 135: return "Techno"
    if bpm < 140: return "Hard Techno"
    return "Trance"


# ── Public API ────────────────────────────────────────────────────────────────
def analyze_audio(file_path: str) -> dict:
    """Full audio analysis with spectral section detection.

    Returns BPM, key, energy, genre, sections (spectral) AND the full
    beatgrid (list of beat timestamps in seconds).
    """
    # Beat tracking (madmom → librosa → scipy)
    bpm, beatgrid = detect_beatgrid(file_path, duration_sec=90.0)

    # Load short slice for key/energy, full track for sections
    y_short = _load(file_path, duration_sec=90)
    y_full  = _load(file_path)
    duration = len(y_full) / _SR

    key_name, camelot = detect_key(y_short)
    energy            = compute_energy(y_short)
    genre             = classify_genre(bpm, energy)

    # ── Spectral section detection on full track ───────────────────────────
    try:
        sections = detect_sections_spectral(y_full, bpm, duration)
    except Exception as exc:
        logger.warning("Spectral section detection failed: %s — using heuristic", exc)
        sections = detect_sections(duration, bpm)

    minutes, seconds = int(duration // 60), int(duration % 60)
    return {
        "bpm":              bpm,
        "key":              key_name,
        "camelot":          camelot,
        "energy":           energy,
        "duration":         f"{minutes}:{seconds:02d}",
        "duration_seconds": round(duration, 1),
        "genre":            genre,
        "sections":         sections,
        # Full beatgrid: list[float] — beat timestamps from track start (seconds).
        "beatgrid":         beatgrid,
    }
