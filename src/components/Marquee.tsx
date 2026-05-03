"use client";

import { motion } from "framer-motion";

interface Props {
  items: string[];
  speed?: number; // seconds for one full cycle
  className?: string;
  /** Hides the gap separator (default ◆ between items). */
  noSeparator?: boolean;
}

/**
 * Infinite horizontal ticker rendered in a heavy display font (Bebas Neue)
 * with a "burning" fire-painted text effect. Each item is wrapped in a
 * .bs-fire-glow container so the flames shimmer above the letters.
 */
export function Marquee({ items, speed = 38, className = "", noSeparator }: Props) {
  // Duplicate to enable seamless loop.
  const all = [...items, ...items];

  return (
    <div
      className={`relative overflow-hidden py-6 md:py-9 ${className}`}
      style={{
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
      >
        {all.map((it, i) => (
          <span key={i} className="inline-flex items-center px-5 md:px-8">
            <span
              className="bs-fire-glow leading-none"
              data-text={it}
              style={{ fontSize: "clamp(34px, 6vw, 84px)" }}
            >
              <span className="bs-fire">{it}</span>
            </span>
            {!noSeparator && (
              <span
                aria-hidden
                className="mx-4 md:mx-7 inline-block w-2.5 h-2.5 rounded-full align-middle"
                style={{
                  background: "#ff7a00",
                  boxShadow: "0 0 22px #ff7a00, 0 0 44px rgba(255,90,0,0.55)",
                  transform: "translateY(-0.35em)",
                }}
              />
            )}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
