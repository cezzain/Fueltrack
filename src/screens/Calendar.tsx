import { useMemo, useState } from 'react';
import type { DaySummary, Workout } from '../types';
import { useApp, useDaySummaries, useDaySummary, useWorkouts } from '../state/AppContext';
import {
  formatDayLabel,
  formatDayLabelLong,
  formatRelativeDayLabel,
  formatTime,
  monthGrid,
} from '../lib/dates';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function CalendarSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-5 h-12 w-56 bg-surface-2" />
      <div className="mt-6 h-80 w-full bg-surface-2" />
    </div>
  );
}

/**
 * Calendar tab (Editorial Calendar Page design): a bordered month grid with
 * per-day dots (ate / worked out) and an always-present day panel that shows
 * the selected day's meals + workout. Desktop puts the panel in a fixed right
 * column; phone stacks it below the grid. Defaults to today.
 */
export function Calendar() {
  const { todayKey } = useApp();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(todayKey);
  const grid = useMemo(() => monthGrid(offset), [offset]);
  const days = useDaySummaries(grid.dateKeys);
  const monthWorkouts = useWorkouts(grid.dateKeys);

  // The panel's day is queried independently so it keeps working even after
  // navigating to a month the selected day isn't in.
  const selectedDay = useDaySummary(selected);
  const selectedWorkouts = useWorkouts(useMemo(() => [selected], [selected]));

  const byKey = useMemo(() => new Map((days ?? []).map((d) => [d.dateKey, d])), [days]);

  if (!days) return <CalendarSkeleton />;

  const trailingBlanks = (7 - ((grid.leadingBlanks + grid.dateKeys.length) % 7)) % 7;

  return (
    <div>
      <header className="mt-5 md:mt-0">
        <h1 className="serif text-[46px] leading-none text-ink md:text-[60px]">Calendar</h1>
        <p className="mt-1.5 text-[12.5px] text-ink-faint md:mt-2 md:text-[13.5px]">
          Every day at a glance — tap one to open it.
        </p>
      </header>

      <div className="mt-6 md:grid md:grid-cols-[1.15fr_1fr] md:items-start md:gap-8">
        {/* Month grid */}
        <section>
          <div className="flex items-center justify-between border-b-[1.5px] border-edge pb-2">
            <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">{grid.label}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setOffset((o) => o - 1)}
                className="flex h-8 w-8 items-center justify-center border-[1.5px] border-edge text-[14px] text-ink active:translate-y-px md:h-[34px] md:w-[34px]"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setOffset((o) => o + 1)}
                disabled={offset >= 0}
                className="flex h-8 w-8 items-center justify-center border-[1.5px] border-edge text-[14px] text-ink active:translate-y-px disabled:opacity-30 md:h-[34px] md:w-[34px]"
              >
                →
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 border-l border-t border-hairline md:mt-3.5">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="border-r border-hairline py-1.5 text-center text-[9px] tracking-[0.08em] text-ink-faint md:py-2 md:text-[10px]"
              >
                {w}
              </div>
            ))}
            {Array.from({ length: grid.leadingBlanks }, (_, i) => (
              <div key={`lead${i}`} className="aspect-square border-b border-r border-hairline bg-surface-2" />
            ))}
            {grid.dateKeys.map((key) => {
              const day = byKey.get(key);
              const ate = (day?.mealCount ?? 0) > 0;
              const trained = (monthWorkouts?.get(key)?.length ?? 0) > 0;
              const isSel = key === selected;
              const isFuture = key > todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  aria-pressed={isSel}
                  aria-label={`Open ${formatDayLabel(key)}`}
                  className={`relative flex aspect-square items-start justify-center border-b border-r border-hairline p-1.5 transition-colors md:justify-start md:p-2.5 ${
                    isSel ? 'bg-ink' : 'bg-surface'
                  }`}
                >
                  <span
                    className={`serif text-[17px] leading-none md:text-[22px] ${
                      isSel ? 'text-surface' : isFuture ? 'text-[#c3bcac]' : 'text-ink'
                    }`}
                  >
                    {Number(key.slice(-2))}
                  </span>
                  {(ate || trained) && (
                    <span className="absolute inset-x-0 bottom-1.5 flex justify-center gap-[3px] md:inset-x-auto md:bottom-2.5 md:left-2.5 md:justify-start md:gap-1">
                      {ate && (
                        <span
                          className={`h-[5px] w-[5px] md:h-1.5 md:w-1.5 ${isSel ? 'bg-accent-on-dark' : 'bg-accent'}`}
                        />
                      )}
                      {trained && (
                        <span
                          className={`h-[5px] w-[5px] md:h-1.5 md:w-1.5 ${isSel ? 'bg-surface' : 'bg-ink'}`}
                        />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
            {Array.from({ length: trailingBlanks }, (_, i) => (
              <div key={`tail${i}`} className="aspect-square border-b border-r border-hairline bg-surface-2" />
            ))}
          </div>

          <div className="mt-2.5 flex gap-4 text-[10px] tracking-[0.06em] text-ink-faint md:mt-3 md:gap-5 md:text-[11px]">
            <span className="label-caps flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] bg-accent md:h-2 md:w-2" /> Ate
            </span>
            <span className="label-caps flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] bg-ink md:h-2 md:w-2" /> Worked out
            </span>
          </div>
        </section>

        <DayPanel
          dateKey={selected}
          day={selectedDay}
          workouts={selectedWorkouts?.get(selected) ?? []}
          isToday={selected === todayKey}
        />
      </div>
    </div>
  );
}

// ---- day panel ----

function DayPanel({
  dateKey,
  day,
  workouts,
  isToday,
}: {
  dateKey: string;
  day: DaySummary | null;
  workouts: Workout[];
  isToday: boolean;
}) {
  const sectionLabel =
    'label-caps mt-4 border-b-[1.5px] border-edge pb-1.5 text-[10.5px] tracking-[0.14em] text-ink md:mt-5 md:text-[11px]';
  const emptyLine = 'serif mt-3 text-[14px] italic text-ink-faint md:text-[16px]';

  return (
    <aside className="mt-6 border-[1.5px] border-edge bg-surface p-[18px] shadow-offset-6 md:mt-0 md:p-7 md:shadow-offset-8">
      <div className="serif text-[30px] leading-none text-ink md:text-[40px]">
        {isToday ? 'Today' : formatRelativeDayLabel(dateKey)}
      </div>
      <div className="label-caps mt-1.5 text-[10px] tracking-[0.08em] text-ink-faint md:text-[11px]">
        {formatDayLabelLong(dateKey)}
      </div>

      <div className="mt-3.5 flex border-[1.5px] border-edge md:mt-[18px]">
        <div className="flex-1 border-r-[1.5px] border-edge p-3 md:p-[18px]">
          <div className="serif num text-[30px] leading-none text-accent md:text-[44px]">
            {day ? Math.round(day.protein_g) : 0}g
          </div>
          <div className="label-caps mt-1 text-[9px] tracking-[0.1em] text-ink-faint md:mt-1.5 md:text-[10px]">
            Protein
          </div>
        </div>
        <div className="flex-1 p-3 md:p-[18px]">
          <div className="serif num text-[30px] leading-none text-ink md:text-[44px]">
            {day ? Math.round(day.calories).toLocaleString('en-US') : '0'}
          </div>
          <div className="label-caps mt-1 text-[9px] tracking-[0.1em] text-ink-faint md:mt-1.5 md:text-[10px]">
            Kcal
          </div>
        </div>
      </div>

      <h3 className={sectionLabel}>Eaten</h3>
      {day && day.meals.length > 0 ? (
        <ul>
          {day.meals.map((m) => (
            <li
              key={m.id}
              className="flex items-baseline gap-2 border-b border-hairline py-2.5 md:gap-3 md:py-3.5"
            >
              <span className="num w-9 shrink-0 text-[10.5px] text-ink-faint md:w-[42px] md:text-[11px]">
                {formatTime(m.loggedAt)}
              </span>
              <span className="serif min-w-0 flex-1 text-[15px] leading-tight text-ink md:text-[18px]">
                {m.name}
              </span>
              <span className="num shrink-0 text-[13px] font-bold text-accent md:text-[15px]">
                {m.protein_g}g
              </span>
              <span className="num w-11 shrink-0 text-right text-[11px] text-ink-faint md:w-12 md:text-[12px]">
                {m.calories}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={emptyLine}>Nothing logged this day.</p>
      )}

      <h3 className={sectionLabel}>Trained</h3>
      {workouts.length > 0 ? (
        <div className="serif py-2.5 text-[15px] text-ink md:py-3.5 md:text-[18px]">
          {workouts.map((w) => w.routineName).join(', ')}
        </div>
      ) : (
        <p className={emptyLine}>No workout logged.</p>
      )}
    </aside>
  );
}
