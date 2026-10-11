import { useSyncExternalStore } from 'react';

/** Whether a media query matches now; false on the server, where there is no screen. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (changed) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', changed);
      return () => list.removeEventListener('change', changed);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** A phone-sized screen: menus open as sheets from the bottom there (the prototype's 700 px). */
export const usePhone = () => useMedia('(max-width: 699px)');
