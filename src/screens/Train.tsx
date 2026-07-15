import { useMemo, useState } from 'react';
import type { Routine } from '../types';
import {
  useApp,
  useDaySummaries,
  useRoutines,
  useWeights,
  useWorkouts,
} from '../state/AppContext';
import { formatDayLabel, formatRelativeDayLabel, monthGrid } from '../lib/dates';

function TrainSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-5 h-12 w-40 bg-surface-2" />
      <div className="mt-5 h-24 w-full bg-surface-2" />
      <div className="mt-4 h-64 w-full bg-surface-2" />
    </div>
  );
}

/** Train tab: routine-based workout tracker, month calendar, body-weight log. */
export function Train() {
  const { todayKey } = useApp();
  const routines = useRoutines();
  const weights = useWeights();

  if (!routines || !weights) return <TrainSkeleton />;

  return (
    <div className="md:grid md:grid-cols-2 md:items-start md:gap-10">
      <div>
        <header className="mt-5 md:mt-0">
          <h1 className="serif text-[40px] leading-none text-ink md:text-[56px]">Train</h1>
          <p className="mt-2 text-[13px] text-ink-faint">
            Routines, workouts, and weight — synced with your food.
          </p>
        </header>

        <WorkoutTracker routines={routines} todayKey={todayKey} />
        <WeightLog />
      </div>

      <div className="mt-8 md:mt-0">
        <MonthCalendar todayKey={todayKey} />
      </div>
    </div>
  );
}

// ---- workout tracker ----

function WorkoutTracker({ routines, todayKey }: { routines: Routine[]; todayKey: string }) {
  const { addRoutine, removeRoutine, logWorkout, removeWorkout } = useApp();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(false);
  const todayWorkouts = useWorkouts(useMemo(() => [todayKey], [todayKey]));
  const doneToday = todayWorkouts?.get(todayKey) ?? [];

  const submit = async () => {
    if (!newName.trim()) return;
    await addRoutine(newName);
    setNewName('');
  };

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between border-b-[1.5px] border-edge pb-2">
        <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">Workouts</h2>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="label-caps text-[10px] tracking-[0.08em] text-ink-faint underline decoration-hairline underline-offset-2"
        >
          {editing ? 'Done' : 'Edit routines'}
        </button>
      </div>

      {routines.length === 0 && (
        <p className="serif mt-4 text-[15px] italic text-ink-faint">
          Add a routine below — then logging a workout is one tap.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {routines.map((r) => {
          const doneCount = doneToday.filter((w) => w.routineId === r.id).length;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => (editing ? void removeRoutine(r.id) : void logWorkout(r))}
              className={`label-caps h-11 border-[1.5px] px-4 text-[11px] tracking-[0.06em] transition-colors active:translate-y-px ${
                editing
                  ? 'border-danger text-danger'
                  : doneCount > 0
                    ? 'border-edge bg-ink text-surface'
                    : 'border-edge text-ink'
              }`}
            >
              {editing ? `✕ ${r.name}` : doneCount > 0 ? `✓ ${r.name}` : `+ ${r.name}`}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New routine, e.g. “Leg day” or “Shooting drills”"
          className="h-11 min-w-0 flex-1 border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="label-caps h-11 shrink-0 border-[1.5px] border-edge bg-accent px-4 text-[11px] text-surface active:translate-y-px disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {doneToday.length > 0 && (
        <ul className="mt-4">
          {doneToday.map((w) => (
            <li
              key={w.id}
              className="flex items-baseline gap-3 border-b border-hairline py-2.5 text-[13.5px]"
            >
              <span className="serif min-w-0 flex-1 text-[16px] text-ink">{w.routineName}</span>
              <span className="label-caps text-[10px] tracking-[0.08em] text-accent">
                done today
              </span>
              <button
                type="button"
                aria-label={`Remove ${w.routineName}`}
                onClick={() => void removeWorkout(w.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint active:text-danger"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- month calendar ----

function MonthCalendar({ todayKey }: { todayKey: string }) {
  const [offset, setOffset] = useState(0);
  const grid = useMemo(() => monthGrid(offset), [offset]);
  const days = useDaySummaries(grid.dateKeys);
  const workouts = useWorkouts(grid.dateKeys);
  const [selected, setSelected] = useState<string | null>(null);

  const byKey = useMemo(() => new Map((days ?? []).map((d) => [d.dateKey, d])), [days]);

  const selectedDay = selected ? byKey.get(selected) : undefined;
  const selectedWorkouts = selected ? (workouts?.get(selected) ?? []) : [];

  return (
    <section className="mt-8 md:mt-0">
      <div className="flex items-baseline justify-between border-b-[1.5px] border-edge pb-2">
        <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">Calendar</h2>
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => {
              setOffset((o) => o - 1);
              setSelected(null);
            }}
            className="num px-2 text-[15px] text-ink active:translate-y-px"
          >
            ←
          </button>
          <span className="serif text-[16px] text-ink">{grid.label}</span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => {
              setOffset((o) => o + 1);
              setSelected(null);
            }}
            disabled={offset >= 0}
            className="num px-2 text-[15px] text-ink active:translate-y-px disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>

      <div className="label-caps mt-3 grid grid-cols-7 text-center text-[9px] tracking-[0.08em] text-ink-faint">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 border-l border-t border-hairline">
        {Array.from({ length: grid.leadingBlanks }, (_, i) => (
          <div key={`b${i}`} className="aspect-square border-b border-r border-hairline bg-surface-2/50" />
        ))}
        {grid.dateKeys.map((key) => {
          const day = byKey.get(key);
          const ate = (day?.mealCount ?? 0) > 0;
          const trained = (workouts?.get(key)?.length ?? 0) > 0;
          const isToday = key === todayKey;
          const isFuture = key > todayKey;
          const isSelected = key === selected;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(isSelected ? null : key)}
              disabled={isFuture}
              aria-label={`Details for ${formatDayLabel(key)}`}
              className={`flex aspect-square flex-col items-center justify-center gap-1 border-b border-r border-hairline transition-colors ${
                isSelected ? 'bg-ink text-surface' : isToday ? 'bg-surface' : ''
              } ${isFuture ? 'opacity-30' : ''}`}
            >
              <span className={`num text-[12px] ${isToday && !isSelected ? 'font-bold text-accent' : ''}`}>
                {Number(key.slice(-2))}
              </span>
              <span className="flex h-1.5 items-center gap-1">
                {ate && <span className="h-1.5 w-1.5 bg-accent" aria-label="ate" />}
                {trained && (
                  <span
                    className={`h-1.5 w-1.5 ${isSelected ? 'bg-surface' : 'bg-ink'}`}
                    aria-label="worked out"
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-4 text-[10.5px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-accent" /> ate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-ink" /> worked out
        </span>
      </p>

      {selected && (
        <div className="animate-rise mt-4 border-[1.5px] border-edge bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="serif text-[20px] text-ink">{formatRelativeDayLabel(selected)}</h3>
            {selectedDay && selectedDay.mealCount > 0 && (
              <span className="num text-[12px] text-ink-dim">
                <span className="font-bold text-accent">{Math.round(selectedDay.protein_g)}g</span>{' '}
                · {Math.round(selectedDay.calories)} kcal
              </span>
            )}
          </div>
          {selectedWorkouts.length > 0 && (
            <p className="mt-2 text-[12.5px] text-ink-dim">
              <span className="label-caps text-[9.5px] tracking-[0.08em] text-ink-faint">
                Trained ·{' '}
              </span>
              {selectedWorkouts.map((w) => w.routineName).join(', ')}
            </p>
          )}
          {selectedDay && selectedDay.meals.length > 0 ? (
            <ul className="mt-2">
              {selectedDay.meals.map((m) => (
                <li key={m.id} className="flex items-baseline gap-2 border-b border-hairline py-1.5 text-[12.5px] last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-ink">{m.name}</span>
                  <span className="num shrink-0 font-semibold text-accent">{m.protein_g}g</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="serif mt-2 text-[13px] italic text-ink-faint">Nothing eaten was logged.</p>
          )}
          {selectedWorkouts.length === 0 && (
            <p className="serif mt-1 text-[13px] italic text-ink-faint">No workout logged.</p>
          )}
        </div>
      )}
    </section>
  );
}

// ---- body-weight log ----

function WeightLog() {
  const { logWeight, removeWeight, settings, todayKey } = useApp();
  const weights = useWeights();
  const [input, setInput] = useState('');

  const submit = async () => {
    const n = Number(input);
    if (!Number.isFinite(n) || n < 30 || n > 250) return;
    await logWeight(Math.round(n * 10) / 10);
    setInput('');
  };

  const recent = (weights ?? []).slice(-8).reverse();
  const latest = recent[0];

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between border-b-[1.5px] border-edge pb-2">
        <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">Body weight</h2>
        <span className="num text-[11px] text-ink-faint">
          now {latest ? latest.weightKg : settings.weightKg} kg
        </span>
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
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Today's weight (kg)`}
          className="num h-11 min-w-0 flex-1 border-[1.5px] border-edge bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="label-caps h-11 shrink-0 border-[1.5px] border-edge bg-accent px-4 text-[11px] text-surface active:translate-y-px disabled:opacity-40"
        >
          Log
        </button>
      </form>

      {recent.length > 0 && (
        <ul className="mt-3">
          {recent.map((w, i) => {
            const prev = recent[i + 1];
            const delta = prev ? Math.round((w.weightKg - prev.weightKg) * 10) / 10 : null;
            return (
              <li key={w.dateKey} className="flex items-baseline gap-3 border-b border-hairline py-2 text-[13px]">
                <span className="min-w-0 flex-1 text-ink-dim">
                  {w.dateKey === todayKey ? 'Today' : formatDayLabel(w.dateKey)}
                </span>
                {delta !== null && delta !== 0 && (
                  <span className={`num text-[11px] ${delta > 0 ? 'text-accent' : 'text-ink-faint'}`}>
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </span>
                )}
                <span className="num font-semibold text-ink">{w.weightKg} kg</span>
                <button
                  type="button"
                  aria-label={`Remove weigh-in for ${formatDayLabel(w.dateKey)}`}
                  onClick={() => void removeWeight(w.dateKey)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint active:text-danger"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
