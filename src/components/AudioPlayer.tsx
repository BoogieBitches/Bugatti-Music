"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface Props {
  src: string;
  /** When true, indicates the URL is a 30-sec preview (free tier). Shown in UI. */
  isPreview?: boolean;
  /** Optional callback fired once when the user starts playback (used for play counts). */
  onFirstPlay?: () => void;
  className?: string;
}

export function AudioPlayer({ src, isPreview, onFirstPlay, className }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
      if (!firedRef.current && onFirstPlay) {
        firedRef.current = true;
        onFirstPlay();
      }
    } else {
      a.pause();
      setPlaying(false);
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current;
    if (!a) return;
    const v = Number(e.target.value);
    a.currentTime = v;
    setCurrent(v);
  }

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        className="bs-button bs-button-primary !p-0 w-10 h-10 rounded-full"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={current}
          onChange={seek}
          step={0.01}
          className="w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between text-[10px] text-[var(--muted)] mt-1">
          <span>{formatDuration(current)}</span>
          <span className="flex items-center gap-2">
            {isPreview && <span className="bs-badge">PREVIEW</span>}
            {formatDuration(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
