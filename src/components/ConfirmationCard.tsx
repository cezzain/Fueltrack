import { useRef, useState } from 'react';
import type { AnalysisItem, AnalysisResult, Confidence } from '../types';

interface ConfirmationCardProps {
  analysis: AnalysisResult;
  photoDataUrl?: string;
  defaultName: string;
  onSave: (result: { name: string; analysis: AnalysisResult; edited: boolean }) => void;
  onDiscard: () => void;
  saving?: boolean;
}

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  low: 'text-warn bg-warn/10',
  medium: 'text-ink-dim bg-surface-2',
  high: 'text-accent-bright bg-accent-dim',
};

/**
 * Editable post-analysis review card. The original analysis is kept as an
 * immutable baseline: the portion slider always multiplies baseline values
 * (so 1× restores originals), while direct edits pin an item's field.
 */
export function ConfirmationCard({
  analysis,
  photoDataUrl,
  defaultName,
  onSave,
  onDiscard,
  saving = false,
}: ConfirmationCardProps) {
  // Baseline never changes for the lifetime of this card.
  const baseline = useRef(analysis).current;
  const [name, setName] = useState(defaultName);
  const [mult, setMult] = useState(1);
  /** Raw input strings for directly-edited fields, keyed "index:p" / "index:c". */
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const scaledValue = (base: number) => Math.round(base * mult);

  const valueFor = (i: number, field: 'p' | 'c', base: number): number => {
    const raw = overrides[`${i}:${field}`];
    if (raw === undefined) return scaledValue(base);
    // An empty or invalid field means "mid-edit", not zero — fall back to the
    // scaled baseline so clearing a field never silently pins the item to 0.
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return scaledValue(base);
    return Math.max(0, Math.round(n));
  };

  const displayFor = (i: number, field: 'p' | 'c', base: number): string => {
    const raw = overrides[`${i}:${field}`];
    return raw !== undefined ? raw : String(scaledValue(base));
  };

  const setOverride = (i: number, field: 'p' | 'c', raw: string) => {
    setOverrides((prev) => ({ ...prev, [`${i}:${field}`]: raw }));
  };

  const totalProtein = baseline.items.reduce((acc, it, i) => acc + valueFor(i, 'p', it.protein_g), 0);
  const totalCalories = baseline.items.reduce((acc, it, i) => acc + valueFor(i, 'c', it.calories), 0);

  // "Edited" means the numbers differ from the AI's estimate — not that the
  // user merely touched a field or renamed the meal. This keeps the
  // "AI estimate" vs "AI · edited" badge truthful.
  const edited = baseline.items.some(
    (it, i) => valueFor(i, 'p', it.protein_g) !== it.protein_g || valueFor(i, 'c', it.calories) !== it.calories,
  );

  const handleSave = () => {
    if (saving) return;
    const items: AnalysisItem[] = baseline.items.map((it, i) => ({
      ...it,
      protein_g: valueFor(i, 'p', it.protein_g),
      calories: valueFor(i, 'c', it.calories),
    }));
    const adjusted: AnalysisResult = {
      items,
      total_protein_g: totalProtein,
      total_calories: totalCalories,
      notes: baseline.notes,
    };
    onSave({ name: name.trim() || defaultName, analysis: adjusted, edited });
  };

  return (
    <div className="animate-rise space-y-4 rounded-2xl border border-edge bg-surface p-4">
      {/* Header: photo thumbnail + editable meal name */}
      <div className="flex items-center gap-3">
        {photoDataUrl && (
          <img
            src={photoDataUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl border border-edge object-cover"
          />
        )}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Meal name"
          aria-label="Meal name"
          className="min-w-0 flex-1 border-b border-edge bg-transparent pb-1.5 text-lg font-semibold text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>

      {/* Portion slider — scales everything from the original baseline */}
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="portion-slider" className="text-sm text-ink-dim">
            Portion size
          </label>
          <span className="num text-sm font-semibold text-ink">{mult.toFixed(2)}×</span>
        </div>
        <input
          id="portion-slider"
          type="range"
          min={0.5}
          max={2}
          step={0.05}
          value={mult}
          onChange={(e) => setMult(parseFloat(e.target.value))}
          className="mt-2 h-6 w-full"
          style={{ accentColor: 'var(--color-accent)' }}
        />
        <div className="flex justify-between text-[10px] text-ink-faint">
          <span className="num">0.5×</span>
          <span className="num">2×</span>
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex justify-end gap-2 pb-1 text-[10px] text-ink-faint">
          <span className="w-16 text-right">protein g</span>
          <span className="w-16 text-right">kcal</span>
        </div>
        <ul className="divide-y divide-edge/60">
          {baseline.items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm text-ink">{it.name}</span>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${CONFIDENCE_STYLES[it.confidence]}`}
                  >
                    {it.confidence}
                  </span>
                </div>
                {it.portion_estimate && (
                  <div className="mt-0.5 truncate text-xs text-ink-faint">{it.portion_estimate}</div>
                )}
              </div>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={displayFor(i, 'p', it.protein_g)}
                onChange={(e) => setOverride(i, 'p', e.target.value)}
                aria-label={`${it.name} protein grams`}
                className="num w-16 shrink-0 rounded-lg bg-surface-2 px-2 py-2 text-right text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={displayFor(i, 'c', it.calories)}
                onChange={(e) => setOverride(i, 'c', e.target.value)}
                aria-label={`${it.name} calories`}
                className="num w-16 shrink-0 rounded-lg bg-surface-2 px-2 py-2 text-right text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Totals — recomputed live from item values */}
      <div className="flex items-end justify-between border-t border-edge pt-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Protein</div>
          <div className="num text-2xl font-bold text-accent-bright">
            {totalProtein}
            <span className="text-sm font-semibold">g</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">Calories</div>
          <div className="num text-2xl font-bold text-ink">
            {totalCalories}
            <span className="text-sm font-semibold text-ink-dim"> kcal</span>
          </div>
        </div>
      </div>

      {/* AI assumptions */}
      {baseline.notes && (
        <div className="rounded-lg bg-surface-2 p-2 text-xs leading-relaxed text-ink-dim">
          <span className="font-semibold">AI assumptions: </span>
          {baseline.notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-bg active:scale-[0.98] disabled:opacity-60"
        >
          {saving && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          )}
          {saving ? 'Logging…' : 'Log it'}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="h-12 rounded-xl px-4 text-sm font-medium text-ink-dim active:scale-[0.98] disabled:opacity-60"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
