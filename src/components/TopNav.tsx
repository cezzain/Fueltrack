import type { Tab } from '../types';
import { useApp } from '../state/AppContext';
import { formatDayLabel } from '../lib/dates';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'log', label: 'Log' },
  { id: 'train', label: 'Train' },
  { id: 'calendar', label: 'Calendar' },
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
  // Seven tabs don't fit across an iPad in portrait, so padding tightens on
  // the md range and the date only appears at lg+; overflow-x-auto is a final
  // guard so a too-narrow width scrolls the nav instead of the whole page.
  return (
    <nav className="hidden items-center overflow-x-auto border-b-[1.5px] border-edge bg-surface md:flex">
      <div className="label-caps shrink-0 border-r-[1.5px] border-edge px-4 py-[18px] text-[14px] tracking-[0.14em] text-ink lg:px-6">
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
            className={`label-caps shrink-0 whitespace-nowrap border-r border-hairline px-3.5 py-[18px] text-[11px] tracking-[0.08em] transition-colors lg:px-[22px] lg:text-[11.5px] lg:tracking-[0.1em] ${
              active ? 'bg-ink text-surface' : 'text-ink-faint hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        );
      })}
      <span className="ml-auto hidden shrink-0 px-6 text-[11.5px] text-ink-faint lg:inline">
        {formatDayLabel(todayKey)}
      </span>
    </nav>
  );
}
