import { useMemo, useState } from 'react';
import type { DaySummary, Workout } from '../types';
import { useDaySummaries, useApp, useWorkouts } from '../state/AppContext';
import { formatDayLabel, formatRelativeDayLabel, formatTime, monthGrid } from '../lib/dates';

function CalendarSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-5 h-12 w-56 bg-surface-2" />
      <div className="mt-5 h-80 w-full bg-surface-2" />
    </div>
  );
}

/**
 * Calendar tab: one month view with per-day dots (ate / worked out). Clicking
 * a day slides a day-view panel in beside the grid — on wide screens the
 * calendar is pushed left to make room; on phones the panel opens below.
 */
export function Calendar() {
  const { todayKey } = useApp();
  const [offset, setOffset] = useState(0);
  const grid = useMemo(() => monthGrid(offset), [offset]);
  const days = useDaySummaries(grid.dateKeys);
  const workouts = useWorkouts(grid.dateKeys);
  const [selected, setSelected] = useState<string | null>(null);

  const byKey = useMemo(() => new Map((days ?? []).map((d) => [d.dateKey, d])), [days]);

  if (!days) return <CalendarSkeleton />;

  const open = selected !== null;

  return (
    <div>
      <header className="mt-5 md:mt-0">
        <h1 className="serif text-[40px] leading-none text-ink md:text-[56px]">Calendar</h1>
        <p className="mt-2 text-[13px] text-ink-faint">
          Every day at a glance — tap one to open it.
        </p>
      </header>

      {/* When a day is open on md+, the grid column narrows and the day view
          takes the right column — the calendar is "pushed" aside. */}
      <div
        className={`mt-6 flex flex-col gap-6 md:grid md:items-start md:gap-8 ${
          open ? 'md:grid-cols-[1.4fr_1fr]' : 'md:grid-cols-1'
        }`}
      >
        <section className={open ? '' : 'md:max-w-[720px]'}>
          <div className="flex items-baseline justify-between border-b-[1.5px] border-edge pb-2">
            <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">{grid.label}</h2>
            <div className="flex items-baseline gap-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => {
                  setOffset((o) => o - 1);
                  setSelected(null);
                }}
                className="num px-2.5 text-[16px] text-ink active:translate-y-px"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => {
                  setOffset((o) => o + 1);
                  setSelected(null);
                }}
                disabled={offset >= 0}
                className="num px-2.5 text-[16px] text-ink active:translate-y-px disabled:opacity-30"
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
              <div
                key={`b${i}`}
                className="aspect-square border-b border-r border-hairline bg-surface-2/50"
              />
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
                  aria-label={`Open ${formatDayLabel(key)}`}
                  aria-pressed={isSelected}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 border-b border-r border-hairline transition-colors ${
                    isSelected ? 'bg-ink text-surface' : isToday ? 'bg-surface' : ''
                  } ${isFuture ? 'opacity-30' : ''}`}
                >
                  <span
                    className={`num text-[13px] ${isToday && !isSelected ? 'font-bold text-accent' : ''}`}
                  >
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
        </section>

        {open && selected && (
          <DayView
            dateKey={selected}
            day={byKey.get(selected)}
            workouts={workouts?.get(selected) ?? []}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---- day view panel ----

function DayView({
  dateKey,
  day,
  workouts,
  onClose,
}: {
  dateKey: string;
  day: DaySummary | undefined;
  workouts: Workout[];
  onClose: () => void;
}) {
  return (
    <aside className="animate-rise border-[1.5px] border-edge bg-surface p-5 shadow-offset-6 md:sticky md:top-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="serif text-[28px] leading-none text-ink">
            {formatRelativeDayLabel(dateKey)}
          </h2>
          {day && day.lightDay && (
            <span className="label-caps mt-1.5 inline-block text-[10px] tracking-[0.08em] text-ink-faint">
              ☾ light day
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Close day view"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center border-[1.5px] border-edge text-ink active:translate-y-px"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {day && day.mealCount > 0 && (
        <div className="mt-4 flex border-[1.5px] border-edge">
          <div className="flex-1 border-r border-edge p-3">
            <div className="serif num text-[24px] text-accent">{Math.round(day.protein_g)}g</div>
            <div className="label-caps mt-0.5 text-[9.5px] tracking-[0.08em] text-ink-faint">
              protein
            </div>
          </div>
          <div className="flex-1 p-3">
            <div className="serif num text-[24px] text-ink">{Math.round(day.calories)}</div>
            <div className="label-caps mt-0.5 text-[9.5px] tracking-[0.08em] text-ink-faint">
              kcal
            </div>
          </div>
        </div>
      )}

      <h3 className="label-caps mt-5 border-b border-hairline pb-1.5 text-[10.5px] tracking-[0.12em] text-ink">
        Eaten
      </h3>
      {day && day.meals.length > 0 ? (
        <ul>
          {day.meals.map((m) => (
            <li key={m.id} className="flex items-baseline gap-2.5 border-b border-hairline py-2.5 text-[13px] last:border-b-0">
              <span className="num w-9 shrink-0 text-[10.5px] text-ink-faint">
                {formatTime(m.loggedAt)}
              </span>
              <span className="serif min-w-0 flex-1 truncate text-[15px] text-ink">{m.name}</span>
              <span className="num shrink-0 font-semibold text-accent">{m.protein_g}g</span>
              <span className="num shrink-0 text-[11px] text-ink-faint">{m.calories}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="serif mt-2 text-[13px] italic text-ink-faint">Nothing logged.</p>
      )}

      <h3 className="label-caps mt-5 border-b border-hairline pb-1.5 text-[10.5px] tracking-[0.12em] text-ink">
        Trained
      </h3>
      {workouts.length > 0 ? (
        <ul>
          {workouts.map((w) => (
            <li key={w.id} className="flex items-baseline gap-2.5 border-b border-hairline py-2.5 text-[13px] last:border-b-0">
              <span className="serif min-w-0 flex-1 text-[15px] text-ink">{w.routineName}</span>
              <span className="label-caps shrink-0 text-[9.5px] tracking-[0.08em] text-accent">
                done
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="serif mt-2 text-[13px] italic text-ink-faint">No workout logged.</p>
      )}
    </aside>
  );
}
