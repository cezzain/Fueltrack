import { useEffect, useState } from 'react';

interface ProgressRingProps {
  value: number;
  target: number;
  label: string;
  unit: string;
  tone: 'accent' | 'cal';
  /** Outer diameter in px. */
  size?: number;
  /** Softens the ring (no glow, slightly translucent arc) on relaxed days. */
  lightDay?: boolean;
}

const STROKE = 10;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Animated SVG progress ring. The arc draws from 0 to the current fraction on
 * mount (via a post-paint state flip) and transitions smoothly on every value
 * change. Visual arc is capped at 100%; beyond target it switches to the
 * bright tone variant so hitting the target reads as a win.
 */
export function ProgressRing({
  value,
  target,
  label,
  unit,
  tone,
  size = 150,
  lightDay = false,
}: ProgressRingProps) {
  const radius = (size - STROKE) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const fraction = target > 0 ? Math.min(Math.max(value / target, 0), 1) : 0;
  const over = target > 0 && value > target;

  // Start drawn at 0 so the first paint shows an empty ring, then flip to the
  // real fraction after paint — the CSS transition animates the fill. Later
  // value changes re-run the effect and transition from the previous arc.
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setDrawn(fraction));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [fraction]);

  const arcColor = over
    ? tone === 'accent'
      ? 'var(--color-accent-bright)'
      : 'var(--color-cal-bright)'
    : tone === 'accent'
      ? 'var(--color-accent)'
      : 'var(--color-cal)';

  // Only the loud color gets a glow, and never on a light day.
  const glow =
    tone === 'accent' && !lightDay ? 'drop-shadow(0 0 6px var(--color-accent-dim))' : undefined;

  return (
    <div
      className="animate-ring-pop relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${Math.round(value)} of ${target} ${unit}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${center} ${center})`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--color-edge)"
            strokeWidth={STROKE}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arcColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - drawn)}
            style={{
              transition: `stroke-dashoffset 0.9s ${EASE}, stroke 0.4s ease`,
              filter: glow,
              opacity: lightDay ? 0.75 : 1,
            }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`num font-bold text-ink ${size >= 140 ? 'text-3xl' : 'text-2xl'}`}>
          {Math.round(value)}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-dim">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${tone === 'accent' ? 'bg-accent' : 'bg-cal'}`}
          />
          <span>
            {unit} · {label}
          </span>
        </div>
      </div>
    </div>
  );
}
