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
