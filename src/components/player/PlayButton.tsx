"use client";

import { Pause, Play } from "lucide-react";
import { usePlayer, type PlayerTrack } from "./PlayerStore";

interface Props {
  track: PlayerTrack;
  size?: number;
  className?: string;
  label?: string;
  variant?: "icon" | "pill";
}

export function PlayButton({
  track,
  size = 18,
  className = "",
  label,
  variant = "icon",
}: Props) {
  const { current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;
  const isPlaying = isCurrent && playing;

  function handleClick() {
    if (isCurrent) toggle();
    else play(track);
  }

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`bs-button bs-button-primary inline-flex items-center gap-2 ${className}`}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause size={size} /> : <Play size={size} />}
        <span>{label ?? (isPlaying ? "Пауза" : "Слушать")}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`pb-inline-play ${isPlaying ? "is-playing" : ""} ${className}`}
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      {isPlaying ? <Pause size={size} /> : <Play size={size} className="ml-[1px]" />}
    </button>
  );
}
