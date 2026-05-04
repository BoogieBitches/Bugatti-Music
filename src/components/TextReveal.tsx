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
  /**
   * "mount" animates immediately on render (best for above-the-fold hero
   * titles). "scroll" waits for the element to enter the viewport (best for
   * below-the-fold section titles).
   */
  trigger?: "mount" | "scroll";
  /**
   * When true, the outer wrapper uses `display: inline` instead of
   * `inline-block`, allowing the text to wrap across multiple lines between
   * segments. Only meaningful together with `mode="word"`.
   */
  allowWrap?: boolean;
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
  trigger = "mount",
  allowWrap = false,
}: Props) {
  const reduce = useReducedMotion();
  const segments = mode === "char" ? Array.from(text) : text.split(/(\s+)/);

  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  const initial = { y: "110%", opacity: 0 };
  const visible = { y: "0%", opacity: 1 };

  return (
    <span
      className={`relative ${allowWrap ? "inline" : "inline-block"} align-baseline ${className}`}
      aria-label={text}
    >
      {segments.map((seg, i) => {
        const isSpace = /^\s+$/.test(seg);
        if (isSpace) {
          // In word mode, render a real breakable whitespace between words
          // so lines can wrap naturally (each word is still an inline-block
          // that can't be split mid-letter). In char mode, keep the old
          // behaviour: render an NBSP so character spacing stays visually
          // tight and doesn't collapse inside an editorial title.
          if (mode === "word") {
            return (
              <span key={i} aria-hidden>
                {" "}
              </span>
            );
          }
          if (preserveSpaces) {
            return (
              <span key={i} aria-hidden className="inline-block">
                {"\u00A0"}
              </span>
            );
          }
        }
        const motionProps =
          trigger === "mount"
            ? { initial, animate: visible }
            : {
                initial,
                whileInView: visible,
                viewport: { once: true, margin: "-10%" },
              };
        return (
          <span
            key={i}
            aria-hidden
            className="inline-block overflow-hidden align-baseline leading-[1.05]"
          >
            <motion.span
              {...motionProps}
              transition={{
                duration: 0.7,
                delay: delay + i * stagger,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="inline-block"
            >
              {seg}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
