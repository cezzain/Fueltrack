import { useMemo, useState } from 'react';
import type { Habit, HabitKind } from '../types';
import { useApp, useHabitChecks, useHabits } from '../state/AppContext';
import { formatDayLabel, monthGrid, prevDateKey } from '../lib/dates';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Habit / addiction colour palette — deliberately distinct from the app's
 * burnt-orange accent so a filled day reads as "this habit", not "protein".
 * Eight editorial, slightly desaturated hues.
 */
const PALETTE: { name: string; value: string }[] = [
  { name: 'Teal', value: '#0f766e' },
  { name: 'Indigo', value: '#4338ca' },
  { name: 'Forest', value: '#15803d' },
  { name: 'Amber', value: '#b45309' },
  { name: 'Rose', value: '#be123c' },
  { name: 'Sky', value: '#0369a1' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Pink', value: '#db2777' },
];

const SURFACE = '#f9f8f4';

const EMPTY_SET: ReadonlySet<string> = new Set();

/** Consecutive completed days ending today (or yesterday if today's not done yet). */
function currentStreak(checked: ReadonlySet<string>, today: string): number {
  let cursor = checked.has(today) ? today : prevDateKey(today);
  let streak = 0;
  while (checked.has(cursor)) {
    streak++;
    cursor = prevDateKey(cursor);
  }
  return streak;
}

/** Longest run of consecutive completed days across the whole history. */
function bestStreak(checked: ReadonlySet<string>): number {
  if (checked.size === 0) return 0;
  const sorted = [...checked].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = prevDateKey(sorted[i]) === sorted[i - 1] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

function HabitsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mt-5 h-12 w-56 bg-surface-2" />
      <div className="mt-6 h-10 w-full bg-surface-2" />
      <div className="mt-6 h-80 w-full bg-surface-2" />
    </div>
  );
}

/**
 * Habits tab: an exact copy of the Calendar month grid, repurposed so each day
 * is a tappable toggle. Marking a day fills it with the active habit's colour
 * (a done day for a good habit, a clean day for an addiction you're quitting).
 * A stats column beside the grid tracks streaks. Multiple habits/addictions are
 * switched between with the colour chips up top.
 */
export function Habits() {
  const { todayKey, addHabit, toggleHabitCheck } = useApp();
  const habits = useHabits();
  const checks = useHabitChecks();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [formOpen, setFormOpen] = useState(false);

  const grid = useMemo(() => monthGrid(offset), [offset]);

  // habitId → set of completed date keys.
  const checkedByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of checks ?? []) {
      let set = map.get(c.habitId);
      if (!set) {
        set = new Set();
        map.set(c.habitId, set);
      }
      set.add(c.dateKey);
    }
    return map;
  }, [checks]);

  if (!habits || !checks) return <HabitsSkeleton />;

  // Fall back to the first habit if nothing's picked or the pick was deleted.
  const selected = habits.find((h) => h.id === selectedId) ?? habits[0] ?? null;
  const checkedSet = selected ? checkedByHabit.get(selected.id) ?? EMPTY_SET : EMPTY_SET;

  const handleAdd = async (name: string, kind: HabitKind, color: string) => {
    const created = await addHabit(name, kind, color);
    if (created) {
      setSelectedId(created.id);
      setFormOpen(false);
    }
  };

  return (
    <div>
      <header className="mt-5 md:mt-0">
        <h1 className="serif text-[46px] leading-none text-ink md:text-[60px]">Habits</h1>
        <p className="mt-1.5 text-[12.5px] text-ink-faint md:mt-2 md:text-[13.5px]">
          Build a streak, or count the days clean — tap a day to mark it.
        </p>
      </header>

      {/* Habit chips + new-habit toggle */}
      <div className="mt-5 flex flex-wrap items-center gap-2 md:mt-6">
        {habits.map((h) => {
          const active = selected?.id === h.id;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => setSelectedId(h.id)}
              aria-pressed={active}
              className="label-caps flex items-center gap-2 border-[1.5px] px-3 py-2 text-[11px] tracking-[0.08em] text-ink transition-colors"
              style={
                active
                  ? { backgroundColor: h.color, borderColor: h.color, color: SURFACE }
                  : { borderColor: 'var(--color-edge)' }
              }
            >
              <span
                className="h-2.5 w-2.5"
                style={{ backgroundColor: active ? SURFACE : h.color }}
              />
              {h.name}
            </button>
          );
        })}
        {habits.length > 0 && (
          <button
            type="button"
            onClick={() => setFormOpen((o) => !o)}
            aria-expanded={formOpen}
            className="label-caps flex items-center gap-1.5 border-[1.5px] border-dashed border-ink-faint px-3 py-2 text-[11px] tracking-[0.08em] text-ink-faint transition-colors hover:text-ink"
          >
            ＋ New
          </button>
        )}
      </div>

      {/* Add form: always shown when there are no habits yet, else toggled. */}
      {(formOpen || habits.length === 0) && (
        <AddHabitForm
          existing={habits}
          firstEver={habits.length === 0}
          onCancel={() => setFormOpen(false)}
          onAdd={handleAdd}
        />
      )}

      {selected && (
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

            <HabitGrid
              grid={grid}
              todayKey={todayKey}
              color={selected.color}
              checkedSet={checkedSet}
              onToggle={(key) => void toggleHabitCheck(selected.id, key)}
            />

            <div className="mt-2.5 flex items-center gap-2 text-[10px] tracking-[0.06em] text-ink-faint md:mt-3 md:text-[11px]">
              <span className="h-[9px] w-[9px] md:h-2.5 md:w-2.5" style={{ backgroundColor: selected.color }} />
              <span className="label-caps">
                {selected.kind === 'quit' ? 'Stayed clean' : 'Done'}
              </span>
              <span className="ml-1 text-ink-faint/80">· tap any past or current day</span>
            </div>
          </section>

          <StatsPanel
            habit={selected}
            checkedSet={checkedSet}
            monthKeys={grid.dateKeys}
            todayKey={todayKey}
          />
        </div>
      )}
    </div>
  );
}

// ---- month grid (calendar copy, toggle cells) ----

function HabitGrid({
  grid,
  todayKey,
  color,
  checkedSet,
  onToggle,
}: {
  grid: { label: string; dateKeys: string[]; leadingBlanks: number };
  todayKey: string;
  color: string;
  checkedSet: ReadonlySet<string>;
  onToggle: (dateKey: string) => void;
}) {
  const trailingBlanks = (7 - ((grid.leadingBlanks + grid.dateKeys.length) % 7)) % 7;

  return (
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
        const isChecked = checkedSet.has(key);
        const isFuture = key > todayKey;
        const isToday = key === todayKey;
        // Today gets a hard inset ring so it's findable in either state.
        const ring = isToday
          ? `inset 0 0 0 2px ${isChecked ? SURFACE : 'var(--color-edge)'}`
          : undefined;
        return (
          <button
            key={key}
            type="button"
            disabled={isFuture}
            onClick={() => onToggle(key)}
            aria-pressed={isChecked}
            aria-label={`${isChecked ? 'Unmark' : 'Mark'} ${formatDayLabel(key)}`}
            className="relative flex aspect-square items-start justify-center border-b border-r border-hairline p-1.5 transition-colors active:translate-y-px disabled:active:translate-y-0 md:justify-start md:p-2.5"
            style={{ backgroundColor: isChecked ? color : SURFACE, boxShadow: ring }}
          >
            <span
              className="serif text-[17px] leading-none md:text-[22px]"
              style={{ color: isChecked ? SURFACE : isFuture ? '#c3bcac' : 'var(--color-ink)' }}
            >
              {Number(key.slice(-2))}
            </span>
          </button>
        );
      })}
      {Array.from({ length: trailingBlanks }, (_, i) => (
        <div key={`tail${i}`} className="aspect-square border-b border-r border-hairline bg-surface-2" />
      ))}
    </div>
  );
}

// ---- stats panel ----

function StatsPanel({
  habit,
  checkedSet,
  monthKeys,
  todayKey,
}: {
  habit: Habit;
  checkedSet: ReadonlySet<string>;
  monthKeys: string[];
  todayKey: string;
}) {
  const { removeHabit } = useApp();
  const quit = habit.kind === 'quit';

  const current = currentStreak(checkedSet, todayKey);
  const best = bestStreak(checkedSet);
  const thisMonth = monthKeys.reduce((n, k) => (checkedSet.has(k) ? n + 1 : n), 0);
  const total = checkedSet.size;

  const unit = (n: number) => (n === 1 ? 'day' : 'days');

  return (
    <aside className="mt-6 border-[1.5px] border-edge bg-surface p-[18px] shadow-offset-6 md:mt-0 md:p-7 md:shadow-offset-8">
      <div className="flex items-center gap-2.5">
        <span className="h-3.5 w-3.5 shrink-0" style={{ backgroundColor: habit.color }} />
        <div className="serif min-w-0 flex-1 truncate text-[28px] leading-none text-ink md:text-[38px]">
          {habit.name}
        </div>
      </div>
      <div className="label-caps mt-1.5 text-[10px] tracking-[0.08em] text-ink-faint md:text-[11px]">
        {quit ? 'Quitting · staying clean' : 'Building · daily'}
      </div>

      {/* Headline streak */}
      <div className="mt-3.5 border-[1.5px] border-edge p-4 md:mt-[18px] md:p-6" style={{ backgroundColor: `${habit.color}0f` }}>
        <div className="serif num text-[52px] leading-none md:text-[72px]" style={{ color: habit.color }}>
          {current}
        </div>
        <div className="label-caps mt-1.5 text-[10px] tracking-[0.1em] text-ink-faint md:text-[11px]">
          {quit ? 'Days clean in a row' : 'Day streak'}
        </div>
      </div>

      {/* Secondary stats */}
      <div className="mt-3.5 flex border-[1.5px] border-edge md:mt-[18px]">
        <div className="flex-1 border-r-[1.5px] border-edge p-3 md:p-[18px]">
          <div className="serif num text-[26px] leading-none text-ink md:text-[36px]">{best}</div>
          <div className="label-caps mt-1 text-[9px] tracking-[0.1em] text-ink-faint md:mt-1.5 md:text-[10px]">
            Best · {unit(best)}
          </div>
        </div>
        <div className="flex-1 border-r-[1.5px] border-edge p-3 md:p-[18px]">
          <div className="serif num text-[26px] leading-none text-ink md:text-[36px]">{thisMonth}</div>
          <div className="label-caps mt-1 text-[9px] tracking-[0.1em] text-ink-faint md:mt-1.5 md:text-[10px]">
            This month
          </div>
        </div>
        <div className="flex-1 p-3 md:p-[18px]">
          <div className="serif num text-[26px] leading-none text-ink md:text-[36px]">{total}</div>
          <div className="label-caps mt-1 text-[9px] tracking-[0.1em] text-ink-faint md:mt-1.5 md:text-[10px]">
            All time
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (confirm(`Delete “${habit.name}” and all its marks? This can't be undone.`)) {
            void removeHabit(habit.id);
          }
        }}
        className="label-caps mt-4 text-[10px] tracking-[0.1em] text-danger transition-opacity hover:opacity-70 md:mt-5 md:text-[11px]"
      >
        Delete habit
      </button>
    </aside>
  );
}

// ---- add / edit form ----

function AddHabitForm({
  existing,
  firstEver,
  onCancel,
  onAdd,
}: {
  existing: Habit[];
  firstEver: boolean;
  onCancel: () => void;
  onAdd: (name: string, kind: HabitKind, color: string) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HabitKind>('build');
  // Default to the first palette colour not already used, so new habits differ.
  const used = new Set(existing.map((h) => h.color));
  const [color, setColor] = useState(
    () => PALETTE.find((p) => !used.has(p.value))?.value ?? PALETTE[0].value,
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name, kind, color);
        setName('');
      }}
      className="mt-5 border-[1.5px] border-edge bg-surface p-4 shadow-offset-4 md:p-6"
    >
      {firstEver && (
        <p className="serif mb-3 text-[17px] italic leading-snug text-ink-mid md:text-[19px]">
          Track a habit to build, or an addiction to quit. Each gets its own colour
          on the calendar.
        </p>
      )}

      {/* Type toggle */}
      <div className="label-caps mb-2 text-[10px] tracking-[0.12em] text-ink-faint">I want to</div>
      <div className="flex border-[1.5px] border-edge">
        {(
          [
            { k: 'build' as const, label: 'Build a habit' },
            { k: 'quit' as const, label: 'Quit something' },
          ]
        ).map((opt, i) => {
          const active = kind === opt.k;
          return (
            <button
              key={opt.k}
              type="button"
              onClick={() => setKind(opt.k)}
              aria-pressed={active}
              className={`label-caps flex-1 py-3 text-[11px] tracking-[0.08em] transition-colors ${
                i === 0 ? 'border-r-[1.5px] border-edge' : ''
              } ${active ? 'bg-ink text-surface' : 'text-ink-faint hover:text-ink'}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Name */}
      <div className="label-caps mb-2 mt-4 text-[10px] tracking-[0.12em] text-ink-faint">
        {kind === 'quit' ? 'What are you quitting?' : 'What habit?'}
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={kind === 'quit' ? 'e.g. “Vaping”, “Late-night scrolling”' : 'e.g. “Read 20 min”, “Stretch”'}
        className="h-12 w-full border-[1.5px] border-edge bg-bg px-3 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />

      {/* Colour */}
      <div className="label-caps mb-2 mt-4 text-[10px] tracking-[0.12em] text-ink-faint">Colour</div>
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((p) => {
          const active = color === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setColor(p.value)}
              aria-label={p.name}
              aria-pressed={active}
              className="h-9 w-9 border-[1.5px] transition-transform active:translate-y-px md:h-10 md:w-10"
              style={{
                backgroundColor: p.value,
                borderColor: active ? 'var(--color-edge)' : 'transparent',
                boxShadow: active ? 'inset 0 0 0 2px #f9f8f4' : undefined,
              }}
            />
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={!name.trim()}
          className="label-caps h-12 border-[1.5px] border-edge bg-ink px-6 text-[12px] tracking-[0.08em] text-surface active:translate-y-px disabled:opacity-40"
        >
          Add
        </button>
        {!firstEver && (
          <button
            type="button"
            onClick={onCancel}
            className="label-caps text-[11px] tracking-[0.1em] text-ink-faint hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
