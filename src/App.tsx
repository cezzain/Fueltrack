import { AppProvider, useApp } from './state/AppContext';
import { TabBar } from './components/TabBar';
import { Today } from './screens/Today';
import { Log } from './screens/Log';
import { History } from './screens/History';
import { Insights } from './screens/Insights';
import { Settings } from './screens/Settings';

function Screens() {
  const { ready, tab } = useApp();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="animate-pulse text-sm font-medium tracking-widest text-ink-faint">
          FUELTRACK
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md safe-top">
      <main className="px-4 pb-28 pt-4">
        {tab === 'today' && <Today />}
        {tab === 'log' && <Log />}
        {tab === 'history' && <History />}
        {tab === 'insights' && <Insights />}
        {tab === 'settings' && <Settings />}
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
