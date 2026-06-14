import asyncio
import os
import tempfile
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from analyzer import analyze_audio
from transitions import compute_transitions


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Bugatti Sound — Audio Processor", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/audio/health")
def health():
    return {"status": "ok", "service": "audio-processor"}


@app.post("/audio/analyze")
async def analyze(file: UploadFile = File(...)):
    allowed_exts = {".mp3", ".wav", ".flac", ".aiff", ".m4a"}
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    content = await file.read()
    if len(content) > 150 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 150 MB)")

    with tempfile.NamedTemporaryFile(suffix=ext.lower(), delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, analyze_audio, tmp_path)
        return JSONResponse(content=result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


class TransitionsRequest(BaseModel):
    tracks: list[dict]


@app.post("/audio/transitions")
def transitions(req: TransitionsRequest):
    plans = compute_transitions(req.tracks)
    return {"transitions": [p.__dict__ for p in plans]}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
