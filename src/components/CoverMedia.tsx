"use client";

import { useState } from "react";
import { isVideoExt } from "@/lib/utils";

interface Props {
  imageUrl?: string | null;
  videoUrl?: string | null;
  alt: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Cover renderer that prefers a video/animation if present, falling back to image.
 * Videos auto-play muted in a loop (so they behave like animated cover art).
 */
export function CoverMedia({ imageUrl, videoUrl, alt, className, size = "md" }: Props) {
  const [videoFailed, setVideoFailed] = useState(false);
  const showVideo = !!videoUrl && !videoFailed && isVideoExt(videoUrl);
  const isGif = !!videoUrl && /\.gif$/i.test(videoUrl);

  const dim =
    size === "sm" ? "w-16 h-16" : size === "lg" ? "w-full aspect-square" : "w-28 h-28";

  return (
    <div className={`${dim} ${className ?? ""} rounded-xl overflow-hidden bg-[var(--muted-2)] border border-[var(--border)] flex items-center justify-center`}>
      {showVideo && !isGif ? (
        <video
          src={videoUrl!}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : showVideo && isGif ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={videoUrl!} alt={alt} className="w-full h-full object-cover" />
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-[var(--accent)]/40 to-[var(--accent-2)]/30" />
      )}
    </div>
  );
}
