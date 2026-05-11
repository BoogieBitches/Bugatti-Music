"use client";

import { motion, useScroll, useTransform } from "framer-motion";

/**
 * Animated mesh-gradient aurora behind every page. Three slow-rotating blobs
 * in the brand palette, fixed to the viewport for a consistent vibe across
 * pages. Each blob also drifts vertically with scroll position (parallax) so
 * the bg subtly tracks the user as they read.
 */
export function AuroraBackground() {
  const { scrollY } = useScroll();
  // Blobs travel at different rates → depth illusion.
  const y1 = useTransform(scrollY, [0, 2000], [0, 120]);
  const y2 = useTransform(scrollY, [0, 2000], [0, -160]);
  const y3 = useTransform(scrollY, [0, 2000], [0, 80]);

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
          y: y1,
        }}
        animate={{ x: [0, 60, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -top-1/4 right-[-15%] w-[60vw] h-[60vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,122,0,0.32), transparent 70%)",
          filter: "blur(90px)",
          y: y2,
        }}
        animate={{ x: [0, -50, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-30%] left-1/3 w-[50vw] h-[50vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(123, 73, 255, 0.30), transparent 70%)",
          filter: "blur(80px)",
          y: y3,
        }}
        animate={{ x: [0, 40, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
