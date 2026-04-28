"use client";

import { motion } from "framer-motion";

interface Props {
  items: string[];
  speed?: number; // seconds for one full cycle
  className?: string;
  /** Hides the gap separator (default ◆ between items). */
  noSeparator?: boolean;
}

const COLORS = [
  "#ff7a00", // orange
  "#5b8cff", // electric blue
  "#ffffff", // white
  "#ff3d6b", // pink
  "#b6e1ff", // cyan glow
  "#7b49ff", // violet
];

/**
 * Infinite horizontal ticker, but each item is rendered with a chunky 3D
 * text-extrude effect (multi-layered text-shadow) that rotates a tiny bit
 * to feel hand-stamped. Items rotate through a brand color palette.
 */
export function Marquee({ items, speed = 38, className = "", noSeparator }: Props) {
  // Duplicate to enable seamless loop.
  const all = [...items, ...items];

  return (
    <div
      className={`relative overflow-hidden py-5 md:py-7 ${className}`}
      style={{
        perspective: 600,
        maskImage:
          "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      <motion.div
        className="flex whitespace-nowrap will-change-transform items-center"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: speed, ease: "linear", repeat: Infinity }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {all.map((it, i) => {
          const color = COLORS[i % COLORS.length];
          const tilt = i % 2 === 0 ? -2 : 2;
          return (
            <span
              key={i}
              className="bs-3d-text inline-flex items-center px-4 md:px-7"
              style={
                {
                  "--bs-3d-color": color,
                  fontSize: "clamp(28px, 5.2vw, 72px)",
                  transform: `rotate(${tilt}deg)`,
                } as React.CSSProperties
              }
            >
              {it}
              {!noSeparator && (
                <span
                  aria-hidden
                  className="mx-3 md:mx-5 inline-block w-2.5 h-2.5 rounded-full align-middle"
                  style={{
                    background: color,
                    boxShadow: `0 0 18px ${color}`,
                    transform: "translateY(-0.35em)",
                  }}
                />
              )}
            </span>
          );
        })}
      </motion.div>
    </div>
  );
}
