import { useEffect, useState } from 'react';
import type { Tab } from '../types';
import { useApp } from '../state/AppContext';

/** The five primary tabs shown in the bar; the rest live behind "More". */
const PRIMARY: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'log', label: 'Log' },
  { id: 'train', label: 'Train' },
  { id: 'calendar', label: 'Calendar' },
];

const MORE: { id: Tab; label: string }[] = [
  { id: 'habits', label: 'Habits' },
  { id: 'history', label: 'History' },
  { id: 'insights', label: 'Insights' },
  { id: 'settings', label: 'Settings' },
];

const MORE_IDS = new Set<Tab>(MORE.map((m) => m.id));

/**
 * Editorial bottom nav (phone only): the five most-used tabs plus a "More"
 * button that opens a small sheet for History / Insights / Settings — keeping
 * the bar uncluttered instead of cramming seven labels across the width.
 */
export function TabBar() {
  const { tab, setTab } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet whenever the active tab changes (incl. from the TopNav).
  useEffect(() => {
    setMoreOpen(false);
  }, [tab]);

  const moreActive = MORE_IDS.has(tab);

  const tabButton = (t: { id: Tab; label: string }, withBorder: boolean) => {
    const active = tab === t.id;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => setTab(t.id)}
        aria-current={active ? 'page' : undefined}
        className={`label-caps flex-1 pb-3 pt-3.5 text-[10px] tracking-[0.08em] transition-colors ${
          withBorder ? 'border-r border-hairline' : ''
        } ${active ? 'bg-ink text-surface' : 'text-ink-faint'}`}
      >
        {t.label}
      </button>
    );
  };

  return (
    <div className="md:hidden">
      {/* Backdrop + sheet for the overflow tabs */}
      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-40 bg-ink/20"
        />
      )}
      {moreOpen && (
        <div className="safe-bottom fixed inset-x-0 bottom-[52px] z-50 animate-rise border-t-[1.5px] border-edge bg-surface">
          {MORE.map((m) => {
            const active = tab === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setTab(m.id)}
                aria-current={active ? 'page' : undefined}
                className={`label-caps flex w-full items-center justify-between border-b border-hairline px-5 py-4 text-[12px] tracking-[0.1em] transition-colors ${
                  active ? 'bg-ink text-surface' : 'text-ink'
                }`}
              >
                {m.label}
                <span className={active ? 'text-surface' : 'text-ink-faint'}>↗</span>
              </button>
            );
          })}
        </div>
      )}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t-[1.5px] border-edge bg-surface">
        <div className="mx-auto flex max-w-md">
          {PRIMARY.map((t) => tabButton(t, true))}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-label="More screens"
            className={`label-caps flex-1 pb-3 pt-3.5 text-[10px] tracking-[0.08em] transition-colors ${
              moreActive || moreOpen ? 'bg-ink text-surface' : 'text-ink-faint'
            }`}
          >
            {moreActive ? MORE.find((m) => m.id === tab)?.label : 'More'}
            <span className="ml-0.5">⋯</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
