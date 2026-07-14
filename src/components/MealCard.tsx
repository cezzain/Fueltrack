import { useState } from 'react';
import type { Meal } from '../types';
import { formatTime } from '../lib/dates';
import { usePhoto } from '../state/AppContext';

interface MealCardProps {
  meal: Meal;
  /** One-tap re-log. Omit to hide the button. */
  onRepeat?: (meal: Meal) => void;
  onDelete?: (meal: Meal) => void;
  defaultExpanded?: boolean;
}

/** A logged meal: name, time, macros, AI badge, expandable item breakdown. */
export function MealCard({ meal, onRepeat, onDelete, defaultExpanded = false }: MealCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photo = usePhoto(meal.photoId);
  const isAi = meal.source !== 'manual';

  return (
    <div className="animate-rise rounded-2xl border border-edge bg-surface">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-3 text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl border border-edge object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg">
            🍽
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-ink">{meal.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-dim">
            <span className="num">{formatTime(meal.loggedAt)}</span>
            {isAi && !meal.edited && (
              <span className="rounded-md bg-accent-dim px-1.5 py-0.5 text-[10px] font-medium text-accent-bright">
                AI estimate
              </span>
            )}
            {isAi && meal.edited && (
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-dim">
                AI · edited
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[15px] font-semibold text-accent-bright">{meal.protein_g}g</div>
          <div className="num text-xs text-ink-dim">{meal.calories} kcal</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-edge px-3 pb-3">
          {meal.items.length > 0 && (
            <ul className="divide-y divide-edge/60">
              {meal.items.map((item) => (
                <li key={item.id} className="flex items-baseline gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="text-ink">{item.name}</span>
                    {item.portion && <span className="ml-1.5 text-xs text-ink-faint">{item.portion}</span>}
                  </div>
                  <span className="num shrink-0 text-ink-dim">{item.protein_g}g</span>
                  <span className="num w-16 shrink-0 text-right text-ink-faint">{item.calories} kcal</span>
                </li>
              ))}
            </ul>
          )}
          {meal.aiNotes && (
            <p className="mt-1 rounded-lg bg-surface-2 p-2 text-xs leading-relaxed text-ink-dim">
              {meal.aiNotes}
            </p>
          )}
          {(onRepeat || onDelete) && (
            <div className="mt-2 flex items-center gap-2">
              {onRepeat && (
                <button
                  type="button"
                  onClick={() => onRepeat(meal)}
                  className="flex-1 rounded-xl bg-accent-dim px-3 py-2 text-sm font-medium text-accent-bright active:scale-[0.98]"
                >
                  ↺ Log again
                </button>
              )}
              {onDelete &&
                (confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(meal)}
                    className="rounded-xl bg-danger/20 px-3 py-2 text-sm font-medium text-danger active:scale-[0.98]"
                  >
                    Confirm delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-dim active:scale-[0.98]"
                  >
                    Delete
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
