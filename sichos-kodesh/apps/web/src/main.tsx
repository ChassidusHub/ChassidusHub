import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
// Vite's `?url` import gives just the resolved, hashed URL string, the same
// as renderPdf.ts's own import of this file - it does not pull in pdf.js
// itself, so this stays a cheap, always-safe import even on a load that
// never opens a PDF.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './polyfills';
import './index.css';
import App from './App';
import { applyTheme } from './settings/useTheme';
import { PDF_RUNTIME_CACHE_NAME } from './download/cacheName';

registerSW({ immediate: true });

// Best-effort, fire-and-forget: makes sure the PDF worker script is
// actually sitting in Cache Storage on every online app load, not only once
// someone happens to open a PDF - see PDF_RUNTIME_CACHE_NAME's own comment
// for why precaching alone isn't a reliable enough guarantee of this. A
// user who opens the app once online and then goes offline before ever
// reading a PDF would otherwise still hit "Setting up fake worker failed"
// the first time they try to, purely because nothing had fetched this file
// yet - a real reported case, not a hypothetical one.
if ('caches' in window) {
  void caches
    .open(PDF_RUNTIME_CACHE_NAME)
    .then(async (cache) => {
      if (await cache.match(pdfWorkerUrl)) return; // Already have it - cache.add() would always re-fetch regardless, so check first.
      await cache.add(pdfWorkerUrl);
    })
    .catch(() => {});
}

// The browser's own back/forward scroll restoration races with (and often
// wins against) useScrollToTopOnNavigate's explicit scrollTo(0, 0) in
// App.tsx, since it's this app's own single root page. Disabling it up
// front makes scroll position fully ours to control - the back button
// should always land at the top of the previous screen, not wherever it
// happened to be scrolled to before navigating away from it.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Applied here, before React ever mounts, using the same localStorage key
// `useTheme` reads on its own first render - a manually-chosen Dark/Light
// theme should already be in effect for the very first paint, not flip a
// moment later once SettingsScreen (or any other consumer) happens to
// mount.
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
