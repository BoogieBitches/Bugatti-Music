"use client";

import { motion } from "framer-motion";

interface Props {
  /** Lines of graffiti text — each renders on its own row. */
  lines?: string[];
  className?: string;
}

/**
 * A massive, hand-drawn "BUGATTI SOUND" tag rendered as a layered, multi-color
 * 3D extruded text behind the hero. Uses Permanent Marker (Google font) for
 * the marker/spray feel, plus a stack of CSS text-shadows for depth.
 *
 * Decorative — `aria-hidden` so screen readers skip it.
 */
export function GraffitiTitle({
  lines = ["BUGATTI", "SOUND"],
  className = "",
}: Props) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none select-none ${className}`}
      style={{ perspective: 1400 }}
    >
      <motion.div
        initial={{ opacity: 0, rotateX: 35, y: 80 }}
        animate={{ opacity: 1, rotateX: -8, y: 0 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: "preserve-3d", transformOrigin: "left bottom" }}
        className="origin-bottom-left"
      >
        {lines.map((line, i) => (
          <motion.div
            key={`${line}-${i}`}
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.6 }}
            className={`bs-graffiti block leading-[0.78] ${
              i % 2 === 0 ? "" : "-ml-2 sm:-ml-4 md:-ml-6"
            }`}
            style={{
              fontSize: "clamp(72px, 18vw, 280px)",
              transform:
                i === 0
                  ? "rotate(-3deg)"
                  : "rotate(2deg) translateX(2vw)",
            }}
          >
            {line}
          </motion.div>
        ))}
      </motion.div>

      {/* Spray dots / drips */}
      <SprayDecor />
    </div>
  );
}

function SprayDecor() {
  // A handful of decorative dots scattered around the tag.
  const dots: Array<{
    top: string;
    left: string;
    size: number;
    color: string;
    blur: number;
    opacity: number;
  }> = [
    { top: "5%", left: "12%", size: 6, color: "#ff7a00", blur: 1, opacity: 0.7 },
    { top: "82%", left: "8%", size: 4, color: "#5b8cff", blur: 0, opacity: 0.55 },
    { top: "62%", left: "70%", size: 9, color: "#ff7a00", blur: 2, opacity: 0.45 },
    { top: "20%", left: "82%", size: 5, color: "#ff3d6b", blur: 0, opacity: 0.6 },
    { top: "48%", left: "92%", size: 3, color: "#5b8cff", blur: 0, opacity: 0.7 },
    { top: "92%", left: "55%", size: 7, color: "#7b49ff", blur: 1, opacity: 0.5 },
    { top: "35%", left: "5%", size: 4, color: "#b6e1ff", blur: 0, opacity: 0.6 },
  ];
  return (
    <>
      {dots.map((d, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: d.opacity, scale: 1 }}
          transition={{ delay: 0.7 + i * 0.05, duration: 0.4 }}
          className="absolute rounded-full"
          style={{
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            background: d.color,
            filter: d.blur ? `blur(${d.blur}px)` : undefined,
            boxShadow: `0 0 ${d.size * 2}px ${d.color}`,
          }}
        />
      ))}
    </>
  );
}
