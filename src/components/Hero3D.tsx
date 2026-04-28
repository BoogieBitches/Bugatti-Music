"use client";

import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";

/**
 * Premium hero centerpiece — uses the user's 3D Bugatti Music logo with
 * mouse-driven parallax tilt + floating idle animation + soft animated glow.
 * Falls back gracefully on touch devices: tilt is disabled, the float remains.
 */
export function Hero3D() {
  const ref = useRef<HTMLDivElement | null>(null);

  const mvX = useMotionValue(0);
  const mvY = useMotionValue(0);

  const springConfig = { stiffness: 120, damping: 18, mass: 0.4 };
  const sX = useSpring(mvX, springConfig);
  const sY = useSpring(mvY, springConfig);

  const rotateX = useTransform(sY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(sX, [-0.5, 0.5], [-12, 12]);
  const translateX = useTransform(sX, [-0.5, 0.5], [-8, 8]);
  const translateY = useTransform(sY, [-0.5, 0.5], [-6, 6]);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mvX.set(x);
    mvY.set(y);
  }

  function onLeave() {
    mvX.set(0);
    mvY.set(0);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ perspective: 1200 }}
      className="relative w-full aspect-[4/3] md:aspect-[5/4] select-none"
    >
      {/* Animated halo / glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(91,140,255,0.35), transparent 60%), radial-gradient(35% 35% at 70% 65%, rgba(255,122,0,0.30), transparent 70%)",
          filter: "blur(20px)",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-full"
        animate={{
          opacity: [0.55, 0.85, 0.55],
          scale: [0.92, 1.04, 0.92],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "conic-gradient(from 0deg, rgba(91,140,255,0.0), rgba(91,140,255,0.4), rgba(255,122,0,0.4), rgba(91,140,255,0.0))",
          filter: "blur(40px)",
        }}
      />

      {/* The logo with float + tilt */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 grid place-items-center"
      >
        <motion.div
          style={{
            rotateX,
            rotateY,
            x: translateX,
            y: translateY,
            transformStyle: "preserve-3d",
          }}
          className="relative w-[88%] aspect-square will-change-transform"
        >
          <Image
            src="/bugatti-logo.png"
            alt="Bugatti Music"
            fill
            priority
            sizes="(min-width: 768px) 560px, 90vw"
            className="object-contain drop-shadow-[0_20px_50px_rgba(91,140,255,0.35)]"
          />
        </motion.div>
      </motion.div>

      {/* Reflection */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 w-[60%] h-10 rounded-[50%]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(91,140,255,0.35), transparent 70%)",
          filter: "blur(8px)",
        }}
      />
    </div>
  );
}
