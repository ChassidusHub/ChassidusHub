import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { MEDIA_CACHE_NAME } from './src/download/cacheName.js';

// Resolved via Node's own module resolution, not a hardcoded relative path -
// this is an npm workspace, so pdfjs-dist is hoisted to the monorepo root's
// node_modules, not necessarily apps/web's own.
const pdfjsDistRoot = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

/**
 * pdfjs-dist fetches several asset directories at runtime by hardcoded
 * filename appended to a base URL it's given (see `src/pdf/renderPdf.ts`)
 * rather than importing them as normal JS modules, so they need to exist
 * at a stable, unhashed URL the same way `pdf.worker.min.mjs` does (via
 * `?url`): its wasm-backed image codecs (JBig2, JPEG2000) and color
 * management (qcms); `cmaps/`, for PDFs referencing a non-embedded CJK
 * font; and `standard_fonts/`, for the 14 standard PDF fonts when not
 * embedded. Without the wasm ones specifically, PDFs with JBig2/JPEG2000
 * -encoded scanned images (real, common in this dataset's hagahos scans)
 * render with those images silently missing rather than failing loudly.
 *
 * `wasm/quickjs-eval.wasm` (a JS interpreter for executing embedded PDF
 * JavaScript) is deliberately excluded, not just unused bytes: this app
 * only ever calls the low-level `getDocument()`/`page.render()` API, never
 * pdf.js's separate opt-in scripting manager, so embedded PDF JS never
 * executes either way - but not shipping the interpreter at all is one
 * less thing to reason about given this viewer already has to trust
 * arbitrary PDFs from Drive links (see renderPdf.ts's CVE comment).
 */
function copyPdfAssets(): Plugin {
  const dirs = [
    { from: 'wasm', to: 'pdf-wasm', only: ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm'] },
    { from: 'cmaps', to: 'pdf-cmaps' },
    { from: 'standard_fonts', to: 'pdf-standard-fonts' },
  ];
  const copy = () => {
    for (const { from, to, only } of dirs) {
      const src = path.join(pdfjsDistRoot, from);
      const dest = path.resolve(import.meta.dirname, 'public', to);
      if (!existsSync(src)) continue;
      mkdirSync(dest, { recursive: true });
      if (only) {
        for (const file of only) cpSync(path.join(src, file), path.join(dest, file));
      } else {
        cpSync(src, dest, { recursive: true });
      }
    }
  };
  return { name: 'copy-pdf-assets', buildStart: copy, configureServer: copy };
}

// Real offline support, not a token "installable" gesture: the app shell is
// precached (works offline from first load), and media fetched through
// services/media-proxy is runtime-cached with CacheFirst + range-request
// support - so once a recording/PDF has been fetched once, seeking within
// it and re-opening it both work fully offline afterward, the same real
// behavior apps/mobile gets from a local file.
export default defineConfig({
  plugins: [
    react(),
    copyPdfAssets(),
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
        // `mjs` specifically covers pdf.worker.min-*.mjs (see src/pdf/renderPdf.ts) -
        // without it, pdf.js's own worker script was never precached, so opening any
        // PDF while offline (or just on a flaky connection) failed outright with
        // "Setting up fake worker failed: Failed to fetch dynamically imported module"
        // even though the PDF's own bytes were already cached and available.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,wasm,bcmap,pfb,ttf}'],
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
              // Renamed on every fix to a poisoning bug in this route (was
              // 'media-proxy-cache', then 'media-proxy-cache-v2') to force
              // every existing client to abandon its old cache and start
              // fresh - CacheFirst checks the cache before ever making a
              // new request, so a browser that had already cached a
              // poisoned entry *before* a fix shipped would otherwise keep
              // serving that exact stale entry forever afterward; the fix
              // alone only stops *new* entries from being poisoned. Bump
              // this name again if the cache is ever poisoned by some other
              // bug in the future, for the same reason. Shared with the
              // download feature (src/download/cacheName.ts) - a
              // deliberate download and an opportunistic play/read both
              // land in this one bucket, so playback always checks the
              // same place a download filled.
              cacheName: MEDIA_CACHE_NAME,
              // Neither 206 (Partial Content) nor 0 (opaque) may be in this
              // list, even though workbox-range-requests' own
              // `rangeRequests: true` needs a *complete, readable* cached
              // response to slice from - both are real, reproduced bugs,
              // not theoretical ones:
              //
              // - 206: an <audio> element's very first request for a fresh
              //   URL commonly carries its own `Range:` header (it doesn't
              //   wait for a full download before starting playback); with
              //   206 allowed here, whatever small slice the Worker
              //   returned for *that* request got cached as if it were the
              //   entire file. Every later request - for a completely
              //   different byte range - then hit workbox-range-requests'
              //   `createPartialResponse`, which special-cases an
              //   already-206 cached response by returning it verbatim (see
              //   its own comment: "If we already have a 206, then just
              //   pass it through as-is"), regardless of what range was
              //   actually asked for - so the same first sliver of the file
              //   kept coming back forever. That matched exactly what got
              //   reported: a track's duration (readable from that first
              //   sliver alone) would show, but the audio itself never
              //   actually loaded.
              //
              // - 0 (opaque): a cross-origin request made in "no-cors" mode
              //   (the browser default for an <audio>/<img> element with no
              //   `crossorigin` attribute - see PlayerProvider.tsx, which
              //   now sets one) gets back an opaque response: unreadable
              //   body, unreadable headers, `status` reported as 0. Allowing
              //   0 here let that opaque response get cached as "the"
              //   response for its URL; every later request - including
              //   this element's own real range-sliced reads - then got
              //   that same permanently-empty, unreadable entry back,
              //   confirmed directly by inspecting Cache Storage after a
              //   no-cors request (bodyByteLength: 0, response.type:
              //   'opaque'), reproducing exactly what got reported: a
              //   recording that worked on a fresh, uncontrolled first
              //   visit but silently failed to load once the service worker
              //   started controlling the page (i.e. "after reload").
              //
              // Dropping both here means a request against nothing valid
              // cached yet is served live from the Worker every time
              // (correct, if not offline-cacheable) instead of ever
              // poisoning the cache with a partial or unreadable response
              // mistaken for a complete, usable one.
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
              // Raised from 500 now that a deliberate download (see
              // apps/web/src/download/) can legitimately want a whole
              // month or year's worth of audio/PDFs in here at once -
              // this plugin prunes the *whole* named cache by LRU on its
              // next normal write regardless of who added an entry, so a
              // low cap would silently evict content the user explicitly
              // asked to keep offline. 5000 is far above any realistic
              // real download (a full kvius year's own occasions), so
              // this is a safety ceiling, not the real storage
              // management surface - that's the Downloads settings
              // screen's own usage readout and "clear downloads" action.
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
