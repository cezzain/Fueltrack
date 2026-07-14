import type { ReactNode } from 'react';
import { useApp, useDaySummary } from '../state/AppContext';
import { formatDayLabelLong } from '../lib/dates';
import { MealCard } from '../components/MealCard';
import { ProgressRing } from '../components/ProgressRing';
import { CameraIcon, MoonIcon } from '../components/icons';

function Header({ dateLabel, children }: { dateLabel: string; children?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">Today</h1>
        <p className="mt-0.5 text-sm text-ink-dim">{dateLabel}</p>
      </div>
      {children}
    </header>
  );
}

function TodaySkeleton({ dateLabel }: { dateLabel: string }) {
  return (
    <div>
      <Header dateLabel={dateLabel}>
        <div className="h-11 w-24 animate-pulse rounded-full bg-surface-2" />
      </Header>
      <div className="mt-6 flex animate-pulse items-start justify-around gap-3">
        <div className="flex flex-col items-center gap-2">
          <div className="h-[150px] w-[150px] rounded-full bg-surface" />
          <div className="h-4 w-20 rounded-md bg-surface" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="h-[150px] w-[150px] rounded-full bg-surface" />
          <div className="h-4 w-20 rounded-md bg-surface" />
        </div>
      </div>
      <div className="mt-5 h-14 w-full animate-pulse rounded-2xl bg-surface" />
      <div className="mt-7 animate-pulse">
        <div className="h-4 w-28 rounded-md bg-surface" />
        <div className="mt-3 h-[72px] rounded-2xl bg-surface" />
        <div className="mt-3 h-[72px] rounded-2xl bg-surface" />
      </div>
    </div>
  );
}

/** "How am I doing today?" — rings, remaining, quick log CTA, today's meals. */
export function Today() {
  const { todayKey, settings, setTab, repeatMeal, removeMeal, setLightDay } = useApp();
  const day = useDaySummary(todayKey);
  const dateLabel = formatDayLabelLong(todayKey);

  if (!day) return <TodaySkeleton dateLabel={dateLabel} />;

  const light = day.lightDay;
  const proteinRem = Math.round(settings.proteinTarget_g - day.protein_g);
  const calRem = Math.round(settings.calorieTarget_kcal - day.calories);

  return (
    <div>
      <Header dateLabel={dateLabel}>
        <button
          type="button"
          onClick={() => setLightDay(todayKey, !light)}
          aria-pressed={light}
          className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors active:scale-[0.98] ${
            light ? 'bg-warn/15 text-warn' : 'bg-surface-2 text-ink-faint'
          }`}
        >
          <MoonIcon />
          Light day
        </button>
      </Header>

      <div className="mt-6 flex items-start justify-around gap-3">
        <div className="flex flex-col items-center gap-2">
          <ProgressRing
            value={day.protein_g}
            target={settings.proteinTarget_g}
            label="protein"
            unit="g"
            tone="accent"
            lightDay={light}
          />
          {light ? (
            <p className="text-xs text-ink-faint">
              {proteinRem > 0 ? (
                <>
                  <span className="num">{proteinRem}g</span> to go
                </>
              ) : (
                <>
                  target hit <span className="num">+{-proteinRem}g</span>
                </>
              )}
            </p>
          ) : proteinRem > 0 ? (
            <p className="text-xs text-ink-dim">
              <span className="num">{proteinRem}g</span> to go
            </p>
          ) : (
            <p className="text-xs font-medium text-accent-bright">
              target hit <span className="num">+{-proteinRem}g</span>
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <ProgressRing
            value={day.calories}
            target={settings.calorieTarget_kcal}
            label="calories"
            unit="kcal"
            tone="cal"
            lightDay={light}
          />
          {light ? (
            <p className="text-xs text-ink-faint">
              {calRem >= 0 ? (
                <>
                  <span className="num">{calRem} kcal</span> to go
                </>
              ) : (
                <span className="num">+{-calRem} kcal</span>
              )}
            </p>
          ) : calRem >= 0 ? (
            <p className="text-xs text-ink-dim">
              <span className="num">{calRem} kcal</span> to go
            </p>
          ) : (
            <p className="text-xs font-medium text-warn">
              <span className="num">+{-calRem} kcal</span> over
            </p>
          )}
        </div>
      </div>

      {light && (
        <p className="mt-3 text-center text-xs text-warn/80">
          Light day mode — targets relaxed, no pressure.
        </p>
      )}

      <button
        type="button"
        onClick={() => setTab('log')}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-accent text-base font-semibold text-bg transition-transform active:scale-[0.98]"
      >
        <CameraIcon />
        Snap a meal
      </button>

      <section className="mt-7">
        <h2 className="text-sm uppercase tracking-wide text-ink-dim">Logged today</h2>
        <div className="mt-3 flex flex-col gap-3">
          {day.meals.length === 0 ? (
            <div className="rounded-2xl border border-edge bg-surface p-6 text-center">
              <p className="text-sm text-ink-dim">Nothing logged yet — hit the camera.</p>
            </div>
          ) : (
            day.meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onRepeat={repeatMeal}
                onDelete={(m) => removeMeal(m.id)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
