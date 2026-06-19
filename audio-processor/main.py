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
    # Полная очистка при остановке сервера
    for d in (STORE_DIR, OUTPUT_DIR):
        for f in d.glob("*"):
            try:
                f.unlink()
            except OSError:
                pass


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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
