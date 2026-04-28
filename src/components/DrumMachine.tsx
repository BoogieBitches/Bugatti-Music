"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DrumPad } from "./DrumPad";

/**
 * 16-step looping pattern. Each row is one of 4 instruments (kick / snare /
 * hat / perc). When the playhead lands on an active step in any row, that
 * step's pad lights up. Visually this looks like an MPC-style 4×4 in the
 * lower half plus a step display.
 */
const PATTERN: number[][] = [
  // 16 steps × 4 rows. 1 = active.
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], // kick
  [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1], // snare
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // hihat
  [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1], // perc
];

const ROW_COLORS = ["#ff7a00", "#ff3d6b", "#5b8cff", "#7b49ff"];
const ROW_LABELS = ["KICK", "SNARE", "HAT", "PERC"];

export function DrumMachine() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % 16);
    }, 220); // ≈ 68 BPM 16ths-feel for a chill loop animation
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative">
      {/* Glow halo */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.55, 0.9, 0.55], scale: [0.96, 1.04, 0.96] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[40px]"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 30%, rgba(91,140,255,0.35), transparent 65%), radial-gradient(60% 60% at 70% 80%, rgba(255,122,0,0.35), transparent 65%)",
          filter: "blur(40px)",
        }}
      />

      {/* Device frame */}
      <div
        className="relative rounded-[28px] p-4 sm:p-5 md:p-6 ring-1 ring-white/10 shadow-2xl"
        style={{
          background:
            "linear-gradient(180deg, rgba(20,24,34,0.92) 0%, rgba(8,10,16,0.95) 100%)",
          boxShadow:
            "0 50px 100px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Top bar — branding + step display */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-2)] shadow-[0_0_12px_var(--accent-2)]" />
            <span className="font-display text-xs tracking-[0.25em] text-white/70">
              BUGATTI SP-16
            </span>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-all duration-100"
                style={{
                  background:
                    i === step ? "var(--accent-2)" : "rgba(255,255,255,0.12)",
                  boxShadow:
                    i === step ? "0 0 10px var(--accent-2)" : "none",
                }}
              />
            ))}
          </div>
        </div>

        {/* 4×4 pad grid */}
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
          {PATTERN.map((row, rowIdx) =>
            row.map((on, col) => {
              // Map 16 steps × 4 rows down to a 4×4 display: take one row of 4
              // pads per instrument. We display columns 0..3 of the current
              // 4-step bar — i.e. quarter beats — so the full row stays visible.
              if (col >= 4) return null;
              const stepInBar = step % 4;
              const isLit = on === 1 && col === stepInBar;
              const color = ROW_COLORS[rowIdx];
              return (
                <DrumPad
                  key={`${rowIdx}-${col}`}
                  color={color}
                  active={isLit}
                  caption={col === 0 ? ROW_LABELS[rowIdx] : undefined}
                  ariaLabel={`${ROW_LABELS[rowIdx]} step ${col + 1}`}
                  asButton={false}
                />
              );
            }),
          )}
        </div>

        {/* Knobs row */}
        <div className="mt-5 grid grid-cols-4 gap-3">
          {["VOL", "FX", "CUE", "BPM"].map((label, i) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-xl bg-black/40 ring-1 ring-white/5 p-2"
            >
              <span
                className="relative w-7 h-7 rounded-full shadow-inner"
                style={{
                  background:
                    "radial-gradient(circle at 30% 30%, #2b3142, #0e1118 70%)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.7)",
                }}
              >
                <span
                  className="absolute left-1/2 top-1 w-[2px] h-2 -translate-x-1/2 rounded-full"
                  style={{
                    background: "var(--accent-3)",
                    boxShadow: "0 0 6px var(--accent-3)",
                    transform: `translateX(-50%) rotate(${
                      -120 + i * 60 + (step % 4) * 6
                    }deg)`,
                    transformOrigin: "50% 12px",
                  }}
                />
              </span>
              <div className="flex flex-col">
                <span className="font-display text-[10px] tracking-[0.18em] text-white/50">
                  {label}
                </span>
                <span className="font-display text-[11px] text-white/85 tabular-nums">
                  {label === "BPM"
                    ? "128"
                    : `${(60 + i * 7 + step) % 100}`.padStart(2, "0")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
