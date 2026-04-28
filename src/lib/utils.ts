import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function isVideoExt(name: string): boolean {
  return /\.(mp4|webm|mov|gif)$/i.test(name);
}

export function isAudioExt(name: string): boolean {
  return /\.(mp3|wav|aac|ogg|m4a|flac)$/i.test(name);
}

export function isImageExt(name: string): boolean {
  return /\.(png|jpe?g|webp|avif|gif)$/i.test(name);
}
