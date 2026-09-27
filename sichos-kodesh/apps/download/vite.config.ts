import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// VITE_PACK_API: the pack API's origin (services/pack-api, or `sk-pack serve` locally on :8787).
export default defineConfig({
  plugins: [react()],
  // The site's own version (package.json), shown in the footer.
  define: { __SITE_VERSION__: JSON.stringify(version) },
});
