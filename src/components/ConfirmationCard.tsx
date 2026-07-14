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

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  low: 'text-warn',
  medium: 'text-ink-faint',
  high: 'text-accent',
};

/**
 * Editable post-analysis review card, Editorial Type style. The original
 * analysis is kept as an immutable baseline: the portion slider always
 * multiplies baseline values (so 1× restores originals), while direct edits
 * pin an item's field.
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
    <div className="animate-rise flex flex-col gap-4 border-[1.5px] border-edge bg-surface p-5 shadow-offset-6">
      {/* Header: photo thumbnail + editable serif meal name */}
      <div className="flex items-center gap-3">
        {photoDataUrl && (
          <img
            src={photoDataUrl}
            alt=""
            className="h-14 w-14 shrink-0 border-[1.5px] border-edge object-cover"
          />
        )}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Meal name"
          aria-label="Meal name"
          className="serif min-w-0 flex-1 border-b-[1.5px] border-edge bg-transparent pb-1.5 text-[22px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
      </div>

      {/* Portion slider — scales everything from the original baseline */}
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="portion-slider" className="label-caps text-[12px] font-semibold tracking-[0.08em] text-ink">
            Portion
          </label>
          <span className="num text-[13px] font-bold text-ink">{mult.toFixed(2)}×</span>
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
        <ul>
          {baseline.items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 border-b border-hairline py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 text-[13px] text-ink">
                  <span className="truncate">{it.name}</span>
                  <span
                    className={`label-caps shrink-0 text-[9px] tracking-[0.08em] ${CONFIDENCE_COLOR[it.confidence]}`}
                  >
                    {it.confidence}
                  </span>
                </div>
                {it.portion_estimate && (
                  <div className="serif mt-0.5 truncate text-[11px] italic text-ink-faint">
                    {it.portion_estimate}
                  </div>
                )}
              </div>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={displayFor(i, 'p', it.protein_g)}
                onChange={(e) => setOverride(i, 'p', e.target.value)}
                aria-label={`${it.name} protein grams`}
                className="num w-16 shrink-0 border border-edge bg-bg px-2 py-2 text-right text-sm text-ink outline-none focus:border-accent"
              />
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={displayFor(i, 'c', it.calories)}
                onChange={(e) => setOverride(i, 'c', e.target.value)}
                aria-label={`${it.name} calories`}
                className="num w-16 shrink-0 border border-edge bg-bg px-2 py-2 text-right text-sm text-ink outline-none focus:border-accent"
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Totals — recomputed live from item values */}
      <div className="flex items-baseline justify-between border-t-[1.5px] border-edge pt-3">
        <div className="serif num text-[34px] text-accent">{totalProtein}g</div>
        <div className="serif num text-[34px] text-ink">
          {totalCalories} <span className="text-[16px]">kcal</span>
        </div>
      </div>

      {/* AI assumptions */}
      {baseline.notes && (
        <p className="serif border-l-4 border-accent pl-3 text-[13px] italic leading-relaxed text-ink-dim">
          {baseline.notes}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="label-caps h-[50px] flex-1 border-[1.5px] border-edge bg-ink text-[13px] tracking-[0.06em] text-surface active:translate-y-px disabled:opacity-60"
        >
          {saving ? 'Logging…' : 'Log it'}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="h-[50px] border-[1.5px] border-edge px-4 text-[12px] font-semibold text-ink active:translate-y-px disabled:opacity-60"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
