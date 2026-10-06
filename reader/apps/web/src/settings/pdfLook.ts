import { useSyncExternalStore } from 'react';
import { PDF_LOOK_STORAGE_KEY, parsePdfLook } from '@chassidushub-reader/app-core';
import type { PdfLook } from '@chassidushub-reader/app-core';

/**
 * How the PDF reader shows its pages (app-core's PdfLook): the paper's
 * tint, a stronger contrast, a page at a time, keeping the screen on.
 * One value for the whole app, kept in step between the reader and its
 * settings sheet; the same key as the phone.
 */
let look: PdfLook | null = null;
const listeners = new Set<() => void>();

function read(): PdfLook {
  if (!look) {
    try {
      look = parsePdfLook(localStorage.getItem(PDF_LOOK_STORAGE_KEY));
    } catch {
      look = parsePdfLook(null);
    }
  }
  return look;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPdfLook(change: Partial<PdfLook>): void {
  look = { ...read(), ...change };
  try {
    localStorage.setItem(PDF_LOOK_STORAGE_KEY, JSON.stringify(look));
  } catch {
    // Best-effort persistence only.
  }
  for (const listener of listeners) listener();
}

export function usePdfLook(): PdfLook {
  return useSyncExternalStore(subscribe, read, read);
}
