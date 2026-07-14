import { useMemo, useState } from 'react';
import type { DaySummary, Meal } from '../types';
import { useApp, useDaySummaries } from '../state/AppContext';
import { formatRelativeDayLabel, lastNDateKeys } from '../lib/dates';
import { MealCard } from '../components/MealCard';
import { MoonIcon } from '../components/icons';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Header() {
  return (
    <header>
      <h1 className="text-xl font-semibold text-ink">History</h1>
      <p className="mt-0.5 text-sm text-ink-dim">Last 30 days</p>
    </header>
  );
}

function HistorySkeleton() {
  return (
    <div>
      <Header />
      <div className="mt-5 h-28 animate-pulse rounded-2xl bg-surface" />
      <div className="mt-6 animate-pulse">
        <div className="h-4 w-16 rounded-md bg-surface" />
        <div className="mt-3 flex flex-col gap-3">
          <div className="h-[76px] rounded-2xl bg-surface" />
          <div className="h-[76px] rounded-2xl bg-surface" />
          <div className="h-[76px] rounded-2xl bg-surface" />
        </div>
      </div>
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

  return (
    <section className="rounded-2xl border border-edge bg-surface p-4">
      <h2 className="text-sm text-ink-dim">Last 7 days</h2>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex-1">
          <div className="num text-2xl font-semibold text-accent-bright">
            {avgProtein !== null ? (
              <>
                {avgProtein}
                <span className="ml-0.5 text-sm font-medium">g/day</span>
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="mt-0.5 text-xs text-ink-faint">avg protein</div>
        </div>
        <div className="flex-1">
          <div className="num text-2xl font-semibold text-ink">
            {avgCalories !== null ? avgCalories : '—'}
          </div>
          <div className="mt-0.5 text-xs text-ink-faint">avg kcal</div>
        </div>
        <div className="flex-1">
          <div className="num text-2xl font-semibold text-ink">
            {n > 0 ? `${onTarget}/${n}` : '—'}
          </div>
          <div className="mt-0.5 text-xs text-ink-faint">target hit</div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">
        {n > 0 ? (
          <>
            of <span className="num">{n}</span> logged day{n === 1 ? '' : 's'}
          </>
        ) : (
          'No meals logged in the last 7 days yet.'
        )}
      </p>
    </section>
  );
}

function TargetBar({ value, target, tone }: { value: number; target: number; tone: 'accent' | 'cal' }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="h-1 overflow-hidden rounded-full bg-surface-2">
      <div
        className={`h-full rounded-full ${tone === 'accent' ? 'bg-accent' : 'bg-cal'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Day status vs the calorie target: green once the target is hit; red for a
 * PAST day that missed it (today is still in progress and light days are
 * exempt — no failure states there).
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
  calorieTarget,
  onRepeat,
}: {
  day: DaySummary;
  isToday: boolean;
  proteinTarget: number;
  calorieTarget: number;
  onRepeat: (meal: Meal) => void;
}) {
  const [expanded, setExpanded] = useState(isToday);
  const status = dayStatus(day, isToday, calorieTarget);

  return (
    <div
      className={`animate-rise rounded-2xl border bg-surface ${
        status === 'hit'
          ? 'border-accent/40'
          : status === 'missed'
            ? 'border-danger/40'
            : 'border-edge'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium text-ink">
              {formatRelativeDayLabel(day.dateKey)}
            </span>
            {day.lightDay && (
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-dim">
                <MoonIcon size={12} />
                light
              </span>
            )}
            {status === 'hit' && (
              <span className="shrink-0 rounded-md bg-accent-dim px-1.5 py-0.5 text-[10px] font-medium text-accent-bright">
                target hit
              </span>
            )}
            {status === 'missed' && (
              <span className="shrink-0 rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                under target
              </span>
            )}
          </div>
          <div className="mt-2.5 flex flex-col gap-1.5 pr-2">
            <TargetBar value={day.protein_g} target={proteinTarget} tone="accent" />
            <TargetBar value={day.calories} target={calorieTarget} tone="cal" />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[15px] font-semibold text-accent-bright">
            {Math.round(day.protein_g)}g
          </div>
          <div
            className={`num text-xs ${
              status === 'hit' ? 'text-accent-bright' : status === 'missed' ? 'text-danger' : 'text-ink-dim'
            }`}
          >
            {Math.round(day.calories)} kcal
          </div>
        </div>
        <span className="shrink-0 text-ink-faint">
          <ChevronIcon open={expanded} />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-edge p-3">
          {day.meals.length === 0 ? (
            <p className="py-2 text-center text-sm text-ink-dim">Nothing logged yet today.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {day.meals.map((meal) => (
                <MealCard key={meal.id} meal={meal} onRepeat={onRepeat} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Past days, expandable to meals, with weekly averages. */
export function History() {
  const { repeatMeal, settings, todayKey } = useApp();
  // Keyed to todayKey so the window rolls forward at Dubai midnight even if
  // this screen stays mounted across the rollover.
  const keys = useMemo(() => lastNDateKeys(30), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useDaySummaries(keys);

  if (!days) return <HistorySkeleton />;

  const visible = [...days]
    .reverse()
    .filter((d) => d.mealCount > 0 || d.dateKey === todayKey);

  return (
    <div>
      <Header />

      <div className="mt-5">
        <WeeklyAverages days={days} proteinTarget={settings.proteinTarget_g} />
      </div>

      <section className="mt-6">
        <h2 className="text-sm uppercase tracking-wide text-ink-dim">Days</h2>
        <div className="mt-3 flex flex-col gap-3">
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-edge bg-surface p-6 text-center">
              <p className="text-sm text-ink-dim">No days logged yet.</p>
              <p className="mt-1 text-xs text-ink-faint">
                Meals you log will show up here, day by day.
              </p>
            </div>
          ) : (
            visible.map((day) => (
              <DayRow
                key={day.dateKey}
                day={day}
                isToday={day.dateKey === todayKey}
                proteinTarget={settings.proteinTarget_g}
                calorieTarget={settings.calorieTarget_kcal}
                onRepeat={repeatMeal}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
