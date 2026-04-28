"use client";

import { TextReveal } from "./TextReveal";

interface Props {
  /** Section number, e.g. "01". */
  index: string;
  /** Eyebrow / kicker line above the title. */
  eyebrow?: string;
  /** Main title text — will animate in via TextReveal. */
  title: string;
  /** Optional supporting paragraph. */
  description?: string;
  /** Right-side slot — typically a "view all" link or button. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Editorial section heading inspired by BPM Supreme: large numeric index in
 * the gutter, oversized display title, optional caption, optional action on
 * the right. Title characters stagger-reveal on first scroll-into-view.
 */
export function SectionHeader({
  index,
  eyebrow,
  title,
  description,
  action,
  className = "",
}: Props) {
  return (
    <header
      className={`grid md:grid-cols-12 gap-6 md:gap-10 items-end mb-10 md:mb-14 ${className}`}
    >
      <div className="md:col-span-1">
        <span
          className="font-display text-5xl md:text-6xl font-bold tabular-nums tracking-tighter"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.4))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {index}
        </span>
      </div>
      <div className="md:col-span-7">
        {eyebrow && (
          <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
            {eyebrow}
          </div>
        )}
        <h2 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.95]">
          <TextReveal text={title} stagger={0.025} trigger="mount" />
        </h2>
        {description && (
          <p className="mt-4 text-[var(--muted)] text-base md:text-lg max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="md:col-span-4 flex md:justify-end">{action}</div>
      )}
    </header>
  );
}
