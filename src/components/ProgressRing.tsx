import { useEffect, useState } from 'react';

interface ProgressRingProps {
  value: number;
  target: number;
  label: string;
  unit: string;
  tone: 'accent' | 'cal';
  /** 'hero' = the giant serif protein figure; 'md' = the smaller calories figure. */
  variant?: 'hero' | 'md';
  /** Softens the remaining-text tone on relaxed days (bar renders the same). */
  lightDay?: boolean;
}

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Editorial stat block (Editorial Type design): a huge Instrument Serif
 * number, an uppercase label line, and an ink-bordered horizontal bar whose
 * fill animates in from 0. Replaces the old ring — same props contract.
 */
export function ProgressRing({
  value,
  target,
  label,
  unit,
  tone,
  variant = 'hero',
  lightDay = false,
}: ProgressRingProps) {
  const fraction = target > 0 ? Math.min(Math.max(value / target, 0), 1) : 0;

  // First paint shows an empty bar; the post-paint flip animates the fill.
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

  const hero = variant === 'hero';
  const fill = tone === 'accent' ? 'var(--color-accent)' : 'var(--color-ink)';

  return (
    <div
      className="animate-rise"
      role="img"
      aria-label={`${label}: ${Math.round(value)} of ${target} ${unit}`}
    >
      <div
        className={`serif ${hero ? 'text-[76px] leading-[0.9]' : 'text-[42px] leading-[0.95] text-ink-mid'}`}
        style={{ letterSpacing: hero ? '-0.03em' : '-0.02em' }}
      >
        <span className="num">{Math.round(value)}</span>
        <span className={hero ? 'text-[32px]' : 'text-[20px]'}>
          {unit === 'kcal' ? ' kcal' : unit}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="label-caps text-[12px] tracking-[0.1em] text-ink">{label}</span>
        <span className={`text-[13px] ${lightDay ? 'text-ink-faint' : 'text-ink-dim'}`}>
          of <span className="num">{target.toLocaleString('en-US')}</span>
          {unit === 'kcal' ? ' kcal' : unit}
        </span>
      </div>
      <div
        className={`mt-3 border-[1.5px] border-edge ${hero ? 'h-3.5' : 'h-2.5'}`}
        style={{ padding: 2 }}
      >
        <div
          className="h-full"
          style={{
            background: fill,
            width: `${drawn * 100}%`,
            transition: `width 0.9s ${EASE}`,
            opacity: lightDay ? 0.8 : 1,
          }}
        />
      </div>
    </div>
  );
}
