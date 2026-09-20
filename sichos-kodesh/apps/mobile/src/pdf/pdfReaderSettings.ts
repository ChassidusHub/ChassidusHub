import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sichos-kodesh:mobile-pdf-reader-settings:v1';
const VERSION = 1;

export type PdfZoomPreset = 'default' | 'expanded';

export interface PdfReaderSettings {
  invertInDarkMode: boolean;
  zoomPreset: PdfZoomPreset;
}

export interface PdfReaderSettingsStore {
  version: number;
  settings: PdfReaderSettings;
}

export interface PdfZoomConfig {
  minScale: number;
  maxScale: number;
}

export const DEFAULT_PDF_READER_SETTINGS: PdfReaderSettings = {
  invertInDarkMode: true,
  zoomPreset: 'default',
};

function fallbackStore(): PdfReaderSettingsStore {
  return { version: VERSION, settings: DEFAULT_PDF_READER_SETTINGS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function sanitizeZoomPreset(value: unknown): PdfZoomPreset {
  return value === 'expanded' ? 'expanded' : 'default';
}

export function sanitizePdfReaderSettings(value: unknown): PdfReaderSettings {
  if (!isRecord(value)) return DEFAULT_PDF_READER_SETTINGS;
  return {
    invertInDarkMode:
      typeof value.invertInDarkMode === 'boolean'
        ? value.invertInDarkMode
        : DEFAULT_PDF_READER_SETTINGS.invertInDarkMode,
    zoomPreset: sanitizeZoomPreset(value.zoomPreset),
  };
}

function sanitizeStore(value: unknown): PdfReaderSettingsStore {
  if (!isRecord(value)) return fallbackStore();
  return {
    version: VERSION,
    settings: sanitizePdfReaderSettings(value.settings),
  };
}

export function getPdfZoomConfig(preset: PdfZoomPreset): PdfZoomConfig {
  return preset === 'expanded'
    ? { minScale: 0.75, maxScale: 5 }
    : { minScale: 1, maxScale: 3 };
}

export function togglePdfDarkMode(
  settings: PdfReaderSettings,
): PdfReaderSettings {
  return { ...settings, invertInDarkMode: !settings.invertInDarkMode };
}

export function togglePdfZoomPreset(
  settings: PdfReaderSettings,
): PdfReaderSettings {
  return {
    ...settings,
    zoomPreset: settings.zoomPreset === 'default' ? 'expanded' : 'default',
  };
}

export async function readPdfReaderSettingsStore(): Promise<PdfReaderSettingsStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return fallbackStore();
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return fallbackStore();
  }
}

export async function writePdfReaderSettingsStore(
  store: PdfReaderSettingsStore,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version:
          typeof store.version === 'number' && Number.isFinite(store.version)
            ? Math.floor(store.version)
            : VERSION,
        settings: sanitizePdfReaderSettings(store.settings),
      }),
    );
  } catch {
    // Best-effort persistence only.
  }
}

export async function readPdfReaderSettings(): Promise<PdfReaderSettings> {
  const store = await readPdfReaderSettingsStore();
  return store.settings;
}

export async function savePdfReaderSettings(
  settings: PdfReaderSettings,
): Promise<void> {
  await writePdfReaderSettingsStore({
    version: VERSION,
    settings: sanitizePdfReaderSettings(settings),
  });
}
