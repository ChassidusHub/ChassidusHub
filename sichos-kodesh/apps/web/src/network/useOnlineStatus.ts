import { useEffect, useState } from 'react';

/**
 * Live `navigator.onLine`, kept current via the `online`/`offline` window
 * events - used by the home screen to show its offline note/downloaded-
 * content shortcut without needing a page reload for it to appear or
 * disappear as connectivity actually changes.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

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
