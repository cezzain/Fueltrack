import type { Tab } from '../types';
import { useApp } from '../state/AppContext';
import { formatDayLabel } from '../lib/dates';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'log', label: 'Log' },
  { id: 'train', label: 'Train' },
  { id: 'history', label: 'History' },
  { id: 'insights', label: 'Insights' },
  { id: 'settings', label: 'Settings' },
];

/**
 * Desktop / iPad top bar (Editorial Type "PC" layout): wordmark, inline
 * uppercase tabs with the active one inverted to ink, and today's date pushed
 * to the right. Hidden below md, where the bottom TabBar takes over.
 */
export function TopNav() {
  const { tab, setTab, todayKey } = useApp();
  return (
    <nav className="hidden items-center border-b-[1.5px] border-edge bg-surface md:flex">
      <div className="label-caps border-r-[1.5px] border-edge px-6 py-[18px] text-[14px] tracking-[0.14em] text-ink">
        FuelTrack
      </div>
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={active ? 'page' : undefined}
            className={`label-caps border-r border-hairline px-[22px] py-[18px] text-[11.5px] tracking-[0.1em] transition-colors ${
              active ? 'bg-ink text-surface' : 'text-ink-faint hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        );
      })}
      <span className="ml-auto px-6 text-[11.5px] text-ink-faint">{formatDayLabel(todayKey)}</span>
    </nav>
  );
}
