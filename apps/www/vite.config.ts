import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [reactRouter()],
  // The shared packages are used from source, so nothing needs building first.
  resolve: { alias: { '@chassidushub/client': src('client'), '@chassidushub/model': src('model'), '@chassidushub/hebrew': src('hebrew') } },
  server: { port: 5174 },
});
