"""Audio analysis — pure numpy/scipy/pydub, zero system library dependencies."""
import numpy as np
from scipy import ndimage
from pydub import AudioSegment

_SR = 22050
_HOP = 512
_N_FFT = 2048

CAMELOT_MINOR = {0: "8A", 1: "3A", 2: "10A", 3: "5A", 4: "12A", 5: "7A",
                 6: "2A", 7: "9A", 8: "4A", 9: "11A", 10: "6A", 11: "1A"}
CAMELOT_MAJOR = {0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
                 6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B"}
KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def _load(path: str, duration_sec: float | None = None) -> np.ndarray:
    seg = AudioSegment.from_file(path)
    if duration_sec is not None:
        seg = seg[: int(duration_sec * 1000)]
    seg = seg.set_frame_rate(_SR).set_channels(1)
    raw = np.array(seg.get_array_of_samples(), dtype=np.float32)
    return raw / float(2 ** (seg.sample_width * 8 - 1))


def _stft(y: np.ndarray) -> np.ndarray:
    win = np.hanning(_N_FFT)
    pad = _N_FFT // 2
    yp = np.pad(y, pad)
    n_frames = 1 + (len(yp) - _N_FFT) // _HOP
    frames = np.lib.stride_tricks.as_strided(
        yp,
        shape=(n_frames, _N_FFT),
        strides=(yp.strides[0] * _HOP, yp.strides[0]),
    )
    return np.abs(np.fft.rfft(frames * win, axis=1)).T  # (bins, frames)


def detect_bpm(y: np.ndarray) -> float:
    spec = _stft(y)
    flux = np.sum(np.maximum(np.diff(spec, axis=1), 0.0), axis=0)
    flux = ndimage.uniform_filter1d(flux, size=5)
    corr = np.correlate(flux, flux, mode='full')
    corr = corr[len(corr) // 2:]
    fps = float(_SR) / _HOP
    lag_min = max(1, int(round(fps * 60 / 200)))
    lag_max = min(int(round(fps * 60 / 60)), len(corr) - 1)
    best_lag = int(np.argmax(corr[lag_min:lag_max + 1])) + lag_min
    bpm = fps * 60.0 / best_lag
    return round(float(np.clip(bpm, 60.0, 200.0)), 1)


def detect_key(y: np.ndarray) -> tuple[str, str]:
    spec = _stft(y)
    freqs = np.fft.rfftfreq(_N_FFT, d=1.0 / _SR)
    energy = (spec ** 2).sum(axis=1)  # per freq bin
    chroma = np.zeros(12)
    for i in range(1, len(freqs)):
        midi = 69.0 + 12.0 * np.log2(freqs[i] / 440.0)
        chroma[int(round(midi)) % 12] += energy[i]
    chroma /= chroma.sum() + 1e-10

    maj_corr = np.array([float(np.corrcoef(np.roll(MAJOR_PROFILE, i), chroma)[0, 1]) for i in range(12)])
    min_corr = np.array([float(np.corrcoef(np.roll(MINOR_PROFILE, i), chroma)[0, 1]) for i in range(12)])
    mi, ni = int(np.argmax(maj_corr)), int(np.argmax(min_corr))
    if maj_corr[mi] >= min_corr[ni]:
        return f"{KEY_NAMES[mi]} maj", CAMELOT_MAJOR[mi]
    return f"{KEY_NAMES[ni]}m", CAMELOT_MINOR[ni]


def compute_energy(y: np.ndarray) -> int:
    spec = _stft(y)
    rms = np.sqrt(np.mean(spec ** 2, axis=0))
    peak = float(np.max(rms))
    mean = float(np.mean(rms))
    ratio = mean / peak if peak > 0 else 0.5
    return round(min(98, max(30, ratio * 120 + 35)))


def detect_sections(duration: float, bpm: float) -> dict:
    bar = 60.0 / max(bpm, 60) * 4
    return {
        "intro_end": round(min(bar * 16, duration * 0.25), 1),
        "drop_start": round(duration * 0.35, 1),
        "break_start": round(duration * 0.55, 1),
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


def analyze_audio(file_path: str) -> dict:
    y_short = _load(file_path, duration_sec=90)
    y_full = _load(file_path)
    duration = len(y_full) / _SR

    bpm = detect_bpm(y_short)
    key_name, camelot = detect_key(y_short)
    energy = compute_energy(y_short)
    sections = detect_sections(duration, bpm)
    genre = classify_genre(bpm, energy)

    minutes, seconds = int(duration // 60), int(duration % 60)
    return {
        "bpm": bpm,
        "key": key_name,
        "camelot": camelot,
        "energy": energy,
        "duration": f"{minutes}:{seconds:02d}",
        "duration_seconds": round(duration, 1),
        "genre": genre,
        "sections": sections,
    }
