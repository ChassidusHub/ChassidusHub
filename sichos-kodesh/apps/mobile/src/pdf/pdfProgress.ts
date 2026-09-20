import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createPdfProgressKey,
  resolveInitialPdfPage,
  type PdfIdentity,
} from './pdfIdentity';

const STORAGE_KEY = 'sichos-kodesh:mobile-pdf-progress:v1';
const VERSION = 1;

export interface SavedPdfProgress {
  page: number;
  totalPages: number | null;
  updatedAt: number;
}

export interface PdfProgressStore {
  version: number;
  pages: Record<string, SavedPdfProgress>;
}

function fallbackStore(): PdfProgressStore {
  return { version: VERSION, pages: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function asNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function sanitizeSavedPdfProgress(value: unknown): SavedPdfProgress | null {
  if (!isRecord(value)) return null;
  return {
    page: resolveInitialPdfPage(value.page, typeof value.totalPages === 'number' ? value.totalPages : null),
    totalPages:
      typeof value.totalPages === 'number' &&
      Number.isFinite(value.totalPages) &&
      value.totalPages > 0
        ? Math.floor(value.totalPages)
        : null,
    updatedAt: asNonNegativeNumber(value.updatedAt),
  };
}

function sanitizeStore(value: unknown): PdfProgressStore {
  if (!isRecord(value)) return fallbackStore();
  const pages: PdfProgressStore['pages'] = {};
  if (isRecord(value.pages)) {
    for (const [key, progress] of Object.entries(value.pages)) {
      const next = sanitizeSavedPdfProgress(progress);
      if (next) pages[key] = next;
    }
  }
  return { version: VERSION, pages };
}

export async function readPdfProgressStore(): Promise<PdfProgressStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return fallbackStore();
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return fallbackStore();
  }
}

export async function writePdfProgressStore(
  store: PdfProgressStore,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: VERSION, pages: store.pages }),
    );
  } catch {
    // Best-effort persistence only.
  }
}

export function getSavedPdfProgress(
  store: PdfProgressStore,
  identity: PdfIdentity | null,
): SavedPdfProgress | undefined {
  const key = createPdfProgressKey(identity);
  return key ? store.pages[key] : undefined;
}

export async function loadSavedPdfProgress(
  identity: PdfIdentity | null,
): Promise<SavedPdfProgress | undefined> {
  const store = await readPdfProgressStore();
  return getSavedPdfProgress(store, identity);
}

export async function savePdfProgress(
  identity: PdfIdentity | null,
  page: number,
  totalPages?: number | null,
): Promise<void> {
  const key = createPdfProgressKey(identity);
  if (!key) return;
  const store = await readPdfProgressStore();
  store.pages[key] = {
    page: resolveInitialPdfPage(page, totalPages),
    totalPages:
      typeof totalPages === 'number' &&
      Number.isFinite(totalPages) &&
      totalPages > 0
        ? Math.floor(totalPages)
        : null,
    updatedAt: Date.now(),
  };
  await writePdfProgressStore(store);
}
