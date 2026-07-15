import { useMemo, useState } from 'react';
import type { DaySummary, Meal } from '../types';
import { useApp, useDaySummaries } from '../state/AppContext';
import { formatRelativeDayLabel, lastNDateKeys } from '../lib/dates';
import { MealCard } from '../components/MealCard';

function HistorySkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-5 h-12 w-44 bg-surface-2" />
      <div className="mt-5 h-24 w-full bg-surface-2" />
      <div className="mt-6 h-16 w-full bg-surface-2" />
      <div className="mt-3 h-16 w-full bg-surface-2" />
    </div>
  );
}

/** Averages over the last 7 days, counting only days with at least one meal. */
function WeeklyAverages({ days, proteinTarget }: { days: DaySummary[]; proteinTarget: number }) {
  const last7 = days.slice(-7);
  const logged = last7.filter((d) => d.mealCount > 0);
  const n = logged.length;
  const avgProtein = n > 0 ? Math.round(logged.reduce((sum, d) => sum + d.protein_g, 0) / n) : null;
  const avgCalories = n > 0 ? Math.round(logged.reduce((sum, d) => sum + d.calories, 0) / n) : null;
  const onTarget = logged.filter((d) => d.protein_g >= proteinTarget).length;

  const cell = (value: string, label: string, accent = false, last = false) => (
    <div className={`flex-1 p-3.5 ${last ? '' : 'border-r border-edge'}`}>
      <div className={`serif num text-[26px] ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
      <div className="label-caps mt-0.5 text-[10px] tracking-[0.08em] text-ink-faint">{label}</div>
    </div>
  );

  return (
    <section className="flex border-[1.5px] border-edge bg-surface" aria-label="Last 7 days">
      {cell(avgProtein !== null ? `${avgProtein}g` : '—', 'avg protein', true)}
      {cell(avgCalories !== null ? String(avgCalories) : '—', 'avg kcal')}
      {cell(n > 0 ? `${onTarget}/${n}` : '—', 'target hit', false, true)}
    </section>
  );
}

/**
 * Day status vs the calorie target: hit once the target is reached; missed
 * for a PAST day that fell short (today is still in progress and light days
 * are exempt — no failure states there).
 */
function dayStatus(
  day: DaySummary,
  isToday: boolean,
  calorieTarget: number,
): 'hit' | 'missed' | 'neutral' {
  if (day.calories >= calorieTarget) return 'hit';
  if (!isToday && !day.lightDay && day.mealCount > 0) return 'missed';
  return 'neutral';
}

function DayRow({
  day,
  isToday,
  proteinTarget,
  onRepeat,
  onDelete,
  onDeleteItem,
}: {
  day: DaySummary;
  isToday: boolean;
  proteinTarget: number;
  onRepeat: (meal: Meal) => void;
  onDelete: (meal: Meal) => void;
  onDeleteItem: (meal: Meal, itemId: string) => void;
}) {
  const { settings } = useApp();
  const [expanded, setExpanded] = useState(isToday);
  const status = dayStatus(day, isToday, settings.calorieTarget_kcal);
  const proteinPct = proteinTarget > 0 ? Math.min(100, (day.protein_g / proteinTarget) * 100) : 0;

  return (
    <div className="animate-rise border-b border-hairline">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        data-testid="day-toggle"
        className="flex w-full items-baseline gap-3 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5">
            <span className="serif text-[21px] text-ink">{formatRelativeDayLabel(day.dateKey)}</span>
            {day.lightDay && (
              <span className="label-caps shrink-0 text-[10px] font-semibold tracking-[0.08em] text-ink-faint">
                ☾ light
              </span>
            )}
            {status === 'hit' && (
              <span className="label-caps shrink-0 text-[10px] tracking-[0.08em] text-accent">
                ● target hit
              </span>
            )}
            {status === 'missed' && (
              <span className="label-caps shrink-0 text-[10px] tracking-[0.08em] text-danger">
                under target
              </span>
            )}
          </div>
          <div className="mt-2 h-2 max-w-[200px] border border-edge" style={{ padding: 1.5 }}>
            <div className="h-full bg-accent" style={{ width: `${proteinPct}%` }} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[16px] font-bold text-accent">{Math.round(day.protein_g)}g</div>
          <div
            className={`num text-[11px] ${
              status === 'hit' ? 'text-accent' : status === 'missed' ? 'text-danger' : 'text-ink-faint'
            }`}
          >
            {Math.round(day.calories)} kcal
          </div>
        </div>
      </button>

      {expanded && (
        <div className="pb-3 pl-2">
          {day.meals.length === 0 ? (
            <p className="serif pb-2 text-[14px] italic text-ink-faint">Nothing logged yet today.</p>
          ) : (
            day.meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onRepeat={onRepeat}
                onDelete={onDelete}
                onDeleteItem={onDeleteItem}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Past days, expandable to meals, with weekly averages. */
export function History() {
  const { repeatMeal, removeMeal, removeMealItem, settings, todayKey } = useApp();
  // Keyed to todayKey so the window rolls forward at Dubai midnight even if
  // this screen stays mounted across the rollover.
  const keys = useMemo(() => lastNDateKeys(30), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useDaySummaries(keys);

  if (!days) return <HistorySkeleton />;

  const visible = [...days].reverse().filter((d) => d.mealCount > 0 || d.dateKey === todayKey);

  return (
    <div className="w-full">
      <header className="mt-5 md:mt-0">
        <h1 className="serif text-[40px] leading-none text-ink md:text-[56px]">History</h1>
        <p className="mt-2 text-[13px] text-ink-faint">Last 30 days</p>
      </header>

      <div className="mt-4 md:max-w-[640px]">
        <WeeklyAverages days={days} proteinTarget={settings.proteinTarget_g} />
      </div>

      {/* Day rows stack on phone; on desktop they flow into two/three columns
          so the month's history fills the sheet instead of a single strip. */}
      <section className="mt-5">
        {visible.length === 0 ? (
          <p className="serif mt-4 text-[16px] italic text-ink-faint">
            No days logged yet — meals you log will show up here, day by day.
          </p>
        ) : (
          <div className="md:grid md:grid-cols-2 md:items-start md:gap-x-10 lg:grid-cols-3">
            {visible.map((day) => (
              <DayRow
                key={day.dateKey}
                day={day}
                isToday={day.dateKey === todayKey}
                proteinTarget={settings.proteinTarget_g}
                onRepeat={repeatMeal}
                onDelete={(m) => removeMeal(m.id)}
                onDeleteItem={removeMealItem}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
