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
  // Layout is mobile-first: a full-bleed 448px column with a bottom TabBar,
  // which on md+ becomes the editorial "sheet" — a bordered paper card with a
  // hard offset shadow floating on the warm background, per the design mockups.
  return (
    <div className="app-shell mx-auto min-h-dvh max-w-md safe-top md:my-8 md:min-h-[calc(100dvh-4rem)] md:max-w-[1180px] md:border-[1.5px] md:border-edge md:bg-surface md:shadow-offset-8 xl:my-10 xl:min-h-0 xl:max-w-[980px]">
      <TopNav />
      <main className="px-5 pb-28 pt-5 md:px-10 md:pb-14 md:pt-9">
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
