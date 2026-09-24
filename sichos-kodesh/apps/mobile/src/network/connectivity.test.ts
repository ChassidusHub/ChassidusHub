/**
 * The app's online flag follows the phone's own network state, not only
 * failed fetches: a download waiting for its network never fails, so a
 * phone with no connection used to show its queue as downloading forever.
 */

type Listener = (state: unknown) => void;
const nativeListeners: Listener[] = [];

jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'android' },
  NativeEventEmitter: jest.fn(() => ({
    addListener: (_event: string, listener: Listener) => {
      nativeListeners.push(listener);
      return { remove: jest.fn() };
    },
  })),
}));

jest.mock('../config', () => ({ MEDIA_PROXY_BASE_URL: 'https://media.example' }));

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function load(initial: { connected: boolean; validated: boolean; unmetered: boolean }) {
  jest.resetModules();
  nativeListeners.length = 0;
  const rn = jest.requireMock('react-native') as { NativeModules: Record<string, unknown> };
  rn.NativeModules.SichosKodeshNetwork = { getState: jest.fn(() => Promise.resolve(initial)), startWatching: jest.fn() };
  const connectivity = require('./connectivity') as typeof import('./connectivity');
  const network = require('./networkState') as typeof import('./networkState');
  return { connectivity, network, emit: (state: unknown) => nativeListeners.forEach((listener) => listener(state)) };
}

describe('connectivity from the phone\'s network state', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
  });

  it('is offline at once on a phone with no network, and online again when one comes', async () => {
    const { connectivity, network, emit } = load({ connected: false, validated: false, unmetered: false });
    connectivity.followNetworkState();
    await flush();
    expect(connectivity.getOnlineSnapshot()).toBe(false);
    expect(network.getNetworkState().connected).toBe(false);

    emit({ connected: true, validated: true, unmetered: true });
    await flush();
    expect(connectivity.getOnlineSnapshot()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the media proxy when Android has not seen the network reach the internet', async () => {
    fetchMock.mockRejectedValue(new Error('Network request failed'));
    const { connectivity } = load({ connected: true, validated: false, unmetered: false });
    connectivity.followNetworkState();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(connectivity.getOnlineSnapshot()).toBe(false);
  });

  it('says a phone on mobile data is online but not on Wi-Fi, and ignores a repeat of the same state', async () => {
    const { connectivity, network, emit } = load({ connected: true, validated: true, unmetered: false });
    connectivity.followNetworkState();
    await flush();
    expect(connectivity.getOnlineSnapshot()).toBe(true);
    expect(network.getNetworkState().unmetered).toBe(false);

    // A change of signal strength calls back with the same state: nothing to decide again.
    connectivity.reportFetchFailure();
    emit({ connected: true, validated: true, unmetered: false });
    await flush();
    expect(connectivity.getOnlineSnapshot()).toBe(false);
  });
});
