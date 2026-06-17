"""Audio analysis — madmom/librosa beat tracking + scipy for key/energy.

Priority chain for beat detection:
  1. madmom  — RNN deep-learning, ~98 % beat accuracy (Serato-class)
  2. librosa — dynamic-programming beat tracker, well-maintained fallback
  3. scipy   — spectral-flux autocorrelation (original, lowest accuracy)

`analyze_audio()` now returns a `beatgrid` field — a list of beat timestamps
(seconds) covering the full analysed window. `generate.py` uses this grid for
sub-beat phase alignment without touching the intro.
"""
from __future__ import annotations

import logging
import numpy as np
from scipy import ndimage
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
        "Run: pip install librosa madmom"
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
    corr    = np.correlate(flux, flux, mode="full")[len(flux) - 1 :]
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
    """Return (bpm, beat_times_seconds) using the best available tracker.

    beat_times_seconds — every detected beat from 0 to duration_sec, as a
    plain Python list of floats.  Used downstream in generate.py for
    sub-beat phase alignment.
    """

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


# ── Legacy aliases (keep backwards compat with old imports) ───────────────────
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


# ── Section timestamps (heuristic, refined if beatgrid available) ─────────────
def detect_sections(duration: float, bpm: float) -> dict:
    bar = 60.0 / max(bpm, 60) * 4
    return {
        "intro_end":    round(min(bar * 16,  duration * 0.25), 1),
        "drop_start":   round(duration * 0.35,                  1),
        "break_start":  round(duration * 0.55,                  1),
        "outro_start":  round(max(duration - bar * 16, duration * 0.75), 1),
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
    """Full audio analysis.  Returns BPM, key, energy, genre, sections AND
    the full `beatgrid` (list of beat timestamps in seconds).  The beatgrid
    is stored by the client and passed back on generation so the mixing engine
    can do precise, intro-preserving phase alignment without guessing.
    """
    # Beat tracking (madmom → librosa → scipy)
    bpm, beatgrid = detect_beatgrid(file_path, duration_sec=90.0)

    # Chroma / energy analysis on a short clip
    y_short = _load(file_path, duration_sec=90)
    y_full  = _load(file_path)
    duration = len(y_full) / _SR

    key_name, camelot = detect_key(y_short)
    energy            = compute_energy(y_short)
    sections          = detect_sections(duration, bpm)
    genre             = classify_genre(bpm, energy)

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
        # Covering the first 90 s used for analysis; the mixing engine scales it
        # to the full track length via the BPM ratio after time-stretching.
        "beatgrid":         beatgrid,
    }
