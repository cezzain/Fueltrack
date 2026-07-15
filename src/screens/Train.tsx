import { useMemo, useState } from 'react';
import type { Routine, WeightEntry, Workout } from '../types';
import { useApp, useRoutines, useWeights, useWorkouts } from '../state/AppContext';
import { APP_TZ, formatRelativeDayLabel, lastNDateKeys, representativeDate, weekDateKeys } from '../lib/dates';

const shortDayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, weekday: 'short' });
/** "THU" for a YYYY-MM-DD key, in Dubai time. */
function dayLabel(dateKey: string): string {
  return shortDayFmt.format(representativeDate(dateKey)).toUpperCase();
}

function TrainSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-5 h-14 w-40 bg-surface-2" />
      <div className="mt-6 h-40 w-full bg-surface-2" />
      <div className="mt-6 h-64 w-full bg-surface-2" />
    </div>
  );
}

/** Train tab (Editorial Train Page design): body weight, routines, week strip. */
export function Train() {
  const { todayKey } = useApp();
  const routines = useRoutines();
  const weights = useWeights();
  // 30 days covers "last done" per routine; unioned with the current Mon–Sun
  // week so future days of this week still render in the strip.
  const keys = useMemo(
    () => [...new Set([...lastNDateKeys(30), ...weekDateKeys(todayKey)])],
    [todayKey],
  );
  const workoutsByDate = useWorkouts(keys);

  if (!routines || !weights || !workoutsByDate) return <TrainSkeleton />;

  return (
    <div>
      <header className="mt-5 md:mt-0">
        <h1 className="serif text-[44px] leading-none text-ink md:text-[64px]">Train</h1>
        <p className="mt-2 text-[13px] text-ink-faint md:text-[13.5px]">
          Routines, workouts, and weight — synced with your food.
        </p>
      </header>

      <div className="mt-6 md:grid md:grid-cols-[1.2fr_1fr] md:items-start md:gap-10">
        {/* Body weight — first on phone, right column on desktop. */}
        <div className="md:order-2">
          <WeightSection weights={weights} todayKey={todayKey} />
        </div>

        {/* Workouts + this-week strip — left column on desktop. */}
        <div className="md:order-1 md:mt-0">
          <WorkoutsSection
            routines={routines}
            workoutsByDate={workoutsByDate}
            todayKey={todayKey}
          />
          <WeekStrip workoutsByDate={workoutsByDate} todayKey={todayKey} />
        </div>
      </div>
    </div>
  );
}

// ---- workouts ----

function WorkoutsSection({
  routines,
  workoutsByDate,
  todayKey,
}: {
  routines: Routine[];
  workoutsByDate: Map<string, Workout[]>;
  todayKey: string;
}) {
  const { addRoutine, removeRoutine, logWorkout, removeWorkout } = useApp();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(false);

  // Most recent day each routine was done, across the loaded window.
  const lastDone = useMemo(() => {
    const map = new Map<string, string>();
    for (const [dateKey, list] of workoutsByDate) {
      for (const w of list) {
        const prev = map.get(w.routineId);
        if (!prev || dateKey > prev) map.set(w.routineId, dateKey);
      }
    }
    return map;
  }, [workoutsByDate]);

  const todays = workoutsByDate.get(todayKey) ?? [];

  const submit = async () => {
    if (!newName.trim()) return;
    await addRoutine(newName);
    setNewName('');
  };

  const toggle = async (r: Routine) => {
    const doneEntries = todays.filter((w) => w.routineId === r.id);
    if (doneEntries.length > 0) {
      for (const w of doneEntries) await removeWorkout(w.id);
    } else {
      await logWorkout(r);
    }
  };

  return (
    <section>
      <div className="flex items-baseline justify-between border-b-[1.5px] border-edge pb-2">
        <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">Workouts</h2>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className={`label-caps text-[10.5px] tracking-[0.1em] underline decoration-hairline underline-offset-[3px] ${
            editing ? 'text-accent' : 'text-ink-faint'
          }`}
        >
          {editing ? 'Done' : 'Edit routines'}
        </button>
      </div>

      <p className="serif mt-2.5 text-[14px] italic text-ink-faint md:text-[15px]">
        Tap a routine to log today&rsquo;s workout — one tap.
      </p>

      {routines.length > 0 && (
        <div className="mt-3">
          {routines.map((r) => {
            const doneToday = todays.some((w) => w.routineId === r.id);
            const last = lastDone.get(r.id);
            const meta = doneToday
              ? 'Logged today'
              : last
                ? `Last: ${formatRelativeDayLabel(last)}`
                : 'Not logged yet';
            return (
              <div key={r.id} className="flex items-center gap-2.5 border-b border-hairline">
                <button
                  type="button"
                  onClick={() => void toggle(r)}
                  className="flex min-w-0 flex-1 items-baseline gap-3.5 py-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`serif text-[21px] leading-tight md:text-[24px] ${
                        doneToday ? 'text-ink-faint' : 'text-ink'
                      }`}
                    >
                      {r.name}
                    </div>
                    <div className="label-caps mt-0.5 text-[10px] tracking-[0.08em] text-ink-faint">
                      {meta}
                    </div>
                  </div>
                  <span
                    className={`label-caps shrink-0 text-[11px] tracking-[0.08em] ${
                      doneToday ? 'text-ink-faint' : 'text-accent'
                    }`}
                  >
                    {doneToday ? '✓ logged' : 'log ↗'}
                  </span>
                </button>
                {editing && (
                  <button
                    type="button"
                    aria-label={`Delete ${r.name}`}
                    onClick={() => void removeRoutine(r.id)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center border-[1.5px] border-edge text-accent active:translate-y-px"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-3.5 flex gap-2"
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New routine, e.g. “Leg day” or “Shooting drills”"
          className="h-12 min-w-0 flex-1 border-[1.5px] border-accent bg-bg px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="label-caps h-12 shrink-0 border-[1.5px] border-edge bg-ink px-5 text-[12px] tracking-[0.08em] text-surface active:translate-y-px disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </section>
  );
}

// ---- this week strip ----

function WeekStrip({
  workoutsByDate,
  todayKey,
}: {
  workoutsByDate: Map<string, Workout[]>;
  todayKey: string;
}) {
  const weekKeys = useMemo(() => weekDateKeys(todayKey), [todayKey]);
  const total = weekKeys.reduce((sum, k) => sum + (workoutsByDate.get(k)?.length ?? 0), 0);

  return (
    <section className="mt-7">
      <div className="border-b-[1.5px] border-edge pb-2">
        <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">This week</h2>
      </div>
      <div className="mt-3 flex gap-1.5 md:max-w-[480px]">
        {weekKeys.map((key) => {
          const trained = (workoutsByDate.get(key)?.length ?? 0) > 0;
          const isFuture = key > todayKey;
          return (
            <div
              key={key}
              className={`flex-1 border border-edge py-2.5 text-center ${
                trained ? 'bg-ink' : ''
              } ${isFuture ? 'opacity-40' : ''}`}
            >
              <div
                className={`text-[9px] tracking-[0.06em] ${trained ? 'text-surface/70' : 'text-ink-faint'}`}
              >
                {dayLabel(key)}
              </div>
              <div className={`mt-1 text-[14px] ${trained ? 'text-surface' : 'text-ink-faint'}`}>
                {trained ? '✓' : '·'}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11.5px] text-ink-faint">
        <span className="font-bold text-ink">
          {total} {total === 1 ? 'workout' : 'workouts'}
        </span>{' '}
        this week · basketball 6d/week goal
      </p>
    </section>
  );
}

// ---- body weight ----

function WeightSection({ weights, todayKey }: { weights: WeightEntry[]; todayKey: string }) {
  const { logWeight, settings } = useApp();
  const [input, setInput] = useState('');
  const [justLogged, setJustLogged] = useState(false);

  const byKey = useMemo(() => new Map(weights.map((w) => [w.dateKey, w.weightKg])), [weights]);
  const last7 = useMemo(() => lastNDateKeys(7), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = weights.length ? weights[weights.length - 1].weightKg : settings.weightKg;
  const present = last7.map((k) => byKey.get(k)).filter((v): v is number => v != null);
  const min = present.length ? Math.min(...present) : 0;
  const max = present.length ? Math.max(...present) : 0;
  const range = Math.max(0.4, max - min);
  // Net change across the days that actually have a weigh-in in the window.
  const delta =
    present.length >= 2 ? Math.round((present[present.length - 1] - present[0]) * 10) / 10 : null;

  const submit = async () => {
    const n = Number(input);
    if (!Number.isFinite(n) || n < 30 || n > 250) return;
    await logWeight(Math.round(n * 10) / 10);
    setInput('');
    setJustLogged(true);
  };

  return (
    <section className="mt-6 md:mt-0">
      <div className="flex items-baseline justify-between border-b-[1.5px] border-edge pb-2">
        <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">Body weight</h2>
        <span className="text-[11px] text-ink-faint">
          now <span className="num font-bold text-ink">{latest} kg</span>
        </span>
      </div>

      {/* Big figure + trend — desktop only, per the design. */}
      <div className="hidden md:block">
        <div className="serif mt-5 text-[84px] leading-[0.9] text-ink" style={{ letterSpacing: '-0.03em' }}>
          <span className="num">{latest}</span>
          <span className="text-[30px]"> kg</span>
        </div>
        {delta !== null && (
          <p className="mt-2.5 text-[12px] text-ink-faint">
            <span className="num">
              {delta > 0 ? '+' : ''}
              {delta} kg
            </span>{' '}
            over 7 days ·{' '}
            <span className="serif italic text-accent">
              {delta >= 0 ? 'lean bulk on pace' : 'trending down'}
            </span>
          </p>
        )}
      </div>

      <div className="mt-4 flex h-20 gap-1.5 md:h-28">
        {last7.map((key) => {
          const w = byKey.get(key);
          const isToday = key === todayKey;
          const f = w != null ? 0.35 + 0.65 * ((w - min) / range) : 0;
          return (
            <div key={key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              {w != null && (
                <span className={`num text-[9px] md:text-[10px] ${isToday ? 'text-accent' : 'text-ink-faint'}`}>
                  {w}
                </span>
              )}
              <div
                className={`w-full ${w == null ? 'bg-hairline' : isToday ? 'bg-accent' : 'bg-ink'}`}
                style={{ height: w != null ? `${Math.round(f * 100)}%` : '2px' }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {last7.map((key) => (
          <span
            key={key}
            className={`flex-1 text-center text-[9px] tracking-[0.04em] ${
              key === todayKey ? 'text-ink' : 'text-ink-faint'
            }`}
          >
            {dayLabel(key)}
          </span>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-4 flex gap-2"
      >
        <input
          type="number"
          step="0.1"
          min={30}
          max={250}
          inputMode="decimal"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setJustLogged(false);
          }}
          placeholder="Today's weight (kg)"
          className="num h-12 min-w-0 flex-1 border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="label-caps h-12 shrink-0 border-[1.5px] border-edge bg-accent px-5 text-[12px] tracking-[0.08em] text-surface shadow-offset-4 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 disabled:shadow-offset-4"
        >
          Log
        </button>
      </form>
      {justLogged && (
        <p className="serif mt-2 text-[13px] italic text-accent">
          Logged — nice, lean bulk on track.
        </p>
      )}
    </section>
  );
}
