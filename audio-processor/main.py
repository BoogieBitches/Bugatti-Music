"""
Bugatti Sound — Audio Processor FastAPI service.

Endpoints:
  GET  /audio/health
  POST /audio/analyze           → upload file, get BPM/key/energy + track_id for reuse
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # cleanup old temp files on exit
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


class GenerateRequest(BaseModel):
    tracks: list[dict]          # [{track_id, bpm, energy, duration_seconds, sections, camelot}, ...]
    transitions: list[dict]     # [{from_track_id, to_track_id, transition_type, transition_bars, bpm_a}, ...]
    mix_style: str = "club"


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
                raise RuntimeError(f"Stored file not found for track_id={tid!r}. "
                                   "Make sure /audio/analyze was called first.")
            track_specs.append(TrackSpec(
                track_id=tid,
                file_path=stored_path,
                bpm=float(t.get("bpm") or 128),
                energy=int(t.get("energy") or 70),
                duration_seconds=float(t.get("duration_seconds") or 300),
                sections=t.get("sections") or {},
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
