/**
 * The phone's mode: nothing until storage is read, null before the first
 * choice (the chooser shows), and the choice kept across launches.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

function fresh() {
  jest.resetModules();
  return require('./appMode') as typeof import('./appMode');
}

describe('the app mode', () => {
  beforeEach(() => mockStore.clear());

  it('is unknown until read, then null on a phone that never chose', async () => {
    const mode = fresh();
    expect(mode.getAppMode()).toBeUndefined();
    await mode.loadAppMode();
    expect(mode.getAppMode()).toBeNull();
  });

  it('keeps the choice for the next launch, and the background task reads it too', async () => {
    fresh().setAppMode('offline');
    const next = fresh();
    await next.loadAppMode();
    expect(next.getAppMode()).toBe('offline');
    expect(await next.readStoredAppMode()).toBe('offline');
  });

  it('ignores anything stored that is not a mode', async () => {
    mockStore.set('app-mode', 'sometimes');
    const mode = fresh();
    await mode.loadAppMode();
    expect(mode.getAppMode()).toBeNull();
  });
});
