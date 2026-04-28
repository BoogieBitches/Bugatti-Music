"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  /** LED color (CSS color). */
  color: string;
  /** Whether the LED is currently lit (controlled, e.g. by sequencer). */
  active?: boolean;
  /** Top label inside the pad. */
  label?: string;
  /** Optional small caption (e.g. BPM, count). */
  caption?: string;
  /** Optional centred icon / glyph node. */
  icon?: ReactNode;
  /** Press handler. */
  onClick?: () => void;
  /** Render as a real <button>. Default true; set false when wrapping a Link. */
  asButton?: boolean;
  /** Visual size variant. */
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
}

/**
 * A 3D drum-machine pad in the spirit of Akai MPC / NI Maschine:
 * inset bevel, soft top highlight, deep bottom shadow, illuminated LED
 * border that lights up on hover/active, and a satisfying press-down
 * animation on tap.
 */
export function DrumPad({
  color,
  active = false,
  label,
  caption,
  icon,
  onClick,
  asButton = true,
  size = "md",
  className = "",
  ariaLabel,
}: Props) {
  const sizeCls = size === "lg" ? "text-base" : size === "sm" ? "text-[11px]" : "text-sm";

  const Tag = asButton ? motion.button : motion.div;

  return (
    <Tag
      type={asButton ? "button" : undefined}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      whileHover={{ y: -2 }}
      whileTap={{ y: 2, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={`drum-pad group relative aspect-square w-full select-none ${sizeCls} ${className}`}
      style={
        {
          // CSS custom property consumed by .drum-pad styles in globals.css
          "--led": color,
        } as React.CSSProperties
      }
      data-active={active ? "true" : "false"}
    >
      {/* LED-lit inner face */}
      <span aria-hidden className="drum-pad-face" />
      {/* LED ring */}
      <span aria-hidden className="drum-pad-led" />
      {/* Top highlight */}
      <span aria-hidden className="drum-pad-gloss" />

      {/* Content */}
      <span className="drum-pad-content">
        {icon && <span className="drum-pad-icon">{icon}</span>}
        {label && (
          <span className="drum-pad-label font-display font-semibold tracking-tight">
            {label}
          </span>
        )}
        {caption && <span className="drum-pad-caption">{caption}</span>}
      </span>
    </Tag>
  );
}
