"use client";

import { motion, useReducedMotion } from "framer-motion";

interface Props {
  text: string;
  /** Stagger delay in seconds between characters. */
  stagger?: number;
  /** Initial delay before the animation starts. */
  delay?: number;
  /** Tailwind class names applied to the wrapper. */
  className?: string;
  /** Visual style: per-character upward reveal, or per-word. */
  mode?: "char" | "word";
  /** Replace explicit spaces with non-breaking ones. */
  preserveSpaces?: boolean;
}

/**
 * Editorial-style staggered text reveal — each character (or word) springs
 * up from below with a clipped overflow box, like a magazine title appearing
 * out of nowhere. Falls back to a static render under prefers-reduced-motion.
 */
export function TextReveal({
  text,
  stagger = 0.025,
  delay = 0,
  className = "",
  mode = "char",
  preserveSpaces = true,
}: Props) {
  const reduce = useReducedMotion();
  const segments = mode === "char" ? Array.from(text) : text.split(/(\s+)/);

  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span
      className={`relative inline-block align-baseline ${className}`}
      aria-label={text}
    >
      {segments.map((seg, i) => {
        const isSpace = /^\s+$/.test(seg);
        if (isSpace && preserveSpaces) {
          return (
            <span key={i} aria-hidden className="inline-block">
              {"\u00A0"}
            </span>
          );
        }
        return (
          <span
            key={i}
            aria-hidden
            className="inline-block overflow-hidden align-baseline leading-[1.05]"
          >
            <motion.span
              initial={{ y: "115%", opacity: 0 }}
              whileInView={{ y: "0%", opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{
                duration: 0.7,
                delay: delay + i * stagger,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="inline-block will-change-transform"
            >
              {seg}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
