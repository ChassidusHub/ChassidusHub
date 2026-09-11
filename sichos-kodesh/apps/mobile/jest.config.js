module.exports = {
  preset: '@react-native/jest-preset',
  // @hebcal/core (a dependency of the workspace @sichos-kodesh/kvius-engine and
  // @sichos-kodesh/catalog packages) ships ESM-only, with no "require" export
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
  moduleNameMapper: {
    '^@hebcal/core$': '<rootDir>/../../node_modules/@hebcal/core/dist/esm/index.js',
  },
};
