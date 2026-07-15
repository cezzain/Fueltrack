import type { Tab } from '../types';
import { useApp } from '../state/AppContext';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'log', label: 'Log' },
  { id: 'history', label: 'History' },
  { id: 'insights', label: 'Insights' },
  { id: 'settings', label: 'Settings' },
];

/**
 * Editorial bottom nav: text-only uppercase tabs, ink rule on top, active tab
 * inverts to ink-on-paper. Fixed, thumb-reachable, safe-area aware.
 */
export function TabBar() {
  const { tab, setTab } = useApp();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-edge bg-surface safe-bottom md:hidden">
      <div className="mx-auto flex max-w-md">
        {TABS.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`label-caps flex-1 pb-3 pt-3.5 text-[9.5px] tracking-[0.1em] transition-colors ${
                i < TABS.length - 1 ? 'border-r border-hairline' : ''
              } ${active ? 'bg-ink text-surface' : 'text-ink-faint'}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
