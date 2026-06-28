"""
Bugatti Sound — Audio Processor FastAPI service.

Endpoints:
  GET  /audio/health
  POST /audio/analyze           → upload file, get BPM/key/energy + track_id for reuse
  POST /audio/analyze-url       → same but accepts a URL instead of a file (for large tracks)
  POST /audio/generate          → submit track_ids + transitions → returns job_id
  GET  /audio/jobs/{job_id}     → poll for status / progress
  GET  /audio/jobs/{job_id}/download → stream finished MP3
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import threading
import time
import urllib.request
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

import uvicorn
from fastapi import BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from analyzer import analyze_audio
from generate import TrackSpec, TransitionSpec, generate_mix
from transitions import compute_transitions

logger = logging.getLogger("audio-processor")
logging.basicConfig(level=logging.INFO)

# ── Gemini setup (pure HTTP — no SDK dependency) ──────────────────────────────
_GEMINI_KEY = os.environ.get("GOOGLE_AI_API_KEY", "")
_GEMINI_MODEL = "gemini-2.5-flash-lite"
_GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{_GEMINI_MODEL}:generateContent?key={_GEMINI_KEY}"
)
if _GEMINI_KEY:
    logger.info("Gemini AI enabled (REST, model=%s)", _GEMINI_MODEL)
else:
    logger.warning("GOOGLE_AI_API_KEY not set — /audio/plan will be unavailable")

# ── Storage directories ──────────────────────────────────────────────────────

STORE_DIR = Path(tempfile.gettempdir()) / "bugatti-audio-store"
STORE_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_DIR = Path(tempfile.gettempdir()) / "bugatti-audio-output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Demucs HF Space ──────────────────────────────────────────────────────────
DEMUCS_URL = os.environ.get("DEMUCS_URL", "https://bugattimusic-bugatti-demucs.hf.space")

# ── In-memory job registry ───────────────────────────────────────────────────

@dataclass
class Job:
    job_id: str
    status: Literal["queued", "running", "done", "error"]
    progress: int        # 0–100
    message: str
    output_path: str | None
    duration_min: float | None
    track_count: int


_jobs: dict[str, Job] = {}
_jobs_lock = threading.Lock()

# ── Stem separation job registry ─────────────────────────────────────────────
_stem_jobs: dict[str, dict] = {}   # track_id → {status, error}
_stem_lock  = threading.Lock()

# ── Lifespan ─────────────────────────────────────────────────────────────────

TRACK_TTL_SEC = 2 * 3600   # удаляем треки старше 2 часов
JOB_TTL_SEC   = 4 * 3600   # удаляем завершённые job старше 4 часов
CLEANUP_INTERVAL_SEC = 3600  # запускаем каждый час


def _cleanup_old_files() -> None:
    """Удаляет старые треки и выходные файлы, очищает _jobs."""
    now = time.time()

    removed_tracks = removed_outputs = 0
    for f in STORE_DIR.glob("*"):
        try:
            if now - f.stat().st_mtime > TRACK_TTL_SEC:
                f.unlink()
                removed_tracks += 1
        except OSError:
            pass

    for f in OUTPUT_DIR.glob("*"):
        try:
            if now - f.stat().st_mtime > JOB_TTL_SEC:
                f.unlink()
                removed_outputs += 1
        except OSError:
            pass

    stale_jobs = []
    with _jobs_lock:
        for jid, job in list(_jobs.items()):
            if job.status in ("done", "error"):
                out = Path(job.output_path) if job.output_path else None
                if out is None or not out.exists():
                    stale_jobs.append(jid)
        for jid in stale_jobs:
            del _jobs[jid]

    logger.info(
        "Cleanup: removed %d tracks, %d outputs, %d stale jobs",
        removed_tracks, removed_outputs, len(stale_jobs),
    )


async def _periodic_cleanup() -> None:
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SEC)
        await asyncio.get_event_loop().run_in_executor(None, _cleanup_old_files)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Запускаем периодическую очистку в фоне
    task = asyncio.create_task(_periodic_cleanup())
    logger.info("Periodic cleanup task started (every %dh)", CLEANUP_INTERVAL_SEC // 3600)
    yield
    task.cancel()
    # NOTE: We intentionally do NOT delete track files on shutdown.
    # Railway restarts the process on every deploy — deleting files here
    # would wipe uploads that users are still working with.
    # Files are cleaned up by the TTL-based periodic cleanup instead (2h TTL).


app = FastAPI(title="Bugatti Sound — Audio Processor", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ──────────────────────────────────────────────────────────────────

ALLOWED_EXT = {".mp3", ".wav", ".flac", ".aiff", ".m4a", ".ogg"}
MAX_SIZE_MB = 150


async def _save_upload(file: UploadFile) -> tuple[str, str, Path]:
    """Save an uploaded file to STORE_DIR, return (track_id, ext, path)."""
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower() or ".mp3"
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported format: {ext}")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, f"File too large (max {MAX_SIZE_MB} MB)")

    track_id = str(uuid.uuid4())
    path = STORE_DIR / f"{track_id}{ext}"
    path.write_bytes(content)
    return track_id, ext, path

# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/audio/health")
def health():
    return {"status": "ok", "service": "audio-processor"}


@app.post("/audio/analyze")
async def analyze(file: UploadFile = File(...)):
    """Analyze an audio file. Returns BPM, key, energy, etc. + a track_id for later generation."""
    track_id, ext, path = await _save_upload(file)
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, analyze_audio, str(path))
        result["track_id"] = track_id
        result["stored_ext"] = ext
        return JSONResponse(content=result)
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(500, f"Analysis failed: {exc}") from exc


class AnalyzeUrlRequest(BaseModel):
    url: str
    filename: str = "track.mp3"


@app.post("/audio/analyze-url")
async def analyze_from_url(req: AnalyzeUrlRequest):
    """Analyze audio from a URL (e.g. Supabase signed URL).
    Avoids Vercel 4.5 MB body limit — browser uploads file to Supabase,
    then sends the URL here for analysis.
    """
    ext = os.path.splitext(req.filename)[1].lower() or ".mp3"
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported format: {ext}")

    track_id = str(uuid.uuid4())
    path = STORE_DIR / f"{track_id}{ext}"

    try:
        loop = asyncio.get_event_loop()

        def _download() -> None:
            opener = urllib.request.build_opener()
            opener.addheaders = [("User-Agent", "bugatti-audio-processor/1.0")]
            with opener.open(req.url, timeout=120) as resp:
                data = resp.read()
            if len(data) > MAX_SIZE_MB * 1024 * 1024:
                raise ValueError(f"File too large (max {MAX_SIZE_MB} MB)")
            path.write_bytes(data)

        await loop.run_in_executor(None, _download)
        result = await loop.run_in_executor(None, analyze_audio, str(path))
        result["track_id"] = track_id
        result["stored_ext"] = ext
        return JSONResponse(content=result)
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(500, f"Analysis failed: {exc}") from exc


class PlanRequest(BaseModel):
    tracks: list[dict]  # [{id, name, bpm, key, camelot, energy, genre, duration}, ...]


@app.post("/audio/plan")
async def plan_mix(req: PlanRequest):
    """Use Gemini AI (via REST) to suggest optimal track order for a DJ set."""
    import json as _json
    import urllib.request as _urlreq

    if not _GEMINI_KEY:
        raise HTTPException(503, "Gemini AI not configured (GOOGLE_AI_API_KEY missing)")
    if len(req.tracks) < 2:
        raise HTTPException(400, "Need at least 2 tracks to plan a set")

    lines = []
    for i, t in enumerate(req.tracks):
        name   = t.get("name", f"Track {i+1}")
        bpm    = t.get("bpm", "?")
        key    = t.get("key", t.get("camelot", "?"))
        cam    = t.get("camelot", "?")
        energy = t.get("energy", "?")
        genre  = t.get("genre", "?")
        dur    = t.get("duration", t.get("durationSeconds", "?"))
        lines.append(
            f"  [{i}] {name} | BPM: {bpm} | Key: {key} | Camelot: {cam}"
            f" | Energy: {energy}/100 | Genre: {genre} | Duration: {dur}s"
        )

    track_list = "\n".join(lines)
    prompt = (
        "You are an expert DJ and music director. Plan the optimal track order for this club DJ set.\n\n"
        f"Tracks (indices in brackets):\n{track_list}\n\n"
        "Rules:\n"
        "1. Energy arc: start moderate → build to peak (60-75% of set) → cool down at end\n"
        "2. Harmonic mixing: prefer adjacent Camelot keys (e.g. 8A→8B or 8A→9A)\n"
        "3. BPM flow: gradual tempo changes preferred; avoid >10 BPM jumps\n"
        "4. Genre cohesion: group similar genres when possible\n\n"
        'Respond with ONLY valid JSON, no markdown fences, no extra text:\n'
        '{"order":[<original indices in optimal play order>],'
        '"reasoning":"<2-3 sentences>","energy_arc":"<one-line>"}'
    )

    payload = _json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 512},
    }).encode()

    def _call_gemini() -> str:
        req_obj = _urlreq.Request(
            _GEMINI_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _urlreq.urlopen(req_obj, timeout=30) as resp:
            body = _json.loads(resp.read())
        return body["candidates"][0]["content"]["parts"][0]["text"]

    try:
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, _call_gemini)
        raw = raw.strip()
        # strip accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        data = _json.loads(raw)
        n = len(req.tracks)
        order = data.get("order", list(range(n)))
        if sorted(order) != list(range(n)):
            order = list(range(n))
        return {
            "order": order,
            "reasoning": data.get("reasoning", ""),
            "energy_arc": data.get("energy_arc", ""),
        }
    except Exception as exc:
        logger.error("Gemini plan failed: %s", exc)
        raise HTTPException(500, f"AI planning failed: {exc}") from exc


class GenerateRequest(BaseModel):
    tracks: list[dict]          # [{track_id, bpm, energy, duration_seconds, sections, camelot}, ...]
    transitions: list[dict]     # [{from_track_id, to_track_id, transition_type, transition_bars, bpm_a}, ...]
    mix_style: str = "club"
    target_bpm: float | None = None   # master BPM; all tracks are stretched to this


@app.post("/audio/generate")
def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    """Start async mix generation. Returns job_id for polling."""
    job_id = str(uuid.uuid4())

    job = Job(
        job_id=job_id,
        status="queued",
        progress=0,
        message="Queued",
        output_path=None,
        duration_min=None,
        track_count=len(req.tracks),
    )
    with _jobs_lock:
        _jobs[job_id] = job

    background_tasks.add_task(_run_generation, job_id, req)
    return {"job_id": job_id}


@app.get("/audio/jobs/{job_id}")
def job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
        "duration_min": job.duration_min,
        "track_count": job.track_count,
    }


@app.get("/audio/jobs/{job_id}/download")
def job_download(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "done":
        raise HTTPException(409, f"Job not done yet (status: {job.status})")
    if not job.output_path or not Path(job.output_path).exists():
        raise HTTPException(500, "Output file missing")
    return FileResponse(
        job.output_path,
        media_type="audio/mpeg",
        filename=f"bugatti-mix-{job_id[:8]}.mp3",
    )


# ── Stem separation helpers ───────────────────────────────────────────────────

def _stems_path(track_id: str, stem: str) -> Path:
    return STORE_DIR / f"{track_id}_stems_{stem}.wav"

def _stems_ready(track_id: str) -> bool:
    """True if all 4 Demucs stems exist on disk for this track."""
    return all(_stems_path(track_id, s).exists() for s in ("bass", "drums", "other", "vocals"))

def _submit_stems_bg(track_id: str, file_path: str) -> None:
    """Background thread: upload track → HF Space Demucs → poll → save stems to disk."""
    def _upd(status: str, error: str | None = None) -> None:
        with _stem_lock:
            _stem_jobs[track_id] = {"status": status, "error": error}

    try:
        # ── Wake up HF Space (may be sleeping) ───────────────────────────────
        _upd("warming_up")
        last_err = None
        for attempt in range(6):
            try:
                with urllib.request.urlopen(f"{DEMUCS_URL}/health", timeout=30) as r:
                    if r.status == 200:
                        break
            except Exception as e:
                last_err = e
                time.sleep(20)
        else:
            raise RuntimeError(f"HF Space не ответил после 2 мин: {last_err}")

        # ── Upload audio as multipart/form-data ──────────────────────────────
        _upd("uploading")
        boundary = str(uuid.uuid4()).replace("-", "").encode()
        ext = Path(file_path).suffix or ".mp3"
        with open(file_path, "rb") as fh:
            file_bytes = fh.read()

        CRLF = b"\r\n"

        def _mp_field(name: str, value: str) -> bytes:
            return (
                b"--" + boundary + CRLF +
                b'Content-Disposition: form-data; name="' + name.encode() + b'"' + CRLF +
                CRLF +
                value.encode() + CRLF
            )

        body = (
            _mp_field("track_id", track_id) +
            b"--" + boundary + CRLF +
            b'Content-Disposition: form-data; name="file"; filename="track' + ext.encode() + b'"' + CRLF +
            b"Content-Type: audio/mpeg" + CRLF +
            CRLF +
            file_bytes + CRLF +
            b"--" + boundary + b"--" + CRLF
        )
        req = urllib.request.Request(
            f"{DEMUCS_URL}/separate",
            data=body,
            headers={"Content-Type": "multipart/form-data; boundary=" + boundary.decode()},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=180) as r:
            resp = json.loads(r.read())
        job_id = resp["job_id"]

        # ── Poll status every 15 s (max 35 min) ──────────────────────────────
        _upd("processing")
        for _ in range(140):
            time.sleep(15)
            try:
                with urllib.request.urlopen(f"{DEMUCS_URL}/status/{job_id}", timeout=15) as r:
                    s = json.loads(r.read())
                if s["status"] == "done":
                    break
                if s["status"] == "error":
                    raise RuntimeError(f"Demucs error: {s.get('error')}")
            except (urllib.error.URLError, TimeoutError):
                pass  # transient — keep polling
        else:
            raise RuntimeError("Demucs timeout (>35 min)")

        # ── Download stems ────────────────────────────────────────────────────
        _upd("downloading")
        for stem in ("bass", "drums", "other", "vocals"):
            with urllib.request.urlopen(f"{DEMUCS_URL}/stems/{job_id}/{stem}", timeout=120) as r:
                _stems_path(track_id, stem).write_bytes(r.read())

        _upd("done")
        logger.info("Stems saved for track %s", track_id)

    except Exception as exc:
        logger.exception("Stem separation failed for track %s", track_id)
        _upd("error", str(exc))


@app.post("/audio/stems/request")
def request_stems(track_id: str = Form(...)):
    """Submit a track for Demucs stem separation in the background (non-blocking)."""
    stored_path: str | None = None
    for ext in ALLOWED_EXT:
        c = STORE_DIR / f"{track_id}{ext}"
        if c.exists():
            stored_path = str(c)
            break
    if not stored_path:
        raise HTTPException(404, f"Track {track_id!r} not found — re-upload and analyze first.")

    with _stem_lock:
        current = _stem_jobs.get(track_id, {})

    # Idempotent: don't re-submit if already running or done
    if current.get("status") in ("warming_up", "uploading", "processing", "downloading"):
        return {"track_id": track_id, "status": current["status"], "reused": True}
    if current.get("status") == "done" or _stems_ready(track_id):
        return {"track_id": track_id, "status": "done", "reused": True}

    with _stem_lock:
        _stem_jobs[track_id] = {"status": "queued", "error": None}

    t = threading.Thread(target=_submit_stems_bg, args=(track_id, stored_path), daemon=True)
    t.start()
    return {"track_id": track_id, "status": "queued"}


@app.get("/audio/stems/status/{track_id}")
def stems_status(track_id: str):
    """Poll stem separation progress for a track."""
    if _stems_ready(track_id):
        return {"track_id": track_id, "status": "done"}
    with _stem_lock:
        job = _stem_jobs.get(track_id)
    if job is None:
        return {"track_id": track_id, "status": "not_started"}
    return {"track_id": track_id, **job}

# ── Background generation task ───────────────────────────────────────────────

def _set_job(job_id: str, **kwargs):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)


def _run_generation(job_id: str, req: GenerateRequest):
    _set_job(job_id, status="running", progress=5, message="Starting...")
    output_path = str(OUTPUT_DIR / f"{job_id}.mp3")

    try:
        track_specs: list[TrackSpec] = []
        for t in req.tracks:
            tid = t.get("track_id") or t.get("id", "")
            # find stored file
            stored_path = None
            for ext in ALLOWED_EXT:
                candidate = STORE_DIR / f"{tid}{ext}"
                if candidate.exists():
                    stored_path = str(candidate)
                    break
            if not stored_path:
                raise RuntimeError(
                    f"Track {tid!r} not found — the server restarted and cleared uploads. "
                    "Please re-upload your tracks (re-run Analyze on each file) and try again."
                )
            track_specs.append(TrackSpec(
                track_id=tid,
                file_path=stored_path,
                bpm=float(t.get("bpm") or 128),
                energy=int(t.get("energy") or 70),
                duration_seconds=float(t.get("duration_seconds") or 300),
                sections=t.get("sections") or {},
                beatgrid=t.get("beatgrid") or None,
            ))

        trans_specs: list[TransitionSpec] = []
        for tr in req.transitions:
            trans_specs.append(TransitionSpec(
                from_track_id=tr.get("from_track_id", ""),
                to_track_id=tr.get("to_track_id", ""),
                transition_type=tr.get("transition_type", "crossfade"),
                transition_bars=int(tr.get("transition_bars") or 16),
                bpm_a=float(tr.get("bpm_a") or 128),
                bpm_b=float(tr.get("bpm_b") or tr.get("bpm_a") or 128),
            ))

        def _progress_cb(pct: int, msg: str):
            _set_job(job_id, progress=max(5, pct), message=msg)

        mp3_bytes = generate_mix(
            tracks=track_specs,
            transitions=trans_specs,
            mix_style=req.mix_style,
            progress_callback=_progress_cb,
            target_bpm=req.target_bpm,
        )

        Path(output_path).write_bytes(mp3_bytes)

        # Estimate duration
        total_dur = sum(t.get("duration_seconds") or 0 for t in req.tracks)
        overlap = sum(
            max(0, (tr.get("transition_bars") or 16) * (60 / max(tr.get("bpm_a") or 128, 60)) * 4)
            for tr in req.transitions
        )
        duration_min = round((total_dur - overlap) / 60, 1)

        _set_job(job_id, status="done", progress=100, message="Done",
                 output_path=output_path, duration_min=duration_min)

    except Exception as exc:
        logger.exception("Generation failed for job %s", job_id)
        _set_job(job_id, status="error", progress=0, message=str(exc))


# ── Beat Generator (procedural synthesis — no external API) ──────────────────

class MusicGenRequest(BaseModel):
    prompt: str
    duration: int = 30  # seconds


def _detect_genre_params(prompt: str) -> dict:
    """Detect BPM, scale and genre from prompt text."""
    p = prompt.lower()
    if "drum & bass" in p or "dnb" in p or "jungle" in p:
        return {"bpm": 174, "genre": "dnb", "scale": "minor"}
    if "techno" in p:
        return {"bpm": 140, "genre": "techno", "scale": "minor"}
    if "trance" in p:
        return {"bpm": 138, "genre": "trance", "scale": "minor"}
    if "dubstep" in p:
        return {"bpm": 140, "genre": "dubstep", "scale": "minor"}
    if "trap" in p:
        return {"bpm": 140, "genre": "trap", "scale": "minor"}
    if "house" in p:
        return {"bpm": 128, "genre": "house", "scale": "major"}
    if "lo-fi" in p or "lofi" in p or "lo fi" in p:
        return {"bpm": 85, "genre": "lofi", "scale": "minor"}
    if "hip" in p or "hop" in p or "boom" in p or "bap" in p:
        return {"bpm": 90, "genre": "hiphop", "scale": "minor"}
    if "ambient" in p or "chill" in p or "atmospheric" in p:
        return {"bpm": 80, "genre": "ambient", "scale": "major"}
    if "pop" in p:
        return {"bpm": 120, "genre": "pop", "scale": "major"}
    # extract numeric BPM if mentioned
    import re
    m = re.search(r"(\d{2,3})\s*bpm", p)
    bpm = int(m.group(1)) if m else 120
    return {"bpm": bpm, "genre": "house", "scale": "minor"}


def _synth_kick(sr: int, decay: float = 0.45, pitch: float = 60.0) -> "np.ndarray":
    import numpy as np
    t = np.linspace(0, decay, int(sr * decay), endpoint=False)
    freq = pitch * np.exp(-15 * t)
    env = np.exp(-8 * t)
    click = np.exp(-300 * t) * 0.6
    wave = np.sin(2 * np.pi * freq * t) * env + click
    return (wave / np.max(np.abs(wave) + 1e-9) * 0.95).astype(np.float32)


def _synth_snare(sr: int, decay: float = 0.18) -> "np.ndarray":
    import numpy as np
    n = int(sr * decay)
    t = np.linspace(0, decay, n, endpoint=False)
    noise = np.random.randn(n).astype(np.float32)
    tone = np.sin(2 * np.pi * 200 * t).astype(np.float32)
    env = np.exp(-20 * t).astype(np.float32)
    wave = (noise * 0.7 + tone * 0.3) * env
    return (wave / np.max(np.abs(wave) + 1e-9) * 0.80).astype(np.float32)


def _synth_hihat(sr: int, decay: float = 0.05, open_: bool = False) -> "np.ndarray":
    import numpy as np
    if open_:
        decay = 0.22
    n = int(sr * decay)
    t = np.linspace(0, decay, n, endpoint=False)
    noise = np.random.randn(n).astype(np.float32)
    # high-pass: difference filter approximation
    filtered = np.diff(noise, prepend=noise[0])
    env = np.exp(-30 * t if not open_ else -8 * t).astype(np.float32)
    wave = filtered * env
    return (wave / np.max(np.abs(wave) + 1e-9) * 0.55).astype(np.float32)


def _synth_clap(sr: int) -> "np.ndarray":
    import numpy as np
    decay = 0.12
    n = int(sr * decay)
    t = np.linspace(0, decay, n, endpoint=False)
    noise = np.random.randn(n).astype(np.float32)
    env = (np.exp(-40 * t) + 0.3 * np.exp(-15 * (t - 0.01).clip(0))).astype(np.float32)
    wave = noise * env
    return (wave / np.max(np.abs(wave) + 1e-9) * 0.65).astype(np.float32)


def _synth_bass_note(sr: int, freq: float, dur: float, genre: str) -> "np.ndarray":
    import numpy as np
    n = int(sr * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    if genre in ("hiphop", "lofi", "trap"):
        wave = (np.sin(2 * np.pi * freq * t) * 0.7
                + np.sin(2 * np.pi * freq * 2 * t) * 0.2
                + np.sin(2 * np.pi * freq * 3 * t) * 0.1)
    else:
        # sawtooth-ish (summed harmonics)
        wave = sum(np.sin(2 * np.pi * freq * k * t) / k
                   for k in range(1, 6))
    env = np.exp(-3 * t).astype(np.float32)
    wave = (wave * env).astype(np.float32)
    return (wave / np.max(np.abs(wave) + 1e-9) * 0.55).astype(np.float32)


def _synth_pad(sr: int, root_hz: float, scale: str, duration: int) -> "np.ndarray":
    import numpy as np
    intervals = [0, 3, 7, 10] if scale == "minor" else [0, 4, 7, 11]
    freqs = [root_hz * 2 ** (i / 12) for i in intervals]
    n = duration * sr
    t = np.linspace(0, duration, n, endpoint=False)
    pad = np.zeros(n, dtype=np.float32)
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.25 * t)
    for freq in freqs:
        pad += np.sin(2 * np.pi * freq * t).astype(np.float32)
        pad += 0.3 * np.sin(2 * np.pi * freq * 1.005 * t).astype(np.float32)
    pad *= lfo
    return (pad / np.max(np.abs(pad) + 1e-9) * 0.18).astype(np.float32)


def _place(buf: "np.ndarray", sample: "np.ndarray", offset: int) -> None:
    end = min(offset + len(sample), len(buf))
    chunk = sample[: end - offset]
    buf[offset: offset + len(chunk)] += chunk


def _generate_beat(prompt: str, duration: int) -> bytes:
    import io
    import numpy as np
    from scipy.io import wavfile  # type: ignore

    np.random.seed(abs(hash(prompt)) % (2 ** 31))

    SR = 44100
    params = _detect_genre_params(prompt)
    bpm = params["bpm"]
    genre = params["genre"]
    scale = params["scale"]

    spb = int(SR * 60 / bpm)   # samples per beat
    total = duration * SR
    mix = np.zeros(total, dtype=np.float32)

    # Pre-render drum sounds
    kick  = _synth_kick(SR)
    snare = _synth_snare(SR)
    hh_c  = _synth_hihat(SR, open_=False)
    hh_o  = _synth_hihat(SR, open_=True)
    clap  = _synth_clap(SR)

    # Root frequency (A2 = 110 Hz typical bass root)
    root_hz = 110.0

    # Genre-specific patterns (16-step grid, 1 step = spb/4 samples)
    step = spb // 4

    PATTERNS: dict[str, dict[str, list[int]]] = {
        "house": {
            "kick":  [0, 4, 8, 12],
            "snare": [4, 12],
            "hh_c":  [0, 2, 4, 6, 8, 10, 12, 14],
            "hh_o":  [6, 14],
        },
        "techno": {
            "kick":  [0, 4, 8, 12],
            "snare": [4, 8, 12],
            "hh_c":  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            "hh_o":  [],
        },
        "dnb": {
            "kick":  [0, 10],
            "snare": [4, 12],
            "hh_c":  [0, 2, 4, 6, 8, 10, 12, 14],
            "hh_o":  [3, 7, 11, 15],
        },
        "trap": {
            "kick":  [0, 6, 8, 14],
            "snare": [],
            "clap":  [4, 12],
            "hh_c":  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            "hh_o":  [7, 15],
        },
        "hiphop": {
            "kick":  [0, 6, 10],
            "snare": [4, 12],
            "hh_c":  [0, 2, 4, 6, 8, 10, 12, 14],
            "hh_o":  [],
        },
        "trance": {
            "kick":  [0, 4, 8, 12],
            "snare": [4, 12],
            "hh_c":  [0, 2, 4, 6, 8, 10, 12, 14],
            "hh_o":  [6],
        },
        "dubstep": {
            "kick":  [0, 12],
            "snare": [8],
            "hh_c":  [0, 4, 8, 12],
            "hh_o":  [6, 14],
        },
        "lofi": {
            "kick":  [0, 8],
            "snare": [4, 12],
            "hh_c":  [0, 3, 6, 9, 12, 15],
            "hh_o":  [],
        },
        "ambient": {
            "kick":  [0, 8],
            "snare": [],
            "hh_c":  [0, 4, 8, 12],
            "hh_o":  [6],
        },
        "pop": {
            "kick":  [0, 4, 8, 12],
            "snare": [4, 12],
            "hh_c":  [0, 2, 4, 6, 8, 10, 12, 14],
            "hh_o":  [],
        },
    }

    pat = PATTERNS.get(genre, PATTERNS["house"])
    bar_len = step * 16  # 1 bar = 16 steps

    sound_map = {"kick": kick, "snare": snare, "hh_c": hh_c, "hh_o": hh_o, "clap": clap}
    bar = 0
    pos = 0
    while pos < total:
        for inst, steps in pat.items():
            snd = sound_map.get(inst)
            if snd is None:
                continue
            for s in steps:
                offset = pos + s * step
                if offset < total:
                    # slight humanisation ±2 ms
                    jitter = int(np.random.randint(-int(SR * 0.002), int(SR * 0.002)))
                    _place(mix, snd, max(0, offset + jitter))
        pos += bar_len
        bar += 1

    # Bass line (simple 2-bar pattern)
    minor_steps = [0, 3, 7, 10, 12]
    major_steps = [0, 4, 7, 11, 12]
    note_pool = minor_steps if scale == "minor" else major_steps
    bass_pos = 0
    beat_dur = 60.0 / bpm
    while bass_pos < total:
        note_idx = (bass_pos // spb) % len(note_pool)
        semitone = note_pool[note_idx]
        freq = root_hz * 2 ** (semitone / 12)
        note_samples = _synth_bass_note(SR, freq, beat_dur * 0.9, genre)
        _place(mix, note_samples * 0.7, bass_pos)
        bass_pos += spb

    # Atmospheric pad (quiet, only for melodic genres)
    if genre not in ("techno", "dnb"):
        pad = _synth_pad(SR, root_hz * 2, scale, duration)
        mix += pad[: total]

    # Limiter / normalise
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = mix / peak * 0.92

    # Convert to 16-bit PCM WAV
    pcm = (mix * 32767).astype(np.int16)
    buf = io.BytesIO()
    wavfile.write(buf, SR, pcm)
    return buf.getvalue()


def _run_musicgen(job_id: str, prompt: str, duration: int) -> None:
    """Background thread: synthesises a beat procedurally (no external API)."""
    try:
        _set_job(job_id, status="running", progress=10,
                 message="Анализируем жанр и темп…")
        params = _detect_genre_params(prompt)
        _set_job(job_id, status="running", progress=35,
                 message=f"Синтезируем барабаны ({params['bpm']} BPM)…")
        _set_job(job_id, status="running", progress=60,
                 message="Генерируем бас и атмосферу…")
        wav_bytes = _generate_beat(prompt, duration)
        _set_job(job_id, status="running", progress=90,
                 message="Финальная обработка…")
        out_path = OUTPUT_DIR / f"musicgen-{job_id}.wav"
        out_path.write_bytes(wav_bytes)
        _set_job(job_id, status="done", progress=100, message="Бит готов!",
                 output_path=str(out_path),
                 duration_min=round(duration / 60, 2))
    except Exception as exc:
        logger.exception("beat generation failed")
        _set_job(job_id, status="error", progress=0, message=str(exc))


@app.post("/audio/musicgen")
async def musicgen_start(req: MusicGenRequest):
    """Submit a MusicGen job; returns job_id for polling via /audio/jobs/{id}."""
    if not req.prompt.strip():
        raise HTTPException(422, "prompt must not be empty")
    duration = max(5, min(req.duration, 120))
    job_id = uuid.uuid4().hex
    job = Job(
        job_id=job_id,
        status="queued",
        progress=0,
        message="Queued…",
        output_path=None,
        duration_min=None,
        track_count=0,
    )
    with _jobs_lock:
        _jobs[job_id] = job
    threading.Thread(
        target=_run_musicgen, args=(job_id, req.prompt.strip(), duration), daemon=True
    ).start()
    return {"job_id": job_id}


@app.get("/audio/musicgen/{job_id}/download")
async def musicgen_download(job_id: str):
    """Stream the finished WAV for a completed MusicGen job."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "done" or not job.output_path:
        raise HTTPException(409, f"Job not ready (status={job.status})")
    out = Path(job.output_path)
    if not out.exists():
        raise HTTPException(410, "File expired — please regenerate")
    return FileResponse(str(out), media_type="audio/wav",
                        filename=f"bugatti-beat-{job_id[:8]}.wav")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
