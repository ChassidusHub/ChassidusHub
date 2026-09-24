import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { MEDIA_CACHE_NAME, PDF_RUNTIME_CACHE_NAME } from './src/download/cacheName.js';

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
  build: {
    rollupOptions: {
      output: {
        // The bundled library and works (the phone's generated JSON, read
        // by src/catalog/bundledParts.ts) get a folder of their own, so the
        // service worker can leave them out of the precache.
        chunkFileNames: (chunk) => (chunk.facadeModuleId && /\/catalog\/data\/(library|works)\//.test(chunk.facadeModuleId) ? 'assets/catalog-parts/[name]-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  plugins: [
    react(),
    copyPdfAssets(),
    // A device whose WebView predates broad support for syntax this app
    // uses everywhere (optional chaining, nullish coalescing - both
    // several years old now, but still missing on some never-updated
    // budget Android boxes) fails to even parse the main JS bundle, so
    // nothing renders at all - a blank page with no visible error, since
    // the browser can't run any code to report one. `@vitejs/plugin-legacy`
    // builds a second, Babel-downleveled bundle with core-js polyfills and
    // emits it as a `<script nomodule>` fallback, which only a browser that
    // can't run the modern bundle ever loads. The generous `targets` list
    // covers the class of device this actually matters for; Service Worker
    // support (and therefore offline caching) still needs a modern-enough
    // browser regardless - the fallback bundle is about getting the app to
    // render and work online, not about extending offline support that far
    // back too.
    legacy({ targets: ['defaults', 'not IE 11', 'Android >= 4.4', 'Chrome >= 49', 'Safari >= 10'] }),
    VitePWA({
      // 'prompt', not 'autoUpdate' - a newly-found service worker installs
      // and waits instead of silently taking over and reloading the page
      // on its own, so AboutScreen's own "Update app" section (checking
      // for one, and choosing when to actually restart into it - see
      // src/pwa/appUpdate.ts) has something real to control. `autoUpdate`
      // would reload the tab out from under whatever the user's doing the
      // moment a new version is found, with no visible signal beforehand.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Sichos Kodesh',
        short_name: 'Sichos Kodesh',
        description: 'Kvius-matched Sichos Kodesh and Farbrengens, downloaded and played fully offline.',
        theme_color: '#1a8a4a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // A real maskable variant, not the 'any' icon reused - the mark is
          // scaled down to sit inside the safe zone Android's adaptive-icon
          // mask actually crops to, so a circular or squircle mask doesn't
          // clip the "K".
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The catalog data + JS/CSS app shell - precached so the app itself works offline immediately.
        // `mjs` specifically covers pdf.worker.min-*.mjs (see src/pdf/renderPdf.ts) -
        // without it, pdf.js's worker script isn't precached, so opening a PDF
        // while offline (or on a flaky connection) fails even though the PDF's
        // own bytes are already cached.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,wasm,bcmap,pfb,ttf,woff2}'],
        // Bundled catalog data (all years, inlined into the JS chunk) has grown
        // past workbox's 2 MiB default as more PDF links/resourceKeys were
        // recovered from the real dataset - raise the cap rather than drop
        // precaching, since offline-from-first-load is the point.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // The library and the works (src/catalog/bundledParts.ts, several MB)
        // and the reader's fonts are fetched only by the screens that need
        // them; precaching them would make every first visit download them.
        // They are cached as they are used (runtimeCaching below).
        globIgnores: ['**/assets/catalog-parts/**', '**/fonts/reader/**'],
        runtimeCaching: [
          {
            // Matches the deployed services/media-proxy origin - see src/config.ts. Both
            // /jem-audio/:filename and /drive/:fileId land here.
            urlPattern: ({ url }) => url.hostname.endsWith('.workers.dev'),
            handler: 'CacheFirst',
            options: {
              // Renamed whenever this route's cache gets poisoned, to force
              // every existing client to abandon its old cache and start
              // fresh - CacheFirst checks the cache before ever making a
              // new request, so a browser that had already cached a
              // poisoned entry before a fix shipped would otherwise keep
              // serving that exact stale entry forever afterward; the fix
              // alone only stops new entries from being poisoned. Bump
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
              // response to slice from:
              //
              // - 206: an <audio> element's first request for a fresh URL
              //   typically carries its own `Range:` header, so caching a
              //   206 response would cache just that byte slice as if it
              //   were the whole file. Every later request - for a
              //   completely different byte range - would then hit
              //   workbox-range-requests' `createPartialResponse`, which
              //   special-cases an already-206 cached response by returning
              //   it verbatim regardless of what range was actually asked
              //   for, so the same first sliver of the file would keep
              //   coming back forever.
              //
              // - 0 (opaque): a cross-origin request made in "no-cors" mode
              //   (the browser default for an <audio>/<img> element with no
              //   `crossorigin` attribute - see PlayerProvider.tsx, which
              //   sets one) gets back an opaque response: unreadable body,
              //   unreadable headers, `status` reported as 0. Caching that
              //   opaque response as "the" response for its URL would mean
              //   every later request - including this element's own real
              //   range-sliced reads - gets that same permanently-empty,
              //   unreadable entry back, breaking playback once the service
              //   worker starts controlling the page (a reload, not the
              //   very first uncontrolled visit).
              //
              // Dropping both here means a request against nothing valid
              // cached yet is served live from the Worker every time
              // (correct, if not offline-cacheable) instead of ever
              // poisoning the cache with a partial or unreadable response
              // mistaken for a complete, usable one.
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
              // A deliberate download (see apps/web/src/download/) can
              // legitimately want a whole month or year's worth of
              // audio/PDFs in here at once - this plugin prunes the
              // *whole* named cache by LRU on its next normal write
              // regardless of who added an entry, so a low cap would
              // silently evict content the user explicitly asked to keep
              // offline. 5000 is far above any realistic real download (a
              // full kvius year's own occasions), so this is a safety
              // ceiling, not the real storage management surface - that's
              // the Downloads settings screen's own usage readout and
              // "clear downloads" action.
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // pdf.js's own runtime dependencies - the worker script and its
            // wasm/cmaps/standard-fonts asset directories (see
            // copyPdfAssets above) - are already precached (the globPatterns
            // list above), but precaching is all-or-nothing at SW install:
            // one failed fetch out of ~200 files fails the *entire* install,
            // silently leaving a visitor on the old SW with none of that
            // version's fixes. See PDF_RUNTIME_CACHE_NAME's own comment -
            // this is a second, independent path to the same files that
            // doesn't depend on the whole manifest installing atomically.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && (url.pathname.includes('pdf.worker') || /\/pdf-(wasm|cmaps|standard-fonts)\//.test(url.pathname)),
            handler: 'CacheFirst',
            options: {
              cacheName: PDF_RUNTIME_CACHE_NAME,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // The library's and the works' parts (hashed, so never stale)
            // and the reader's fonts: kept once fetched, so the library and
            // a sefer already opened keep working offline.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && (url.pathname.includes('/assets/catalog-parts/') || url.pathname.startsWith('/fonts/reader/')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'catalog-parts-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 200 },
            },
          },
          {
            // The seforim's chapters, read live from Sefaria's API: the
            // newest text when online, and the last one read when not - so
            // a chapter once opened opens again offline.
            urlPattern: ({ url }) => url.hostname === 'www.sefaria.org' && url.pathname.startsWith('/api/v3/texts/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sefaria-texts-v1',
              networkTimeoutSeconds: 6,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // The texts the catalog API hosts (the Igros' letters), each at
            // its sha256: the address never serves anything else, so a
            // letter once read is kept and opens again offline.
            urlPattern: ({ url }) => url.hostname === 'api.sk.shmuky.dev' && url.pathname.startsWith('/v3/texts/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hosted-texts-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
