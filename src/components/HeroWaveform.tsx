/**
 * Abstract animated audio waveform behind the hero. 64 vertical bars in
 * brand violet, each bar animates its height via a CSS keyframe seeded
 * from a deterministic pseudo-random delay & duration so the field
 * "breathes" like real audio without any JS.
 *
 * Server component (no JS shipped). Respects prefers-reduced-motion.
 */
const BARS = 64;

// Cheap deterministic PRNG so SSR + CSR match on hash.
function hash(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function HeroWaveform() {
  const bars = Array.from({ length: BARS }, (_, i) => {
    const r1 = hash(i, 1);
    const r2 = hash(i, 2);
    const baseH = 18 + r1 * 62;                   // 18–80%
    const peakH = Math.max(baseH + 8, 35 + r2 * 65); // always > baseH (≥ +8%)
    const delay = -(r1 * 2.6).toFixed(2); // negative so animation pre-rolls
    const duration = (1.6 + r2 * 1.8).toFixed(2); // 1.6–3.4s
    return { baseH, peakH, delay, duration };
  });

  return (
    <div
      aria-hidden
      className="hero-waveform pointer-events-none absolute left-0 right-0 bottom-0 h-[42%] md:h-[48%]"
    >
      <div className="hero-waveform-fade" />
      <div className="hero-waveform-bars">
        {bars.map((b, i) => (
          <span
            key={i}
            className="hero-waveform-bar"
            style={
              {
                "--bar-base": `${b.baseH}%`,
                "--bar-peak": `${b.peakH}%`,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.duration}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
