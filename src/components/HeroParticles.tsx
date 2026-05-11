/**
 * Subtle floating particles drifting upward behind the hero text. 18
 * absolutely-positioned dots with deterministic positions & timing.
 * Server component, no JS, no runtime randomness (SSR-safe). Respects
 * prefers-reduced-motion.
 */
const COUNT = 18;

function hash(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function HeroParticles() {
  const dots = Array.from({ length: COUNT }, (_, i) => {
    const left = hash(i, 1) * 100;
    const size = 2 + hash(i, 2) * 4;            // 2–6 px
    const drift = 6 + hash(i, 3) * 14;          // 6–20s
    const delay = -(hash(i, 4) * 16).toFixed(2); // negative pre-roll
    const opacity = 0.35 + hash(i, 5) * 0.45;   // 0.35–0.8
    return { left, size, drift, delay, opacity };
  });

  return (
    <div
      aria-hidden
      className="hero-particles pointer-events-none absolute inset-0 overflow-hidden"
    >
      {dots.map((d, i) => (
        <span
          key={i}
          className="hero-particle"
          style={
            {
              left: `${d.left}%`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              opacity: d.opacity,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.drift}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
