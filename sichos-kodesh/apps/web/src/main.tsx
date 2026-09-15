import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
// Vite's `?url` import gives just the resolved, hashed URL string (same
// as renderPdf.ts's own import of this file) - it does not pull in
// pdf.js itself, so this stays a cheap import even on a load that never
// opens a PDF.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './polyfills';
import './index.css';
import App from './App';
import { applyTheme } from './settings/useTheme';
import { PDF_RUNTIME_CACHE_NAME } from './download/cacheName';

registerSW({ immediate: true });

// Best-effort, fire-and-forget: makes sure the PDF worker script is
// cached on every online app load, not only once someone opens a PDF -
// see PDF_RUNTIME_CACHE_NAME's own comment for why precaching alone
// isn't reliable enough. Otherwise, opening the app once online and
// going offline before ever reading a PDF would hit "Setting up fake
// worker failed" the first time, since nothing had fetched this file yet.
if ('caches' in window) {
  void caches
    .open(PDF_RUNTIME_CACHE_NAME)
    .then(async (cache) => {
      if (await cache.match(pdfWorkerUrl)) return; // Already have it - cache.add() would always re-fetch regardless, so check first.
      await cache.add(pdfWorkerUrl);
    })
    .catch(() => {});
}

// The browser's own back/forward scroll restoration races with (and
// often wins against) useScrollToTopOnNavigate's explicit scrollTo(0, 0)
// in App.tsx, since this is a single-page app. Disabling it up front
// makes scroll position fully ours to control.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Applied before React mounts, using the same localStorage key `useTheme`
// reads on its own first render, so a manually-chosen Dark/Light theme
// is already in effect for the first paint instead of flipping once a
// consumer mounts.
try {
  const raw = localStorage.getItem('sichos-kodesh:theme');
  if (raw === 'dark' || raw === 'light') applyTheme(raw);
} catch {
  // Best-effort only - falls back to the OS theme via prefers-color-scheme.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
