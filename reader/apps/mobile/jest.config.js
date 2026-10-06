module.exports = {
  preset: '@react-native/jest-preset',
  // @hebcal/core (a dependency of the workspace @chassidushub-reader/kvius-engine and
  // @chassidushub-reader/catalog packages) ships ESM-only, with no "require" export
  // condition at all - Jest's default CJS runtime can't `require()` it directly.
  // Metro (the app's real bundler) resolves package "exports" natively and isn't
  // affected; this is a Jest-only workaround, standard for ESM-only deps under
  // Jest+Babel: transform it (and our own ESM workspace packages) instead of
  // skipping them as ordinary node_modules, and point the bare specifier
  // straight at its real ESM entry file, bypassing the broken exports lookup.
  // @hebcal/core pulls in further ESM-only transitive deps (@hebcal/noaa,
  // temporal-polyfill, ...) - rather than chase an ever-deepening allowlist,
  // transform everything under node_modules for this project's tests.
  transformIgnorePatterns: [],
  // When Jest runs from the workspace root (e.g. `npm run test -w @chassidushub-reader/mobile`),
  // babel-jest's rootMode defaults to "root" which looks for babel.config.js in the
  // workspace root rather than apps/mobile/.  Setting rootMode:"upward" causes
  // babel-jest to walk up from the file under test and find apps/mobile/babel.config.js,
  // enabling @react-native/babel-preset and its TypeScript transform.
  transform: {
    // `.mjs` too: lucide-react-native ships an ESM-only entry point.
    '^.+\\.m?[jt]sx?$': ['babel-jest', { rootMode: 'upward' }],
  },
  moduleNameMapper: {
    '^@hebcal/core$': '<rootDir>/../../node_modules/@hebcal/core/dist/esm/index.js',
  },
};
