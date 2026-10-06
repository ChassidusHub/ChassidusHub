import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (dir: string) => fileURLToPath(new URL(`./${dir}/src/index.ts`, import.meta.url));

// Tests run against each package's source, so nothing has to be built first.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@chassidushub\/db\/pglite$/, replacement: fileURLToPath(new URL('./packages/db/src/pglite.ts', import.meta.url)) },
      ...['hebrew', 'model', 'db', 'core', 'mirror', 'importers', 'pdf-fix', 'client'].map((name) => ({ find: new RegExp(`^@chassidushub/${name}$`), replacement: src(`packages/${name}`) })),
      { find: /^@chassidushub\/api$/, replacement: src('services/api') },
    ],
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'services/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'],
    // The tests' starting catalog, built once a run (packages/core/tests/helpers.ts).
    globalSetup: ['packages/core/tests/globalSetup.ts'],
    // Worker threads start quicker than processes and still give every file its own modules: about a seventh
    // quicker (vitest doctor). Not isolate: false, a third quicker but unsafe: the catalog's own caches then
    // carry one file's items into the next.
    pool: 'threads',
    testTimeout: 30_000,
    // Starting PGlite (Postgres in WebAssembly) takes seconds, more when test files start it side by side.
    hookTimeout: 60_000,
  },
});
