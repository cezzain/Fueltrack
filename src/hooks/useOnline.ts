import { useEffect, useState } from 'react';

/**
 * Advisory connectivity signal. iOS standalone web apps can report
 * navigator.onLine === false while the network is fine, so callers should use
 * this for messaging only — never to hard-gate an API call.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}
