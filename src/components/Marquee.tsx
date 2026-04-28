"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  items: string[];
  speed?: number; // seconds for one full cycle
  className?: string;
  separator?: ReactNode;
}

/**
 * Infinite horizontal ticker — duplicate content twice and translate -50%
 * for a seamless loop. Pauses on hover for readability.
 */
export function Marquee({ items, speed = 35, className = "", separator }: Props) {
  const sep = separator ?? <span className="mx-6 text-[var(--accent)]">◆</span>;

  return (
    <div
      className={`relative overflow-hidden py-3 ${className}`}
      style={{
        maskImage:
          "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
      }}
    >
      <motion.div
        className="flex whitespace-nowrap will-change-transform"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: speed, ease: "linear", repeat: Infinity }}
      >
        {[...items, ...items].map((it, i) => (
          <span
            key={i}
            className="font-display text-2xl md:text-3xl font-semibold tracking-tight inline-flex items-center"
            style={{
              color: i % 4 === 0 ? "var(--accent-2)" : "rgba(255,255,255,0.85)",
            }}
          >
            {it}
            {sep}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
