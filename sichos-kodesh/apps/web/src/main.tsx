import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './polyfills';
import './index.css';
import App from './App';
import { applyTheme } from './settings/useTheme';

registerSW({ immediate: true });

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
