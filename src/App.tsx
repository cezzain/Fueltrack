import { AppProvider, useApp } from './state/AppContext';
import { TabBar } from './components/TabBar';
import { Today } from './screens/Today';
import { Log } from './screens/Log';
import { History } from './screens/History';
import { Insights } from './screens/Insights';
import { Settings } from './screens/Settings';
import { formatDayLabel } from './lib/dates';

function Masthead() {
  const { todayKey } = useApp();
  return (
    <header className="flex items-center justify-between border-b-[1.5px] border-edge pb-3">
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
  return (
    <div className="mx-auto min-h-dvh max-w-md safe-top">
      <main className="px-5 pb-28 pt-5">
        <Masthead />
        <div hidden={tab !== 'today'}>
          <Today />
        </div>
        <div hidden={tab !== 'log'}>
          <Log />
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
