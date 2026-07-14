import type { Tab } from '../types';
import { useApp } from '../state/AppContext';

const TABS: { id: Tab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  { id: 'today', label: 'Today', icon: (a) => <RingIcon active={a} /> },
  { id: 'log', label: 'Log', icon: (a) => <CameraIcon active={a} /> },
  { id: 'history', label: 'History', icon: (a) => <HistoryIcon active={a} /> },
  { id: 'insights', label: 'Insights', icon: (a) => <SparkIcon active={a} /> },
  { id: 'settings', label: 'Settings', icon: (a) => <GearIcon active={a} /> },
];

/** Fixed bottom tab bar, thumb-reachable, safe-area aware. */
export function TabBar() {
  const { tab, setTab } = useApp();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-bg/90 backdrop-blur-md safe-bottom">
      <div className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[10px] font-medium transition-colors ${
                active ? 'text-accent-bright' : 'text-ink-faint'
              }`}
            >
              {t.icon(active)}
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const stroke = (active: boolean) => (active ? 'currentColor' : 'currentColor');

function RingIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke={stroke(active)} strokeWidth="2" opacity={active ? 0.35 : 0.5} />
      <path d="M12 3.5 a 8.5 8.5 0 0 1 8.5 8.5" stroke={stroke(active)} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="3" stroke={stroke(active)} strokeWidth="2" />
      <path d="M8.5 7l1.2-2.4A1 1 0 0110.6 4h2.8a1 1 0 01.9.6L15.5 7" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="13" r="3.5" stroke={stroke(active)} strokeWidth="2" />
    </svg>
  );
}

function HistoryIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V10M9.5 19V5M15 19v-8M20.5 19V8" stroke={stroke(active)} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SparkIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7L12 3z"
        stroke={stroke(active)}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" fill={stroke(active)} />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke={stroke(active)} strokeWidth="2" />
      <path
        d="M12 2.8l1 2.4a7 7 0 012.1.9l2.5-.8 1.8 3.1-1.9 1.8a7 7 0 010 2.4l1.9 1.8-1.8 3.1-2.5-.8a7 7 0 01-2.1.9l-1 2.4h-3.6"
        stroke={stroke(active)}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="rotate(0 12 12)"
      />
      <path
        d="M8.9 5.2a7 7 0 00-2.1.9l-2.5-.8-1.8 3.1"
        stroke="none"
      />
    </svg>
  );
}
