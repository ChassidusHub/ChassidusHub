export {};

const mockGetItem = jest.fn<Promise<string | null>, [string]>(() =>
  Promise.resolve(null),
);
const mockSetItem = jest.fn<Promise<void>, [string, string]>(() =>
  Promise.resolve(),
);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockGetItem,
  setItem: mockSetItem,
}));

const readerSettings = require('./pdfReaderSettings') as typeof import('./pdfReaderSettings');

describe('pdfReaderSettings', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue();
  });

  it('falls back to defaults when storage JSON is corrupt', async () => {
    mockGetItem.mockResolvedValue('{broken-json');

    await expect(readerSettings.readPdfReaderSettingsStore()).resolves.toEqual({
      version: 1,
      settings: {
        invertInDarkMode: true,
        zoomPreset: 'default',
      },
    });
  });

  it('sanitizes malformed settings payloads', async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        version: 999,
        settings: {
          invertInDarkMode: 'yes',
          zoomPreset: 'wild',
        },
      }),
    );

    await expect(readerSettings.readPdfReaderSettings()).resolves.toEqual({
      invertInDarkMode: true,
      zoomPreset: 'default',
    });
  });

  it('persists normalized reader settings', async () => {
    await readerSettings.savePdfReaderSettings({
      invertInDarkMode: false,
      zoomPreset: 'expanded',
    });

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSetItem.mock.calls[0]![1]);
    expect(payload.version).toBe(1);
    expect(payload.settings).toEqual({
      invertInDarkMode: false,
      zoomPreset: 'expanded',
    });
  });

  it('toggles dark mode and zoom preset safely', () => {
    const toggledDark = readerSettings.togglePdfDarkMode({
      invertInDarkMode: true,
      zoomPreset: 'default',
    });
    expect(toggledDark).toEqual({
      invertInDarkMode: false,
      zoomPreset: 'default',
    });

    const toggledZoom = readerSettings.togglePdfZoomPreset(toggledDark);
    expect(toggledZoom).toEqual({
      invertInDarkMode: false,
      zoomPreset: 'expanded',
    });
  });

  it('returns expected zoom limits for each preset', () => {
    expect(readerSettings.getPdfZoomConfig('default')).toEqual({
      minScale: 1,
      maxScale: 3,
    });
    expect(readerSettings.getPdfZoomConfig('expanded')).toEqual({
      minScale: 0.75,
      maxScale: 5,
    });
  });
});
