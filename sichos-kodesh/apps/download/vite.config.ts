import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_PACK_API: the pack API's origin (services/pack-api, or `sk-pack serve` locally on :8787).
export default defineConfig({
  plugins: [react()],
});
