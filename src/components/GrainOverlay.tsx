/**
 * Full-screen film grain on top of all content. Static SVG `feTurbulence`
 * encoded as a data-URI so it ships zero extra requests. Sits above the
 * site (z-index 100) but is pointer-events:none and aria-hidden, and
 * `mix-blend-mode: overlay` so it tints rather than covers.
 *
 * Server component — no JS shipped. Honors prefers-reduced-motion via CSS
 * (the noise itself doesn't animate, just the visibility is dampened).
 */
export function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="bs-grain-overlay pointer-events-none fixed inset-0 z-[100]"
    />
  );
}
