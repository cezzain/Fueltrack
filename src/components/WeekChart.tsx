import type { DaySummary } from '../types';
import { APP_TZ } from '../lib/dates';

const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, weekday: 'narrow' });

/** "M" / "T" / … for a YYYY-MM-DD key, in Dubai time. */
function weekdayInitial(dateKey: string): string {
  return weekdayFmt.format(new Date(`${dateKey}T12:00:00+04:00`));
}

/**
 * Seven ink-bordered bars, one per day, filled to the day's protein vs target.
 * Shared by the Insights screen and the desktop Today right column.
 */
export function WeekChart({
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
              <div
                className="flex h-[76px] w-[22px] items-end border border-edge md:h-[92px] md:w-[26px]"
                style={{ padding: 1.5 }}
              >
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
