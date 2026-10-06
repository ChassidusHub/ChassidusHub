// Minimal Jest manual mock: the real module registers a NativeEventEmitter
// against a native module that doesn't exist under Jest's mocked RN
// environment (no real device/simulator), which crashes on import alone.
// Nothing here needs to actually download anything for the app-render
// smoke test - see src/download/download.ts for the real implementation.
module.exports = {
  fs: { dirs: { DocumentDir: '/mock/documents' } },
  config: () => ({
    fetch: () => ({
      progress: () => ({
        then: () => Promise.resolve({ path: () => '/mock/documents/mock-file' }),
      }),
    }),
  }),
  android: {
    actionViewIntent: () => Promise.resolve(true),
  },
};
