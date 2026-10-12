import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { build, defineConfig, type Plugin } from 'vite';

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

/**
 * The service worker (app/offline/sw.ts), built to build/client/sw.js once the
 * browser's files are written: it is told every built file to keep (SHELL) and
 * a version made from their hashed names, so each deploy installs a new one.
 */
function serviceWorker(): Plugin {
  return {
    name: 'www-service-worker',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    async writeBundle(options) {
      const out = options.dir!;
      const files = readdirSync(path.join(out, 'assets')).map((file) => `/assets/${file}`).sort();
      const shell = [...files, '/favicon.svg'];
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const built = await build({
        configFile: false,
        logLevel: 'warn',
        define: { SHELL: JSON.stringify(shell), VERSION: JSON.stringify(version) },
        build: {
          write: false,
          minify: true,
          emptyOutDir: false,
          lib: { entry: fileURLToPath(new URL('app/offline/sw.ts', import.meta.url)), formats: ['iife'], name: 'sw', fileName: () => 'sw.js' },
        },
      });
      const output = (Array.isArray(built) ? built[0]! : built) as { output: { code?: string }[] };
      await writeFile(path.join(out, 'sw.js'), output.output[0]!.code!);
    },
  };
}

export default defineConfig({
  plugins: [reactRouter(), serviceWorker()],
  // The shared packages are used from source, so nothing needs building first.
  resolve: { alias: { '@chassidushub/client': src('client'), '@chassidushub/model': src('model'), '@chassidushub/hebrew': src('hebrew') } },
  server: { port: 5174 },
});
