import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CachedInsights, ChatMessage, DaySummary, Settings, WeeklyInsights } from '../types';
import { activeApiKey } from '../types';
import { useApp, useDaySummaries } from '../state/AppContext';
import { APP_TZ, formatDayLabel, formatTime, lastNDateKeys } from '../lib/dates';
import { AiError, chatAboutInsights, generateWeeklyInsights } from '../lib/ai';
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
        <section className="animate-rise border-[1.5px] border-danger bg-surface p-4">
          <h2 className="serif text-[18px] italic text-ink">Couldn&rsquo;t generate insights</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-dim">{error.message}</p>
          <button
            type="button"
            onClick={() => void generate()}
            className="label-caps mt-3 min-h-11 w-full border-[1.5px] border-edge bg-accent px-4 py-3 text-[11px] text-surface active:translate-y-px"
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
            settings={settings}
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
        settings={settings}
      />
    );
  } else if (!hasKey) {
    body = (
      <section className="animate-rise border-[1.5px] border-edge bg-surface p-4">
        <h2 className="serif text-[18px] text-ink">Add your API key</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">
          Weekly insights are written by {settings.provider === 'gemini' ? 'Gemini' : 'Claude'} using
          your own API key. Add it once in Settings — it stays on this device.
        </p>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className="label-caps mt-3 min-h-11 w-full border-[1.5px] border-edge px-4 py-3 text-[11px] text-ink active:translate-y-px"
        >
          Open Settings
        </button>
      </section>
    );
  } else {
    // Online is false and there is no cache to fall back to.
    body = (
      <section className="animate-rise border-[1.5px] border-edge bg-surface p-4">
        <h2 className="serif text-[18px] italic text-ink">You&rsquo;re offline</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-dim">
          No summary is cached yet, and generating one needs a connection. Your week will be read
          the next time you&rsquo;re online.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="mb-1 mt-5">
        <h1 className="serif text-[40px] leading-none text-ink">Insights</h1>
        <p className="mt-2 text-[13px] text-ink-faint">
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
  settings: Settings;
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
  settings,
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
        <div className="serif animate-rise border border-hairline bg-surface px-3 py-2 text-[13px] italic leading-relaxed text-ink-dim">
          Offline — showing last week&rsquo;s summary from {formatDayLabel(cached.dateKey)}
        </div>
      )}

      {days && <WeekChart days={days} target={target} todayKey={todayKey} />}

      {/* Summary as an editorial pull-quote */}
      <section className="animate-rise border-l-4 border-accent py-1 pl-4">
        <p className="serif text-[20px] italic leading-[1.35] text-ink">
          &ldquo;{insights.summary}&rdquo;
        </p>
      </section>

      {insights.trends.length > 0 && (
        <section className="animate-rise border-[1.5px] border-edge bg-surface p-4">
          <h2 className="label-caps text-[11px] tracking-[0.12em] text-ink">Trends</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {insights.trends.map((trend, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-accent" />
                <span className="text-sm leading-relaxed text-ink-dim">{trend}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BestWorst insights={insights} />

      {insights.suggestion && (
        <section className="animate-rise border-[1.5px] border-edge bg-ink p-5 text-surface">
          <h2 className="label-caps text-[10px] tracking-[0.12em] text-accent-on-dark">
            One thing to try
          </h2>
          <p className="serif mt-2 text-[18px] leading-[1.4]">{insights.suggestion}</p>
        </section>
      )}

      {days && canRefresh && (
        <InsightsChat
          key={cached.generatedAt}
          days={days}
          settings={settings}
          insights={insights}
          online={online}
        />
      )}
    </>
  );
}

// ---- follow-up chat ----

function InsightsChat({
  days,
  settings,
  insights,
  online,
}: {
  days: DaySummary[];
  settings: Settings;
  insights: WeeklyInsights;
  online: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || sending) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setSending(true);
    setChatError(null);
    try {
      const reply = await chatAboutInsights(settings, days, insights, next);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setChatError(
        err instanceof AiError ? err.message : 'Something went wrong asking that — try again.',
      );
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, settings, days, insights]);

  return (
    <section className="animate-rise border-[1.5px] border-edge bg-surface p-4">
      <h2 className="label-caps text-[11px] tracking-[0.12em] text-ink">Ask about your week</h2>

      {messages.length === 0 ? (
        <p className="serif mt-2 text-[13px] italic leading-relaxed text-ink-faint">
          e.g. &ldquo;How long until I see results?&rdquo; or &ldquo;Why was Tuesday my best
          day?&rdquo;
        </p>
      ) : (
        <div ref={scrollRef} className="mt-3 flex max-h-72 flex-col gap-2.5 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-ink text-surface'
                    : 'serif border border-hairline text-ink-dim'
                }`}
              >
                {m.content}
              </p>
            </div>
          ))}
          {sending && (
            <p className="serif text-[13px] italic text-ink-faint">Thinking&hellip;</p>
          )}
        </div>
      )}

      {chatError && <p className="mt-2 text-[12px] leading-relaxed text-danger">{chatError}</p>}

      {!online && messages.length === 0 ? (
        <p className="mt-3 text-[12px] text-ink-faint">Reconnect to ask a question.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="mt-3 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up…"
            disabled={sending}
            className="min-h-11 min-w-0 flex-1 border border-hairline bg-transparent px-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="label-caps min-h-11 shrink-0 border-[1.5px] border-edge bg-accent px-4 text-[11px] text-surface active:translate-y-px disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      )}
    </section>
  );
}

function BestWorst({ insights }: { insights: WeeklyInsights }) {
  const best = insights.best_day.dateKey ? insights.best_day : null;
  const worst = insights.worst_day.dateKey ? insights.worst_day : null;
  if (!best && !worst) return null;
  return (
    <div className="animate-rise flex border-[1.5px] border-edge bg-surface">
      {best && (
        <div className={`flex-1 p-3.5 ${worst ? 'border-r border-edge' : ''}`}>
          <div className="label-caps text-[10px] tracking-[0.1em] text-accent">Best day</div>
          <div className="serif mt-1 text-[18px] text-ink">{formatDayLabel(best.dateKey)}</div>
          {best.reason && (
            <p className="mt-1 text-[11px] leading-[1.5] text-ink-faint">{best.reason}</p>
          )}
        </div>
      )}
      {worst && (
        <div className="flex-1 p-3.5">
          <div className="label-caps text-[10px] tracking-[0.1em] text-ink-faint">Needs work</div>
          <div className="serif mt-1 text-[18px] text-ink">{formatDayLabel(worst.dateKey)}</div>
          {worst.reason && (
            <p className="mt-1 text-[11px] leading-[1.5] text-ink-faint">{worst.reason}</p>
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
    <section className="animate-rise border-[1.5px] border-edge bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="label-caps text-[11px] tracking-[0.12em] text-ink">This week</h2>
        <span className="text-[10px] text-ink-faint">
          vs <span className="num">{target}g</span> target
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between px-1">
        {days.map((day) => {
          const pct = target > 0 ? Math.min(100, (day.protein_g / target) * 100) : 0;
          const hit = target > 0 && day.protein_g >= target;
          return (
            <div key={day.dateKey} className="flex flex-col items-center gap-1.5">
              <div className="flex h-3 items-center justify-center text-[9px] text-ink-faint">
                {day.lightDay ? '☾' : ''}
              </div>
              <div className="flex h-[76px] w-[22px] items-end border border-edge" style={{ padding: 1.5 }}>
                <div
                  className={`w-full ${hit ? 'bg-accent' : 'bg-ink'}`}
                  style={{ height: `${pct}%`, minHeight: day.protein_g > 0 ? '4px' : '0' }}
                />
              </div>
              <span
                className={`text-[10px] ${day.dateKey === todayKey ? 'font-bold text-ink' : 'text-ink-faint'}`}
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
