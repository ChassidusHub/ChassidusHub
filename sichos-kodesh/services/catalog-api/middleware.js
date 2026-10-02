/**
 * Sichos Kodesh is private for now, with RebbeHub (Shmuly, 2 October 2026):
 * Vercel runs this before every file and function of this project. Without
 * the key it answers 401: the apps cannot send the key, so nobody gets the catalog. The key is made from RebbeHub's password
 * (RebbeHub's services/api/src/lock.ts); only its hash is here, safe to
 * publish because the password is long and random. The same file is in
 * apps/web, apps/download and services/catalog-api; to open them again,
 * delete all three.
 */
const LOCK_KEY_HASH = '1f37eaa3510f38c6b6834a83ca45de7e6af8019f4da01f1d5642c95c5391bd2b';
const LOCK_PAGE = false;
const COOKIE = '__Secure-rh_lock';
const NOT_KEPT = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

/** A service worker that drops every copy the old one kept and leaves. */
const FORGET = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) await caches.delete(name);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
`;

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const opens = async (key) => /^[0-9a-f]{64}$/.test(key ?? '') && (await sha256(key)) === LOCK_KEY_HASH;

function keyFrom(request) {
  const header = request.headers.get('x-rebbehub-key');
  if (header) return header.trim().toLowerCase();
  return /(?:^|;\s*)__Secure-rh_lock=([0-9a-f]{64})/.exec(request.headers.get('cookie') ?? '')?.[1] ?? null;
}

const escape = (text) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function lockPage(next, wrong) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Sichos Kodesh</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}form{width:100%;max-width:320px;display:grid;gap:12px}h1{font-size:22px;margin:0}input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #8888}.wrong{color:#b3261e}</style></head><body>
<form method="post" action="/_/lock"><h1>Sichos Kodesh</h1><p>Private for now.</p>${wrong ? '<p class="wrong">That password is not right.</p>' : ''}
<input type="hidden" name="next" value="${escape(next)}"><input type="password" name="password" autocomplete="current-password" placeholder="Password" aria-label="Password" required autofocus><button type="submit">Open</button></form></body></html>`;
  return new Response(html, { status: 401, headers: { ...NOT_KEPT, 'Content-Type': 'text/html; charset=utf-8' } });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (await opens(keyFrom(request))) return new Response(null, { headers: { 'x-middleware-next': '1' } });
  if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { ...NOT_KEPT, 'Content-Type': 'text/plain' } });
  if (url.pathname === '/sw.js') return new Response(FORGET, { headers: { ...NOT_KEPT, 'Content-Type': 'text/javascript' } });
  if (LOCK_PAGE && url.pathname === '/_/lock' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const nextPath = form?.get('next');
    const next = typeof nextPath === 'string' && /^\/(?![/\\])/.test(nextPath) ? nextPath : '/';
    const password = form?.get('password');
    const key = typeof password === 'string' && password ? await sha256(`rebbehub-lock:${password.trim()}`) : null;
    if (!(await opens(key))) return lockPage(next, true);
    return new Response(null, { status: 303, headers: { ...NOT_KEPT, Location: next, 'Set-Cookie': `${COOKIE}=${key}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax` } });
  }
  if (LOCK_PAGE && (request.method === 'GET' || request.method === 'HEAD')) return lockPage(`${url.pathname}${url.search}`, false);
  return new Response(JSON.stringify({ error: 'unauthorized', message: 'Sichos Kodesh is private for now' }), {
    status: 401,
    headers: { ...NOT_KEPT, 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
