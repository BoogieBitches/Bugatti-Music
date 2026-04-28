"use client";

import { useEffect, useRef } from "react";

/**
 * Soft halo that follows the cursor across the whole page.
 * Pure DOM/CSS — no React re-renders on each move.
 */
export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;

    function onMove(e: MouseEvent) {
      tx = e.clientX;
      ty = e.clientY;
    }

    function tick() {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      if (el) el.style.transform = `translate3d(${cx - 240}px, ${cy - 240}px, 0)`;
      raf = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      ref={ref}
      className="pointer-events-none fixed top-0 left-0 z-0 hidden md:block"
      style={{
        width: 480,
        height: 480,
        borderRadius: "50%",
        background:
          "radial-gradient(closest-side, rgba(91,140,255,0.18), rgba(91,140,255,0.0) 70%)",
        filter: "blur(20px)",
        willChange: "transform",
        mixBlendMode: "screen",
      }}
    />
  );
}
