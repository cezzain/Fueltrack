import { useState } from 'react';
import type { Meal } from '../types';
import { formatTime } from '../lib/dates';
import { usePhoto } from '../state/AppContext';
import { RepeatIcon } from './icons';

interface MealCardProps {
  meal: Meal;
  /** One-tap re-log. Omit to hide the button. */
  onRepeat?: (meal: Meal) => void;
  onDelete?: (meal: Meal) => void;
  /** Delete a single food item, recomputing the meal's totals. Omit to hide per-item delete. */
  onDeleteItem?: (meal: Meal, itemId: string) => void;
  defaultExpanded?: boolean;
}

/**
 * Editorial meal row: hairline-divided list entry with a time column, serif
 * meal name, uppercase micro-meta, and orange protein figure. Expands to the
 * item breakdown (each item deletable individually); the repeat square keeps
 * re-logging one tap.
 */
export function MealCard({
  meal,
  onRepeat,
  onDelete,
  onDeleteItem,
  defaultExpanded = false,
}: MealCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photo = usePhoto(meal.photoId);
  const isAi = meal.source !== 'manual';

  const meta = [
    meal.mealType,
    isAi ? (meal.edited ? 'AI · edited' : 'AI estimate') : 'manual',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="animate-rise border-b border-hairline">
      <div className="flex items-baseline gap-3 py-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-baseline gap-3 text-left"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <span className="num w-10 shrink-0 text-[11px] text-ink-faint">
            {formatTime(meal.loggedAt)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="serif truncate text-[19px] leading-tight text-ink">{meal.name}</div>
            <div className="label-caps mt-1 text-[10px] font-semibold tracking-[0.08em] text-ink-faint">
              {meta}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="num text-[16px] font-bold text-accent">{meal.protein_g}g</div>
            <div className="num text-[11px] text-ink-faint">{meal.calories} kcal</div>
          </div>
        </button>
        {onRepeat && (
          <button
            type="button"
            aria-label={`Log ${meal.name} again`}
            onClick={() => onRepeat(meal)}
            className="flex h-10 w-10 shrink-0 translate-y-1 items-center justify-center self-center border-[1.5px] border-edge text-accent active:translate-x-0.5 active:translate-y-1.5"
          >
            <RepeatIcon size={15} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="pb-4 pl-13">
          {photo && (
            <img
              src={photo}
              alt=""
              className="mb-3 h-24 w-24 border-[1.5px] border-edge object-cover"
            />
          )}
          {meal.items.length > 0 && (
            <ul>
              {meal.items.map((item) => (
                <li key={item.id} className="flex items-baseline gap-2 py-1 text-[12.5px]">
                  <div className="min-w-0 flex-1 text-ink">
                    {item.name}
                    {item.portion && (
                      <span className="serif ml-1.5 text-[11px] italic text-ink-faint">
                        {item.portion}
                      </span>
                    )}
                  </div>
                  <span className="num shrink-0 font-semibold text-accent">{item.protein_g}g</span>
                  <span className="num w-14 shrink-0 text-right text-ink-faint">
                    {item.calories}
                  </span>
                  {onDeleteItem && (
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => onDeleteItem(meal, item.id)}
                      className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint active:text-danger"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {meal.aiNotes && (
            <p className="serif mt-2 text-[13px] italic leading-relaxed text-ink-dim">
              {meal.aiNotes}
            </p>
          )}
          {onDelete && (
            <div className="mt-3">
              {confirmDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(meal)}
                  className="label-caps h-10 border-[1.5px] border-danger px-4 text-[10px] text-danger active:translate-y-px"
                >
                  Confirm delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="label-caps h-10 border border-hairline px-4 text-[10px] text-ink-faint active:translate-y-px"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
