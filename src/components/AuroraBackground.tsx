"use client";

import { motion } from "framer-motion";

/**
 * Animated mesh-gradient aurora behind every page. Three slow-rotating blobs
 * in the brand palette, fixed to the viewport for a consistent vibe across pages.
 */
export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ contain: "layout paint" }}
    >
      <motion.div
        className="absolute -top-1/3 -left-1/4 w-[70vw] h-[70vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(91,140,255,0.45), transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ x: [0, 60, 0], y: [0, -40, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -top-1/4 right-[-15%] w-[60vw] h-[60vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,122,0,0.32), transparent 70%)",
          filter: "blur(90px)",
        }}
        animate={{ x: [0, -50, 0], y: [0, 30, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-30%] left-1/3 w-[50vw] h-[50vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(123, 73, 255, 0.30), transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ x: [0, 40, 0], y: [0, 25, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Film grain */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.7'/></svg>\")",
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}
