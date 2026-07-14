import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CachedInsights, DaySummary, WeeklyInsights } from '../types';
import { activeApiKey } from '../types';
import { useApp, useDaySummaries } from '../state/AppContext';
import { APP_TZ, formatDayLabel, formatTime, lastNDateKeys } from '../lib/dates';
import { AiError, generateWeeklyInsights } from '../lib/ai';
import { useOnline } from '../hooks/useOnline';
import { getCachedInsights, saveCachedInsights } from '../lib/db';

const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, weekday: 'narrow' });

/** "M" / "T" / … for a YYYY-MM-DD key, in Dubai time. */
function weekdayInitial(dateKey: string): string {
  return weekdayFmt.format(new Date(`${dateKey}T12:00:00+04:00`));
}

/** Weekly AI summary: one call over the last 7 days, cached once per day. */
export function Insights() {
  const { settings, todayKey, setTab } = useApp();
  // Keyed to todayKey so the 7-day window rolls forward at Dubai midnight
  // even if this screen stays mounted across the rollover.
  const keys = useMemo(() => lastNDateKeys(7), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useDaySummaries(keys);

  /** undefined = cache not loaded yet; null = no cache on disk. */
  const [cache, setCache] = useState<CachedInsights | null | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const online = useOnline();
  /** Which dateKey we already auto-attempted — allows a fresh attempt after rollover. */
  const autoAttemptedFor = useRef<string | null>(null);

  // Load the cached insights once on mount.
  useEffect(() => {
    let cancelled = false;
    getCachedInsights()
      .then((c) => {
        if (!cancelled) setCache(c ?? null);
      })
      .catch(() => {
        if (!cancelled) setCache(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(async () => {
    if (!days || !activeApiKey(settings)) return;
    setGenerating(true);
    setError(null);
    try {
      const insights = await generateWeeklyInsights(settings, days);
      const next: CachedInsights = { dateKey: todayKey, generatedAt: Date.now(), insights };
      await saveCachedInsights(next);
      setCache(next);
    } catch (err) {
      setError(
        err instanceof AiError
          ? err
          : new AiError('Something went wrong while generating insights — retry.', true),
      );
    } finally {
      setGenerating(false);
    }
  }, [days, settings, todayKey]);

  // Auto-generate at most once per day when the cache is stale or absent.
  // The ref guard keeps StrictMode's double-effect from firing two API calls,
  // but is keyed by dateKey so a midnight rollover triggers a fresh attempt.
  // Deliberately NOT gated on navigator.onLine — it lies in iOS standalone
  // mode; if we're truly offline the request fails fast into the error state.
  useEffect(() => {
    if (autoAttemptedFor.current === todayKey) return;
    if (cache === undefined || days === null) return; // still loading
    if (cache !== null && cache.dateKey === todayKey) return; // fresh — no call
    if (!activeApiKey(settings)) return;
    autoAttemptedFor.current = todayKey;
    void generate();
  }, [cache, days, settings, todayKey, generate]);

  const hasKey = activeApiKey(settings).length > 0;
  const fresh = cache != null && cache.dateKey === todayKey;
  const stale = cache != null && !fresh;

  let body: ReactNode;
  if (generating || cache === undefined || (cache === null && !error && hasKey)) {
    body = <LoadingSkeleton />;
  } else if (error) {
    body = (
      <>
        <section className="animate-rise rounded-2xl border border-edge bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Couldn&rsquo;t generate insights</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-dim">{error.message}</p>
          <button
            type="button"
            onClick={() => void generate()}
            className="mt-3 min-h-11 w-full rounded-xl bg-accent-dim px-4 py-3 text-sm font-medium text-accent-bright active:scale-[0.98]"
          >
            Retry
          </button>
        </section>
        {cache && (
          <InsightsBody
            cached={cache}
            fresh={fresh}
            stale={stale}
            online={online}
            days={days}
            target={settings.proteinTarget_g}
            todayKey={todayKey}
            canRefresh={hasKey}
            onRefresh={() => void generate()}
          />
        )}
      </>
    );
  } else if (cache) {
    body = (
      <InsightsBody
        cached={cache}
        fresh={fresh}
        stale={stale}
        online={online}
        days={days}
        target={settings.proteinTarget_g}
        todayKey={todayKey}
        canRefresh={hasKey}
        onRefresh={() => void generate()}
      />
    );
  } else if (!hasKey) {
    body = (
      <section className="animate-rise rounded-2xl border border-edge bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Add your API key</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">
          Weekly insights are written by {settings.provider === 'gemini' ? 'Gemini' : 'Claude'} using
          your own API key. Add it once in Settings — it stays on this device.
        </p>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className="mt-3 min-h-11 w-full rounded-xl bg-accent-dim px-4 py-3 text-sm font-medium text-accent-bright active:scale-[0.98]"
        >
          Open Settings
        </button>
      </section>
    );
  } else {
    // Online is false and there is no cache to fall back to.
    body = (
      <section className="animate-rise rounded-2xl border border-edge bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">You&rsquo;re offline</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">
          No summary is cached yet, and generating one needs a connection. Your week will be read
          the next time you&rsquo;re online.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="mb-1">
        <h1 className="text-xl font-bold text-ink">Insights</h1>
        <p className="mt-0.5 text-sm text-ink-dim">
          Your week, read by {settings.provider === 'gemini' ? 'Gemini' : 'Claude'}
        </p>
      </header>
      {body}
    </div>
  );
}

// ---- rendered insights ----

interface InsightsBodyProps {
  cached: CachedInsights;
  fresh: boolean;
  stale: boolean;
  online: boolean;
  days: DaySummary[] | null;
  target: number;
  todayKey: string;
  canRefresh: boolean;
  onRefresh: () => void;
}

function InsightsBody({
  cached,
  fresh,
  stale,
  online,
  days,
  target,
  todayKey,
  canRefresh,
  onRefresh,
}: InsightsBodyProps) {
  const insights = cached.insights;
  return (
    <>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-ink-faint">
          Generated {fresh ? 'today' : formatDayLabel(cached.dateKey)} ·{' '}
          <span className="num">{formatTime(cached.generatedAt)}</span>
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!canRefresh || !days}
          aria-label="Regenerate insights"
          className="-my-2.5 flex h-11 w-11 items-center justify-center rounded-full text-ink-dim active:scale-[0.98] disabled:opacity-40"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>

      {stale && !online && (
        <div className="animate-rise rounded-xl border border-edge bg-surface px-3 py-2 text-xs leading-relaxed text-ink-dim">
          Offline — showing last week&rsquo;s summary from {formatDayLabel(cached.dateKey)}
        </div>
      )}

      {days && <WeekChart days={days} target={target} todayKey={todayKey} />}

      <section className="animate-rise rounded-2xl border border-edge bg-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Summary</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink">{insights.summary}</p>
      </section>

      {insights.trends.length > 0 && (
        <section className="animate-rise rounded-2xl border border-edge bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Trends</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {insights.trends.map((trend, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="text-sm leading-relaxed text-ink-dim">{trend}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BestWorst insights={insights} />

      {insights.suggestion && (
        <section className="animate-rise rounded-2xl border border-accent/30 bg-accent-dim p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-accent-bright">
            One thing to try
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink">{insights.suggestion}</p>
        </section>
      )}
    </>
  );
}

function BestWorst({ insights }: { insights: WeeklyInsights }) {
  const best = insights.best_day.dateKey ? insights.best_day : null;
  const worst = insights.worst_day.dateKey ? insights.worst_day : null;
  if (!best && !worst) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {best && (
        <div
          className={`animate-rise rounded-2xl border border-accent/30 bg-surface p-4 ${worst ? '' : 'col-span-2'}`}
        >
          <div className="text-xs font-medium text-accent-bright">Best day</div>
          <div className="mt-1 text-sm font-semibold text-ink">{formatDayLabel(best.dateKey)}</div>
          {best.reason && <p className="mt-1 text-xs leading-relaxed text-ink-dim">{best.reason}</p>}
        </div>
      )}
      {worst && (
        <div
          className={`animate-rise rounded-2xl border border-edge bg-surface p-4 ${best ? '' : 'col-span-2'}`}
        >
          <div className="text-xs font-medium text-warn">Needs work</div>
          <div className="mt-1 text-sm font-semibold text-ink">{formatDayLabel(worst.dateKey)}</div>
          {worst.reason && (
            <p className="mt-1 text-xs leading-relaxed text-ink-dim">{worst.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- 7-day mini chart ----

function WeekChart({
  days,
  target,
  todayKey,
}: {
  days: DaySummary[];
  target: number;
  todayKey: string;
}) {
  return (
    <section className="animate-rise rounded-2xl border border-edge bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">This week</h2>
        <span className="text-[10px] text-ink-faint">
          protein vs <span className="num">{target}g</span> target
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between px-1">
        {days.map((day) => {
          const pct = target > 0 ? Math.min(100, (day.protein_g / target) * 100) : 0;
          const hit = target > 0 && day.protein_g >= target;
          return (
            <div key={day.dateKey} className="flex flex-col items-center gap-1.5">
              <div className="flex h-2 items-center justify-center">
                {day.lightDay && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-2 w-2 text-ink-faint"
                    fill="currentColor"
                    aria-label="Light day"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </div>
              <div className="flex h-20 w-2.5 items-end overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`w-full rounded-full ${hit ? 'bg-accent-bright' : 'bg-accent'}`}
                  style={{ height: `${pct}%`, minHeight: day.protein_g > 0 ? '4px' : '0' }}
                />
              </div>
              <span
                className={`text-[10px] ${day.dateKey === todayKey ? 'font-semibold text-ink-dim' : 'text-ink-faint'}`}
              >
                {weekdayInitial(day.dateKey)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- loading skeleton ----

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="animate-pulse px-1 text-sm text-ink-dim">Reading your week…</div>
      <div className="h-36 animate-pulse rounded-2xl bg-surface" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface" />
      <div className="h-32 animate-pulse rounded-2xl bg-surface" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 animate-pulse rounded-2xl bg-surface" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface" />
      </div>
    </div>
  );
}
