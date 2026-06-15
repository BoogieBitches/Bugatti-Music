"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  url: string;
  durationMin?: number | null;
  downloadFilename?: string;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export function WaveformPlayer({ url, durationMin, downloadFilename = "bugatti-mix.mp3" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.85);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any;

    (async () => {
      try {
        const WaveSurfer = (await import("wavesurfer.js")).default;
        ws = WaveSurfer.create({
          container: containerRef.current!,
          waveColor: "rgba(122,85,255,0.35)",
          progressColor: "rgba(184,157,255,0.85)",
          cursorColor: "rgba(255,255,255,0.5)",
          barWidth: 2,
          barGap: 1,
          barRadius: 3,
          height: 72,
          url,
          fetchParams: { credentials: "omit" },
        });
        wsRef.current = ws;
        ws.setVolume(volume);

        ws.on("ready", () => { setDuration(ws.getDuration()); setLoading(false); });
        ws.on("timeupdate", (t: number) => setCurrentTime(t));
        ws.on("play",   () => setPlaying(true));
        ws.on("pause",  () => setPlaying(false));
        ws.on("finish", () => { setPlaying(false); setCurrentTime(0); ws.seekTo(0); });
        ws.on("error",  (e: unknown) => { setError(String(e)); setLoading(false); });
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    })();

    return () => { ws?.destroy(); wsRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function togglePlay() { wsRef.current?.playPause(); }

  function handleVolume(v: number) {
    setVolume(v);
    wsRef.current?.setVolume(v);
  }

  function handleZoom(z: number) {
    setZoom(z);
    wsRef.current?.zoom(z);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bs-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-black text-xl bs-text-gradient leading-none">Mix Ready</h2>
          {durationMin && (
            <span className="text-xs text-white/40">~{durationMin} min</span>
          )}
        </div>
        <span className="px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 text-xs font-bold border border-green-500/25">
          ✓ COMPLETE
        </span>
      </div>

      {/* Waveform */}
      <div className="relative">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/5 z-10">
            <span className="flex items-center gap-2 text-xs text-white/40">
              <span className="w-3.5 h-3.5 border-2 border-[var(--accent)]/50 border-t-[var(--accent)] rounded-full animate-spin" />
              Loading waveform…
            </span>
          </div>
        )}
        {error && (
          <div className="py-6 flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/5 text-xs text-white/30">
            Waveform unavailable — use the player below
          </div>
        )}
        <div
          ref={containerRef}
          className={`rounded-xl overflow-hidden px-2 py-1 bg-white/[0.025] border border-white/5 cursor-pointer ${loading || error ? "opacity-0 absolute" : ""}`}
          style={{ minHeight: 80 }}
        />
      </div>

      {/* Time bar */}
      {!loading && !error && (
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-white/50 w-10 text-right">{fmt(currentTime)}</span>
          <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-[var(--accent-2)] transition-all"
              style={{ width: `${progress}%` }} />
          </div>
          <span className="text-white/30 w-10">{fmt(duration)}</span>
        </div>
      )}

      {/* Controls row */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          disabled={loading && !error}
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all duration-150 disabled:opacity-30"
          style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-2))" }}
        >
          {playing ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Volume */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <svg className="w-4 h-4 text-white/30 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          </svg>
          <input type="range" min="0" max="1" step="0.01" value={volume}
            onChange={e => handleVolume(Number(e.target.value))}
            className="flex-1 h-1 accent-[var(--accent-2)] cursor-pointer"
            style={{ accentColor: "var(--accent-2)" }}
          />
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2 min-w-[100px]">
          <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
          </svg>
          <input type="range" min="1" max="200" step="10" value={zoom}
            onChange={e => handleZoom(Number(e.target.value))}
            className="flex-1 h-1 cursor-pointer"
            style={{ accentColor: "var(--accent-2)" }}
          />
        </div>

        {/* Download */}
        <a
          href={url}
          download={downloadFilename}
          className="ml-auto bs-button bs-button-primary px-5 py-2.5 text-sm font-bold flex items-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13M7 11l5 5 5-5M4 20h16"/>
          </svg>
          Download MP3
        </a>
      </div>
    </div>
  );
}
