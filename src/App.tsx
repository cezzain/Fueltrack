import { AppProvider, useApp } from './state/AppContext';
import { TabBar } from './components/TabBar';
import { TopNav } from './components/TopNav';
import { Today } from './screens/Today';
import { Log } from './screens/Log';
import { Train } from './screens/Train';
import { Calendar } from './screens/Calendar';
import { History } from './screens/History';
import { Insights } from './screens/Insights';
import { Settings } from './screens/Settings';
import { formatDayLabel } from './lib/dates';

/** Mobile-only masthead; the desktop TopNav carries the wordmark + date on md+. */
function Masthead() {
  const { todayKey } = useApp();
  return (
    <header className="flex items-center justify-between border-b-[1.5px] border-edge pb-3 md:hidden">
      <span className="label-caps text-[12px] tracking-[0.14em] text-ink">FuelTrack</span>
      <span className="text-[11px] text-ink-faint">{formatDayLabel(todayKey)}</span>
    </header>
  );
}

function Screens() {
  const { ready, tab } = useApp();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="label-caps animate-pulse text-sm text-ink-faint">FuelTrack</div>
      </div>
    );
  }

  // All screens stay mounted (hidden with CSS) so switching tabs never
  // discards in-flight state — a taken photo, a running analysis, or an
  // unsaved review card on the Log screen survives a detour to Settings.
  // Layout is mobile-first: a single 448px column with a bottom TabBar, which
  // widens to the 1200px "PC" layout (top bar nav, multi-column screens) at md.
  return (
    <div className="mx-auto min-h-dvh max-w-md safe-top md:max-w-[1200px]">
      <TopNav />
      <main className="px-5 pb-28 pt-5 md:px-10 md:pb-16 md:pt-8">
        <Masthead />
        <div hidden={tab !== 'today'}>
          <Today />
        </div>
        <div hidden={tab !== 'log'}>
          <Log />
        </div>
        <div hidden={tab !== 'train'}>
          <Train />
        </div>
        <div hidden={tab !== 'calendar'}>
          <Calendar />
        </div>
        <div hidden={tab !== 'history'}>
          <History />
        </div>
        <div hidden={tab !== 'insights'}>
          <Insights />
        </div>
        <div hidden={tab !== 'settings'}>
          <Settings />
        </div>
      </main>
      <TabBar />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Screens />
    </AppProvider>
  );
}
