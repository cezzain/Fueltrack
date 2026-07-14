import { useApp, useDaySummary } from '../state/AppContext';
import { MealCard } from '../components/MealCard';
import { ProgressRing } from '../components/ProgressRing';
import { MoonIcon } from '../components/icons';

function TodaySkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-1 h-20 w-48 bg-surface-2" />
      <div className="mt-4 h-4 w-32 bg-surface-2" />
      <div className="mt-3 h-3.5 w-full bg-surface-2" />
      <div className="mt-8 h-12 w-40 bg-surface-2" />
      <div className="mt-3 h-2.5 w-full bg-surface-2" />
      <div className="mt-6 h-14 w-full bg-surface-2" />
      <div className="mt-8 h-16 w-full bg-surface-2" />
    </div>
  );
}

/** "How am I doing today?" — editorial hero figures, quick log CTA, meals. */
export function Today() {
  const { todayKey, settings, setTab, repeatMeal, removeMeal, setLightDay } = useApp();
  const day = useDaySummary(todayKey);

  if (!day) return <TodaySkeleton />;

  const light = day.lightDay;
  const proteinRem = Math.round(settings.proteinTarget_g - day.protein_g);
  const calRem = Math.round(settings.calorieTarget_kcal - day.calories);

  const remaining = (rem: number, unit: string, hitText: string) =>
    rem > 0 ? (
      <span className={`serif italic ${light ? 'text-ink-faint' : 'text-ink-dim'}`}>
        <span className="num">{rem.toLocaleString('en-US')}</span>
        {unit} to go
      </span>
    ) : (
      <span className={`serif italic ${light ? 'text-ink-faint' : 'text-accent'}`}>{hitText}</span>
    );

  return (
    <div>
      <div className="mt-1">
        <ProgressRing
          value={day.protein_g}
          target={settings.proteinTarget_g}
          label="Protein"
          unit="g"
          tone="accent"
          variant="hero"
          lightDay={light}
        />
        <p className="mt-1.5 text-[13px]">{remaining(proteinRem, 'g', `target hit +${-proteinRem}g`)}</p>
      </div>

      <div className="mt-6">
        <ProgressRing
          value={day.calories}
          target={settings.calorieTarget_kcal}
          label="Calories"
          unit="kcal"
          tone="cal"
          variant="md"
          lightDay={light}
        />
        <p className="mt-1.5 text-[13px]">
          {calRem >= 0 ? (
            remaining(calRem, ' kcal', 'target hit')
          ) : (
            <span className={`serif italic ${light ? 'text-ink-faint' : 'text-warn'}`}>
              <span className="num">+{(-calRem).toLocaleString('en-US')}</span> kcal over
            </span>
          )}
        </p>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('log')}
          className="label-caps h-[54px] flex-1 border-[1.5px] border-edge bg-accent text-[14px] tracking-[0.06em] text-surface shadow-offset-4 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Snap a meal ↗
        </button>
        <button
          type="button"
          onClick={() => setLightDay(todayKey, !light)}
          aria-pressed={light}
          aria-label="Toggle light day"
          className={`flex h-[54px] w-[54px] items-center justify-center border-[1.5px] border-edge transition-colors ${
            light ? 'bg-ink text-surface' : 'bg-transparent text-ink'
          }`}
        >
          <MoonIcon size={18} />
        </button>
      </div>
      {light && (
        <p className="serif mt-2.5 text-[13px] italic text-ink-faint">
          Light day — targets relaxed, no pressure.
        </p>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between border-b-[1.5px] border-edge pb-2">
          <h2 className="label-caps text-[12px] tracking-[0.14em] text-ink">Logged today</h2>
          <span className="text-[11px] text-ink-faint">
            {day.meals.length} {day.meals.length === 1 ? 'meal' : 'meals'}
          </span>
        </div>
        {day.meals.length === 0 ? (
          <p className="serif mt-5 text-[16px] italic text-ink-faint">
            Nothing logged yet — hit the camera.
          </p>
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
      </section>
    </div>
  );
}
