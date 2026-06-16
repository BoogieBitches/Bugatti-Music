import librosa
import numpy as np
import os


CAMELOT_MINOR = {0: "8A", 1: "3A", 2: "10A", 3: "5A", 4: "12A", 5: "7A",
                 6: "2A", 7: "9A", 8: "4A", 9: "11A", 10: "6A", 11: "1A"}
CAMELOT_MAJOR = {0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
                 6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B"}
KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def detect_key(y: np.ndarray, sr: int) -> tuple[str, str]:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)

    major_corr = np.array([
        float(np.corrcoef(np.roll(MAJOR_PROFILE, i), chroma_mean)[0, 1])
        for i in range(12)
    ])
    minor_corr = np.array([
        float(np.corrcoef(np.roll(MINOR_PROFILE, i), chroma_mean)[0, 1])
        for i in range(12)
    ])

    maj_idx = int(np.argmax(major_corr))
    min_idx = int(np.argmax(minor_corr))

    if major_corr[maj_idx] >= minor_corr[min_idx]:
        return f"{KEY_NAMES[maj_idx]} maj", CAMELOT_MAJOR[maj_idx]
    return f"{KEY_NAMES[min_idx]}m", CAMELOT_MINOR[min_idx]


def compute_energy(y: np.ndarray) -> int:
    rms = librosa.feature.rms(y=y)
    peak = float(np.max(rms))
    mean = float(np.mean(rms))
    ratio = mean / peak if peak > 0 else 0.5
    return round(min(98, max(30, ratio * 120 + 35)))


def detect_sections(y: np.ndarray, sr: int, duration: float, bpm: float) -> dict:
    bar_dur = 60.0 / max(bpm, 60) * 4
    intro_end = round(min(bar_dur * 16, duration * 0.25), 1)
    outro_start = round(max(duration - bar_dur * 16, duration * 0.75), 1)
    drop_start = round(duration * 0.35, 1)
    break_start = round(duration * 0.55, 1)
    return {
        "intro_end": intro_end,
        "drop_start": drop_start,
        "break_start": break_start,
        "outro_start": outro_start,
    }


def classify_genre(bpm: float, energy: int) -> str:
    if bpm < 115:
        return "Deep House"
    elif bpm < 122:
        return "Progressive"
    elif bpm < 126:
        return "Tech House"
    elif bpm < 130:
        return "House"
    elif bpm < 135:
        return "Techno"
    elif bpm < 140:
        return "Hard Techno"
    else:
        return "Trance"


def analyze_audio(file_path: str) -> dict:
    # res_type='scipy' avoids the resampy dependency (not always available on Railway).
    # soundfile is used for loading; if libsndfile is missing, librosa falls back to audioread.
    y_short, sr = librosa.load(file_path, duration=90, mono=True, sr=22050, res_type='scipy')

    tempo_arr, _ = librosa.beat.beat_track(y=y_short, sr=sr)
    bpm = float(tempo_arr[0]) if hasattr(tempo_arr, "__len__") else float(tempo_arr)
    bpm = round(bpm, 1)

    y_full, sr_full = librosa.load(file_path, mono=True, sr=22050, res_type='scipy')
    duration = float(librosa.get_duration(y=y_full, sr=sr_full))
    minutes = int(duration // 60)
    seconds = int(duration % 60)

    key_name, camelot = detect_key(y_short, sr)
    energy = compute_energy(y_short)
    sections = detect_sections(y_short, sr, duration, bpm)
    genre = classify_genre(bpm, energy)

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
