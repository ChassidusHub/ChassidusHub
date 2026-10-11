import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { drafts, type Draft, type DraftOp } from './draft.js';
import { useAccount } from './useAccount.js';

const EMPTY = new Map<string, Draft>();

/** A page's draft and the ways to change it, shared by every block on the page and the tray. */
export function useDraft(place: string) {
  const subscribe = useCallback((listener: () => void) => drafts.subscribe(place, listener), [place]);
  const draft = useSyncExternalStore(
    subscribe,
    () => drafts.get(place),
    () => {
      const kept = EMPTY.get(place) ?? drafts.empty(place);
      EMPTY.set(place, kept);
      return kept;
    },
  );
  // A draft started on another device is picked up here. Only an account has one: a signed-out
  // reader's page asks for nothing it would be refused (smoke counts a 401 as a broken page, #93).
  const account = useAccount();
  const signedIn = Boolean(account);
  useEffect(() => {
    if (signedIn) void drafts.pull(place);
  }, [place, signedIn]);
  return useMemo(
    () => ({
      draft,
      put: (op: DraftOp) => drafts.put(place, op),
      remove: (key: string) => drafts.remove(place, key),
      undo: () => drafts.undo(place),
      clear: () => drafts.clear(place),
      send: (input?: { title?: string; note?: string }) => drafts.send(place, input),
    }),
    [draft, place],
  );
}
