import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Real offline support, not a token "installable" gesture: the app shell is
// precached (works offline from first load), and media fetched through
// services/media-proxy is runtime-cached with CacheFirst + range-request
// support - so once a recording/PDF has been fetched once, seeking within
// it and re-opening it both work fully offline afterward, the same real
// behavior apps/mobile gets from a local file.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Sichos Kodesh',
        short_name: 'Sichos Kodesh',
        description: 'Kvius-matched Sichos Kodesh and Farbrengens, downloaded and played fully offline.',
        theme_color: '#3366cc',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The catalog data + JS/CSS app shell - precached so the app itself works offline immediately.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Bundled catalog data (all years, inlined into the JS chunk) has grown
        // past workbox's 2 MiB default as more PDF links/resourceKeys were
        // recovered from the real dataset - raise the cap rather than drop
        // precaching, since offline-from-first-load is the point.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Matches the deployed services/media-proxy origin - see src/config.ts. Both
            // /jem-audio/:filename and /drive/:fileId land here.
            urlPattern: ({ url }) => url.hostname.endsWith('.workers.dev'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-proxy-cache',
              cacheableResponse: { statuses: [0, 200, 206] },
              rangeRequests: true,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
