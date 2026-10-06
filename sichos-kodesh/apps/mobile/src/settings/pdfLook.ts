import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PDF_LOOK, PDF_LOOK_STORAGE_KEY, parsePdfLook } from '@sichos-kodesh/app-core';
import type { PdfLook } from '@sichos-kodesh/app-core';

/**
 * How the PDF reader shows its pages (app-core's PdfLook): the paper's
 * tint, a stronger contrast, a page at a time, keeping the screen on.
 * One value for the whole app, read once and kept in step between the
 * reader and its settings sheet; the same key as the web app.
 */
let look: PdfLook = DEFAULT_PDF_LOOK;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPdfLook(change: Partial<PdfLook>): void {
  look = { ...look, ...change };
  emit();
  AsyncStorage.setItem(PDF_LOOK_STORAGE_KEY, JSON.stringify(look)).catch(() => undefined);
}

export function usePdfLook(): PdfLook {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    AsyncStorage.getItem(PDF_LOOK_STORAGE_KEY)
      .then((raw) => {
        look = parsePdfLook(raw);
        emit();
      })
      .catch(() => undefined);
  }, []);
  return useSyncExternalStore(subscribe, () => look);
}
