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
  // Mobile: a full-bleed 448px column with a bottom TabBar. On md+ the app
  // becomes the editorial "sheet" — a bordered paper card with a hard offset
  // shadow that fills the viewport like a slide; each screen lays its content
  // across the full width (main centers a short screen vertically).
  return (
    <div className="app-shell mx-auto min-h-dvh max-w-md safe-top md:my-8 md:flex md:min-h-[calc(100dvh-4rem)] md:max-w-[1600px] md:flex-col md:border-[1.5px] md:border-edge md:bg-surface md:shadow-offset-8">
      <TopNav />
      <main className="px-5 pb-28 pt-5 md:flex-1 md:px-12 md:pb-12 md:pt-10">
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
