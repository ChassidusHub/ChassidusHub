import { useSyncExternalStore } from 'react';
import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * A handle on the root navigator for the few components mounted *outside*
 * it (the bottom player/download bars and the connectivity banner live
 * beside the NavigationContainer, not inside a screen) - the web's
 * equivalent components are plain `<Link>`s, which work from anywhere.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateTo<Name extends keyof RootStackParamList>(name: Name, params: RootStackParamList[Name]): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(CommonActions.navigate({ name, params }));
}

/** The names of the screens on the stack, bottom first - kept by App.tsx's NavigationContainer (onReady, onStateChange) for the tabs, which live outside it. */
let stackNames: readonly string[] = [];
const stackListeners = new Set<() => void>();

export function publishNavigationState(): void {
  const next = navigationRef.isReady() ? (navigationRef.getRootState()?.routes.map((r) => r.name) ?? []) : [];
  if (next.length === stackNames.length && next.every((name, i) => name === stackNames[i])) return;
  stackNames = next;
  stackListeners.forEach((listener) => listener());
}

function subscribeStack(listener: () => void): () => void {
  stackListeners.add(listener);
  return () => stackListeners.delete(listener);
}

export function useStackNames(): readonly string[] {
  return useSyncExternalStore(subscribeStack, () => stackNames);
}

/** Opens a stack from scratch (a tab's first screen, over This week's). */
export function resetTo(routes: Array<{ name: keyof RootStackParamList }>): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(CommonActions.reset({ index: routes.length - 1, routes }));
}
