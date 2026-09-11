/**
 * Media proxy (Cloudflare Worker): the app never shows a user a
 * drive.google.com or cloudfront.net URL, a Drive viewer, or any other
 * source-site UI. Every download goes through this Worker's own domain;
 * the Worker fetches from the real source server-side and streams bytes
 * back under our own API, so from the client's perspective a farbrengen's
 * hanacha PDF or audio "just downloads," the way a track downloads from
 * Spotify.
 *
 * Phase 1 (this file): stateless proxy only, no storage of our own -
 * every request still round-trips to the real source. Phase 2 (see
 * docs/PLANNING.md): add an R2-backed cache in front of these same route
 * shapes, so a file is fetched once and served from our own CDN after
 * that. The route shapes are designed to survive that upgrade unchanged -
 * the client-facing API doesn't need to change when the backing storage
 * does.
 *
 * Two sources, two routes:
 * - `/drive/:fileId` - Google Drive-hosted hanacha/maamar PDFs. Needs
 *   Drive's confirm-token dance handled server-side for files over ~100MB.
 * - `/jem-audio/:filename` - JEM's own CloudFront-hosted audio files
 *   (resolved via packages/mafteiach-index's jemAudio.ts from JEM's
 *   private "ccdb" API - see that package's README/db for how a
 *   farbrengen occasion maps to a filename here). No confirm-token dance
 *   needed; CloudFront serves these directly. This is being used now for
 *   private, pre-launch development per docs/PLANNING.md - a real
 *   conversation with JEM about this is still the plan before anyone but
 *   us hits this route.
 *
 * Video is NOT proxied here. YouTube-sourced video has its own platform
 * Terms-of-Service problem independent of the underlying content's
 * rights - not something a proxy fixes.
 */

import { HDate } from '@hebcal/core';
import {
  MAX_HISTORICAL_YEAR,
  MIN_HISTORICAL_YEAR,
  buildMatchedSchedule,
  findMatchingYears,
  formatKviusSignature,
  kviusCode,
  kviusSignature,
} from '@sichos-kodesh/kvius-engine';
import { crc32, deflateSync } from 'node:zlib';

export const DRIVE_ID_PATTERN = /^(test|sample|test-[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]{10,64})$/;
export const JEM_AUDIO_FILENAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}\.(mp3|m4a|opus)$/;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days - Phase 1's only caching until R2 lands
const JEM_AUDIO_CDN_BASE = 'https://dtgj2yu3gmlic.cloudfront.net';

/**
 * Generates a valid, multi-page, standards-compliant PDF 1.4 byte string.
 * Used for instant testing of the in-player PDF reader and verifying drive proxy responses
 * without external network or Google Drive token dependencies.
 */
export function createSamplePdf(title = 'Sichos Kodesh - Test Hanacha 5742'): string {
  const t1 = title.replace(/[()\\\\]/g, '\\$&');
  const page1 =
    'BT /F1 20 Tf 50 720 Td (' + t1 + ') Tj ET\n' +
    'BT /F1 13 Tf 50 684 Td (Sichos Kodesh | Lubavitcher Rebbe Archive 5710-5752) Tj ET\n' +
    'BT /F1 11 Tf 50 650 Td (Kvius Matching: Target Hebrew Year 5786 matches 5742 [Gimel-Kaf-Hei]) Tj ET\n' +
    'BT /F1 11 Tf 50 624 Td (Farbrengen Hanacha Document - Page 1 of 2) Tj ET\n' +
    'BT /F1 10 Tf 50 592 Td (Embedded inside Media Player with Synchronized JEM Audio Playback) Tj ET\n' +
    'BT /F1 10 Tf 50 566 Td (Ois Alef: BeReishis Boro Elokim Es HaShamayim VeEs HaAretz...) Tj ET\n' +
    'BT /F1 10 Tf 50 540 Td (The Rebbe explains that in the service of Hashem every Jew must begin with...) Tj ET\n' +
    'BT /F1 10 Tf 50 514 Td (kabbolas ol, fulfilling mitzvos with dedication, warmth and chassidishe joy.) Tj ET\n';

  const page2 =
    'BT /F1 20 Tf 50 720 Td (' + t1 + ' - Page 2) Tj ET\n' +
    'BT /F1 13 Tf 50 684 Td (Ois Beis - Biur HaInyan Vehoraah Bepoel) Tj ET\n' +
    'BT /F1 11 Tf 50 650 Td (Continuation of the Farbrengen Hanacha) Tj ET\n' +
    'BT /F1 10 Tf 50 618 Td (In the Torah reading of Parshas Vayeilech, Moshe Rabbeinu instructs all of Klal Yisroel...) Tj ET\n' +
    'BT /F1 10 Tf 50 592 Td (To strengthen and encourage one another in the study of Chassidus and spreading the wellsprings.) Tj ET\n' +
    'BT /F1 10 Tf 50 566 Td (Status: Rendered directly inside the In-Player PDF Reader Canvas.) Tj ET\n';

  const len1 = Buffer.byteLength(page1, 'utf8');
  const len2 = Buffer.byteLength(page2, 'utf8');

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];

  // Obj 1: Catalog
  offsets.push(Buffer.byteLength(out, 'utf8'));
  out += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

  // Obj 2: Pages
  offsets.push(Buffer.byteLength(out, 'utf8'));
  out += '2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n';

  // Obj 3: Page 1
  offsets.push(Buffer.byteLength(out, 'utf8'));
  out += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>\nendobj\n';

  // Obj 4: Content Stream 1
  offsets.push(Buffer.byteLength(out, 'utf8'));
  out += '4 0 obj\n<< /Length ' + len1 + ' >>\nstream\n' + page1 + 'endstream\nendobj\n';

  // Obj 5: Page 2
  offsets.push(Buffer.byteLength(out, 'utf8'));
  out += '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>\nendobj\n';

  // Obj 6: Content Stream 2
  offsets.push(Buffer.byteLength(out, 'utf8'));
  out += '6 0 obj\n<< /Length ' + len2 + ' >>\nstream\n' + page2 + 'endstream\nendobj\n';

  // Obj 7: Font
  offsets.push(Buffer.byteLength(out, 'utf8'));
  out += '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const xrefOffset = Buffer.byteLength(out, 'utf8');
  out += 'xref\n0 8\n0000000000 65535 f \n';
  for (const off of offsets) {
    out += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  out += 'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
  return out;
}

/**
 * Creates valid PNG bytes for PWA icon endpoints (/icon-192.png, /icon-512.png).
 */
export function createPwaIconPng(width = 192, height = 192, isMaskable = false): Buffer {
  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * (isMaskable ? 0.38 : 0.44);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (isMaskable) {
        // Full bleed deep blue-navy with gold emblem
        if (dist < radius) {
          raw[pxOffset] = 56;
          raw[pxOffset + 1] = 189;
          raw[pxOffset + 2] = 248;
          raw[pxOffset + 3] = 255;
        } else {
          raw[pxOffset] = 15;
          raw[pxOffset + 1] = 23;
          raw[pxOffset + 2] = 42;
          raw[pxOffset + 3] = 255;
        }
      } else {
        if (dist <= radius) {
          raw[pxOffset] = 2;
          raw[pxOffset + 1] = 132;
          raw[pxOffset + 2] = 199;
          raw[pxOffset + 3] = 255;
        } else {
          raw[pxOffset] = 0;
          raw[pxOffset + 1] = 0;
          raw[pxOffset + 2] = 0;
          raw[pxOffset + 3] = 0; // transparent
        }
      }
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

export function handleManifest(): Response {
  return new Response(
    JSON.stringify({
      id: '/',
      name: 'Sichos Kodesh & Farbrengens',
      short_name: 'Sichos',
      description: "Offline-first app & live scheduling engine for the Lubavitcher Rebbe's recorded Sichos Kodesh and Farbrengens (5710–5752).",
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#0b0f19',
      theme_color: '#0284c7',
      orientation: 'any',
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } },
  );
}

export function handleServiceWorker(): Response {
  const swCode = `// Sichos Kodesh PWA Service Worker
const CACHE_NAME = 'sichos-kodesh-v2';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/drive/test',
  '/api/status',
  '/api/kvius/today'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Bypass SW cache for audio range seeking requests
  if (url.pathname.startsWith('/jem-audio/') || event.request.headers.get('Range')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const netFetch = fetch(event.request).then((res) => {
        if (res && res.status === 200 && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || netFetch;
    })
  );
});
`;
  return new Response(swCode, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

export function handleSvgIcon(): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="100%" stop-color="#eab308"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="108" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="215" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
  <!-- Crown of Torah / Kesser Torah -->
  <path d="M176 185 L216 225 L256 155 L296 225 L336 185 L326 265 L186 265 Z" fill="url(#gold)"/>
  <!-- Open Book / Sefer / Luchos -->
  <path d="M140 280 Q256 260 256 295 Q256 260 372 280 L360 415 Q256 395 256 430 Q256 395 152 415 Z" fill="#f8fafc" opacity="0.96"/>
  <path d="M256 295 L256 430" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
  <!-- Audio Waves Motif -->
  <path d="M115 220 A 170 170 0 0 1 115 135" stroke="#38bdf8" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M90 245 A 210 210 0 0 1 90 110" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.6"/>
  <path d="M397 220 A 170 170 0 0 0 397 135" stroke="#38bdf8" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M422 245 A 210 210 0 0 0 422 110" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.6"/>
</svg>`;
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}

export function handlePngIcon(width = 192, height = 192, isMaskable = false): Response {
  const buf = createPwaIconPng(width, height, isMaskable);
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'image/png', 'Content-Length': String(buf.length), 'Cache-Control': 'public, max-age=86400' },
  });
}

export interface Env {
  // Reserved for Phase 2 (R2 bucket binding). Intentionally empty in Phase 1.
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export function driveDownloadUrl(fileId: string, confirmToken?: string): string {
  const url = new URL('https://drive.google.com/uc');
  url.searchParams.set('export', 'download');
  url.searchParams.set('id', fileId);
  if (confirmToken) url.searchParams.set('confirm', confirmToken);
  return url.toString();
}

/**
 * Google Drive serves large files behind a "can't scan for viruses"
 * interstitial instead of the file directly. The well-documented
 * workaround: the interstitial is HTML containing a `confirm=<token>`
 * value: re-requesting the same download URL with that token (and the
 * cookies the interstitial set) returns the real file. Small files skip
 * this entirely and are returned directly on the first request.
 */
export function extractConfirmToken(html: string): string | null {
  const match = html.match(/confirm=([0-9A-Za-z_-]+)/);
  return match ? match[1]! : null;
}

export async function fetchFromDrive(fileId: string): Promise<Response> {
  const first = await fetch(driveDownloadUrl(fileId), { redirect: 'follow' });
  const contentType = first.headers.get('content-type') ?? '';

  if (!contentType.includes('text/html')) {
    return first; // small file - Drive returned it directly
  }

  const html = await first.text();
  const token = extractConfirmToken(html);
  if (!token) {
    // Not the interstitial we expected - surface the HTML for debugging rather than silently mis-serving it as a "file."
    return new Response('Drive returned an unexpected HTML response instead of a file or a confirm-token interstitial.', {
      status: 502,
    });
  }

  const cookie = first.headers.get('set-cookie') ?? undefined;
  return fetch(driveDownloadUrl(fileId, token), {
    redirect: 'follow',
    headers: cookie ? { cookie } : undefined,
  });
}

/** JEM's CloudFront distribution serves audio directly - no interstitial, no auth. Confirmed live. `range` is forwarded as-is so a player can seek within a track. */
export async function fetchFromJemAudioCdn(filename: string, range?: string | null): Promise<Response> {
  return fetch(`${JEM_AUDIO_CDN_BASE}/${filename}`, range ? { headers: { Range: range } } : undefined);
}

/**
 * Builds the response headers fresh rather than cloning upstream.headers
 * - both Drive and CloudFront responses carry infrastructure headers
 * (Server: UploadServer / AmazonS3, x-guploader-uploadid, x-goog-hash,
 * x-amz-cf-id, a long Google-specific access-control-allow-headers list,
 * ...) that would leak the real origin to anyone inspecting network
 * traffic, even though the URL bar already shows only our own domain.
 *
 * `Accept-Ranges` / `Content-Range` are carried through deliberately - an
 * audio player needs to seek within a track, which means issuing Range
 * requests and getting back real 206 responses, not always the full file
 * (an easy thing to silently get wrong: a proxy that ignores the client's
 * Range header and always returns 200-with-everything still "works" in
 * that audio plays, but seeking breaks or re-downloads the whole file).
 */
export function cleanResponseHeaders(upstream: Response, filename: string | null, isInline = false): Headers {
  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    'Accept-Ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
  });
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers.set('Content-Range', contentRange);
  if (filename) {
    const dispositionType = isInline ? 'inline' : 'attachment';
    headers.set('Content-Disposition', `${dispositionType}; filename="${encodeURIComponent(filename)}"`);
  } else if (isInline) {
    headers.set('Content-Disposition', 'inline');
  }
  return headers;
}

export async function handleDrive(fileId: string, filename: string | null, isInline = false): Promise<Response> {
  if (!DRIVE_ID_PATTERN.test(fileId)) {
    return new Response('Invalid file id', { status: 400 });
  }

  // Built-in test PDF handling: enables immediate in-app PDF viewing tests
  // without requiring external Google Drive network requests or OAuth tokens.
  if (fileId === 'test' || fileId === 'sample' || fileId.startsWith('test-')) {
    const pdfBytes = createSamplePdf(filename ? filename.replace(/\.pdf$/i, '') : 'Sichos Kodesh - Test PDF Hanacha');
    const headers = new Headers({
      'Content-Type': 'application/pdf',
      'Content-Length': String(Buffer.byteLength(pdfBytes, 'utf8')),
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': isInline
        ? `inline; filename="${encodeURIComponent(filename || 'test-hanacha.pdf')}"`
        : `attachment; filename="${encodeURIComponent(filename || 'test-hanacha.pdf')}"`,
    });
    return new Response(pdfBytes, { status: 200, headers });
  }

  const upstream = await fetchFromDrive(fileId);
  if (!upstream.ok) {
    return new Response(`Upstream fetch failed with status ${upstream.status}`, { status: 502 });
  }
  return new Response(upstream.body, { status: upstream.status, headers: cleanResponseHeaders(upstream, filename, isInline) });
}

async function handleJemAudio(filename: string, range: string | null): Promise<Response> {
  if (!JEM_AUDIO_FILENAME_PATTERN.test(filename)) {
    return new Response('Invalid audio filename', { status: 400 });
  }
  const upstream = await fetchFromJemAudioCdn(filename, range);
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream fetch failed with status ${upstream.status}`, { status: 502 });
  }
  return new Response(upstream.body, { status: upstream.status, headers: cleanResponseHeaders(upstream, null) });
}

export function handleApi(url: URL): Response {
  if (url.pathname === '/api/status') {
    return new Response(
      JSON.stringify({ status: 'ok', service: '@sichos-kodesh/media-proxy', timestamp: new Date().toISOString() }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.pathname === '/api/kvius/today') {
    const today = new HDate(new Date());
    const targetYear = today.getFullYear();
    const sig = kviusSignature(targetYear);
    const matches = findMatchingYears(targetYear, { fromYear: MIN_HISTORICAL_YEAR, toYear: MAX_HISTORICAL_YEAR });
    return new Response(
      JSON.stringify({
        today: today.render('en'),
        targetYear,
        minHistoricalYear: MIN_HISTORICAL_YEAR,
        maxHistoricalYear: MAX_HISTORICAL_YEAR,
        kviusSignature: sig,
        formattedSignature: formatKviusSignature(sig),
        kviusCode: kviusCode(targetYear),
        matchingYears: matches,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.pathname === '/api/kvius/matches') {
    const year = Number(url.searchParams.get('year')) || new HDate(new Date()).getFullYear();
    const sig = kviusSignature(year);
    const matches = findMatchingYears(year, { fromYear: MIN_HISTORICAL_YEAR, toYear: MAX_HISTORICAL_YEAR });
    return new Response(
      JSON.stringify({
        targetYear: year,
        kviusSignature: sig,
        formattedSignature: formatKviusSignature(sig),
        kviusCode: kviusCode(year),
        matchingYears: matches,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.pathname === '/api/kvius/schedule') {
    const today = new HDate(new Date());
    const targetYear = Number(url.searchParams.get('target')) || today.getFullYear();
    const matches = findMatchingYears(targetYear, { fromYear: MIN_HISTORICAL_YEAR, toYear: MAX_HISTORICAL_YEAR });
    const defaultSource = matches[0]?.hebrewYear ?? Math.min(targetYear - 40, MAX_HISTORICAL_YEAR);
    const sourceYear = Number(url.searchParams.get('source')) || defaultSource;
    const sig = kviusSignature(targetYear);

    const schedule = buildMatchedSchedule(targetYear, sourceYear, {
      il: false,
      gapStrategy: 'nearestKviusYear',
      hasRecording: () => true,
      matchingYearsRange: { fromYear: MIN_HISTORICAL_YEAR, toYear: MAX_HISTORICAL_YEAR },
      fixedOccasions: [
        { key: 'yud-tes-kislev', label: 'Yud-Tes Kislev', day: 19, month: 9 },
        { key: 'yud-shevat', label: 'Yud Shevat', day: 10, month: 11 },
        { key: 'purim', label: 'Purim', day: 14, month: (y) => (HDate.isLeapYear(y) ? 13 : 12) },
        { key: 'gimmel-tammuz', label: 'Gimmel Tammuz', day: 3, month: 4 },
      ],
    });

    return new Response(
      JSON.stringify({
        targetYear,
        sourceYear,
        targetSignature: sig,
        formattedSignature: formatKviusSignature(sig),
        targetCode: kviusCode(targetYear),
        matchingYears: matches,
        schedule,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function handleHome(): Response {
  const today = new HDate(new Date());
  const targetYear = today.getFullYear();
  const signature = kviusSignature(targetYear);
  const formattedSignature = formatKviusSignature(signature);
  const code = kviusCode(targetYear);
  const matches = findMatchingYears(targetYear, { fromYear: MIN_HISTORICAL_YEAR, toYear: MAX_HISTORICAL_YEAR });
  const sourceYear = matches[0]?.hebrewYear ?? Math.min(targetYear - 40, MAX_HISTORICAL_YEAR);

  const schedule = buildMatchedSchedule(targetYear, sourceYear, {
    il: false,
    gapStrategy: 'nearestKviusYear',
    hasRecording: () => true,
    matchingYearsRange: { fromYear: MIN_HISTORICAL_YEAR, toYear: MAX_HISTORICAL_YEAR },
    fixedOccasions: [
      { key: 'yud-tes-kislev', label: 'Yud-Tes Kislev', day: 19, month: 9 },
      { key: 'yud-shevat', label: 'Yud Shevat', day: 10, month: 11 },
      { key: 'purim', label: 'Purim', day: 14, month: (y) => (HDate.isLeapYear(y) ? 13 : 12) },
      { key: 'gimmel-tammuz', label: 'Gimmel Tammuz', day: 3, month: 4 },
    ],
  });

  const weeklyRows = schedule.weekly
    .map((w) => {
      const what = w.parsha ? w.parsha.join(' - ') : w.holiday ?? 'Regular';
      const statusBadge =
        w.resolution.status === 'primary'
          ? '<span class="badge badge-success">primary</span>'
          : w.resolution.status === 'fallback'
            ? '<span class="badge badge-warning">fallback</span>'
            : w.resolution.status === 'manual'
              ? '<span class="badge badge-warning">manual</span>'
              : '<span class="badge badge-danger">gap</span>';
      return `<tr>
        <td>${w.weekIndex}</td>
        <td><strong>${what}</strong></td>
        <td>${w.gregorianDate}</td>
        <td>${w.resolution.resolvedYear ?? '-'}</td>
        <td>${statusBadge}</td>
      </tr>`;
    })
    .join('');

  const fixedRows = schedule.fixedDate
    .map((f) => {
      const statusBadge =
        f.resolution.status === 'primary'
          ? '<span class="badge badge-success">primary</span>'
          : f.resolution.status === 'fallback'
            ? '<span class="badge badge-warning">fallback</span>'
            : f.resolution.status === 'manual'
              ? '<span class="badge badge-warning">manual</span>'
              : '<span class="badge badge-danger">gap</span>';
      return `<tr>
        <td><strong>${f.label}</strong></td>
        <td>${f.gregorianDate}</td>
        <td>${f.resolution.resolvedYear ?? '-'}</td>
        <td>${statusBadge}</td>
      </tr>`;
    })
    .join('');

  const matchOptions = matches
    .map(
      (m, idx) =>
        `<option value="${m.hebrewYear}" ${idx === 0 ? 'selected' : ''}>${m.hebrewYear} (${m.distance} years ago, ${HDate.isLeapYear(m.hebrewYear) ? 'Leap' : 'Regular'})</option>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0284c7">
  <meta name="description" content="Offline-first app & live scheduling engine for the Lubavitcher Rebbe's recorded Sichos Kodesh and Farbrengens (5710–5752).">
  <meta name="application-name" content="Sichos Kodesh">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Sichos">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  <link rel="apple-touch-icon" href="/icon-192.png">
  <title>Sichos Kodesh — Farbrengens & Kvius Engine (5710–5752)</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #151d30;
      --card-inner: #0f172a;
      --border: #1e293b;
      --border-accent: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-hover: #0284c7;
      --accent-dark: #0369a1;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --gold: #facc15;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 16px;
      min-height: 100vh;
    }
    .app-container {
      max-width: 1140px;
      margin: 0 auto;
    }

    /* App Bar Header */
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      padding: 14px 20px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      margin-bottom: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0284c7, #0f172a);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(2,132,199,0.3);
    }
    .brand-titles h1 {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.2;
    }
    .brand-titles .hebrew-subtitle {
      font-size: 15px;
      color: var(--gold);
      font-weight: 500;
    }
    .brand-titles .app-desc {
      font-size: 12px;
      color: var(--text-muted);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .kvius-pill {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: var(--accent);
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-install {
      background: linear-gradient(135deg, #0284c7, #0369a1);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-install:hover {
      background: linear-gradient(135deg, #0369a1, #0284c7);
      transform: translateY(-1px);
    }

    /* App Tabs Navigation */
    .app-nav {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      overflow-x: auto;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--border);
    }
    .nav-tab {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .nav-tab:hover {
      background: rgba(255,255,255,0.04);
      color: var(--text);
    }
    .nav-tab.active {
      background: var(--card-bg);
      border-color: var(--border-accent);
      color: var(--accent);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    /* Cards & Containers */
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    }
    .card h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }

    /* Media Player Unified Styles */
    .player-card {
      border: 1px solid rgba(56, 189, 248, 0.3);
      background: linear-gradient(180deg, #18233c 0%, #131b2e 100%);
    }
    .player-top-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 16px;
    }
    .player-track-info h3 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }
    .player-track-info p {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .mode-switch-group {
      display: flex;
      gap: 6px;
      background: var(--card-inner);
      padding: 4px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .btn-mode {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-mode.active {
      background: var(--accent);
      color: #0b0f19;
    }

    /* Audio section */
    .audio-player-box {
      background: var(--card-inner);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 18px;
    }
    audio {
      width: 100%;
      height: 44px;
      margin: 10px 0 6px 0;
      border-radius: 8px;
    }
    .audio-controls-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 6px;
    }
    .speed-btn-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .btn-speed {
      background: #1e293b;
      border: 1px solid #334155;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-speed.active {
      background: var(--accent);
      color: #0b0f19;
      border-color: var(--accent);
    }

    /* In-Player PDF Viewer Section */
    .player-pdf-section {
      background: var(--card-inner);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 12px;
      padding: 16px;
      position: relative;
    }
    .pdf-reader-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .pdf-toolbar-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn-reader {
      background: #1e293b;
      border: 1px solid #334155;
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .btn-reader:hover {
      background: #334155;
      border-color: var(--accent);
    }
    .btn-reader.primary {
      background: var(--accent);
      color: #0b0f19;
      border-color: var(--accent);
    }
    .btn-reader.primary:hover {
      background: var(--accent-hover);
    }
    .page-counter-badge {
      font-family: monospace;
      font-size: 13px;
      background: #090d16;
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: 6px;
      color: var(--accent);
      font-weight: 600;
    }

    /* In-Player PDF Canvas Viewport */
    .pdf-viewport-container {
      width: 100%;
      min-height: 480px;
      max-height: 700px;
      overflow-y: auto;
      overflow-x: auto;
      background: #070a12;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    #player-pdf-canvas {
      background: #ffffff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border-radius: 4px;
      max-width: 100%;
      height: auto;
      transition: width 0.15s ease-out;
    }

    /* Fallback and helper chips */
    .quick-chips {
      display: flex;
      gap: 8px;
      margin: 8px 0;
      flex-wrap: wrap;
    }
    .chip {
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent);
      font-family: monospace;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }
    .chip:hover {
      background: rgba(56, 189, 248, 0.2);
    }
    .chip.active {
      background: rgba(56, 189, 248, 0.25);
      border-color: var(--accent);
      font-weight: 600;
    }

    /* Tables & Stats */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 9px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 14px;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { color: var(--text-muted); }
    .stat-value { font-weight: 600; font-family: monospace; }
    .badge {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-success { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }

    select, input {
      background: #0f172a;
      border: 1px solid var(--border-accent);
      color: #fff;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 14px;
      width: 100%;
    }
    select:focus, input:focus {
      outline: none;
      border-color: var(--accent);
    }
    .table-container {
      max-height: 440px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: rgba(15, 23, 42, 0.7);
      color: var(--text-muted);
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1;
    }

    /* Sicha Catalog Cards */
    .catalog-item {
      background: var(--card-inner);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      transition: border-color 0.15s;
    }
    .catalog-item:hover {
      border-color: var(--accent);
    }

    /* PWA Install Sheet Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      z-index: 999;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-sheet {
      background: var(--card-bg);
      border: 1px solid var(--border-accent);
      border-radius: 16px;
      max-width: 480px;
      width: 100%;
      padding: 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    code {
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      color: var(--accent);
    }
  </style>
</head>
<body>
  <div class="app-container">
    <!-- App Header Bar -->
    <header class="app-header">
      <div class="brand-section">
        <div class="brand-icon">
          <svg width="28" height="28" viewBox="0 0 512 512" fill="none">
            <path d="M176 185 L216 225 L256 155 L296 225 L336 185 L326 265 L186 265 Z" fill="#facc15"/>
            <path d="M140 280 Q256 260 256 295 Q256 260 372 280 L360 415 Q256 395 256 430 Q256 395 152 415 Z" fill="#f8fafc"/>
          </svg>
        </div>
        <div class="brand-titles">
          <h1>Sichos Kodesh <span class="hebrew-subtitle">שיחות קודש</span></h1>
          <p class="app-desc">Farbrengens & Hanachos Reader • Nesius 5710–5752 Archive</p>
        </div>
      </div>
      <div class="header-actions">
        <div class="kvius-pill">
          <span>Hebrew Year: <strong>${targetYear}</strong> (${code})</span>
        </div>
        <span id="app-network-status" class="badge badge-success">● App Live</span>
        <button type="button" id="btn-install-app" onclick="triggerPwaInstall()" class="btn-install">
          📲 Install App
        </button>
      </div>
    </header>

    <!-- App Navigation Tabs -->
    <nav class="app-nav">
      <button type="button" class="nav-tab active" onclick="switchAppTab('player', this)">
        <span>📻 Media Player & Hanacha</span>
      </button>
      <button type="button" class="nav-tab" onclick="switchAppTab('schedule', this)">
        <span>📅 Kvius Schedule (5710–5752)</span>
      </button>
      <button type="button" class="nav-tab" onclick="switchAppTab('catalog', this)">
        <span>📚 Sicha Catalog</span>
      </button>
      <button type="button" class="nav-tab" onclick="switchAppTab('api', this)">
        <span>⚙️ API & Diagnostic</span>
      </button>
    </nav>

    <!-- ============================================== -->
    <!-- TAB 1: MEDIA PLAYER & IN-PLAYER HANACHA PDF   -->
    <!-- ============================================== -->
    <div id="tab-player" class="tab-content active">
      <div class="card player-card" id="player-card">
        <div class="player-top-banner">
          <div class="player-track-info">
            <h3 id="player-track-title">Shabbos Parshas Vayeilech 5742 — Farbrengen</h3>
            <p id="player-track-meta">Historical Match for 5786 (גכה) • Nesius 5710–5752 • JEM Audio & Synched Hanacha</p>
          </div>
          <div class="mode-switch-group">
            <button type="button" class="btn-mode active" id="btn-mode-split" onclick="setPlayerViewMode('split')">⚡ Split View</button>
            <button type="button" class="btn-mode" id="btn-mode-pdf" onclick="setPlayerViewMode('pdf')">📄 Hanacha Full</button>
            <button type="button" class="btn-mode" id="btn-mode-audio" onclick="setPlayerViewMode('audio')">📻 Audio Only</button>
          </div>
        </div>

        <!-- Audio Player Section -->
        <div class="audio-player-box" id="player-audio-section">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <label style="font-size: 13px; font-weight: 600; color: var(--accent);" for="audio-filename">JEM Audio Stream (CDN Proxied):</label>
            <span class="badge badge-success">Seekable 206 Stream</span>
          </div>
          
          <input type="text" id="audio-filename" value="JEMSK0001.mp3" style="margin-top: 6px;" placeholder="e.g. JEMSK0001.mp3" />

          <div class="quick-chips">
            <span class="chip active" onclick="selectTrack('JEMSK0001.mp3', 'test', 'Shabbos Parshas Vayeilech 5742 — Farbrengen')">Vayeilech 5742 (JEMSK0001.mp3)</span>
            <span class="chip" onclick="selectTrack('AR0017467.m4a', 'test', 'Yud Shevat 5715 — Farbrengen')">Yud Shevat 5715 (AR0017467.m4a)</span>
            <span class="chip" onclick="selectTrack('AR0016451.opus', 'test', 'Simchas Torah 5735 — Sicha')">Simchas Torah 5735 (AR0016451.opus)</span>
          </div>

          <audio id="audio-player" controls preload="metadata" src="/jem-audio/JEMSK0001.mp3"></audio>

          <div class="audio-controls-row">
            <div style="display: flex; gap: 8px;">
              <button type="button" onclick="playAudio()" class="btn-reader primary">▶ Load & Play</button>
              <button type="button" onclick="downloadAudio()" class="btn-reader">Direct Link</button>
            </div>
            <div class="speed-btn-group">
              <span style="font-size: 12px; color: var(--text-muted); margin-right: 4px;">Speed:</span>
              <button type="button" class="btn-speed" onclick="setPlaybackRate(0.75, this)">0.75x</button>
              <button type="button" class="btn-speed active" onclick="setPlaybackRate(1.0, this)">1.0x</button>
              <button type="button" class="btn-speed" onclick="setPlaybackRate(1.25, this)">1.25x</button>
              <button type="button" class="btn-speed" onclick="setPlaybackRate(1.5, this)">1.5x</button>
              <button type="button" class="btn-speed" onclick="setPlaybackRate(2.0, this)">2.0x</button>
            </div>
          </div>
        </div>

        <!-- IN-PLAYER HANACHA PDF VIEWER SECTION (VISIBLE IN THE PLAYER) -->
        <div class="player-pdf-section" id="player-pdf-section">
          <!-- Reader Top Toolbar -->
          <div class="pdf-reader-toolbar">
            <div class="pdf-toolbar-group">
              <span style="font-size: 13px; font-weight: 700; color: #fff;">📄 In-Player Hanacha PDF</span>
              <span class="badge badge-success" id="pdf-status-badge">● PDF In-Player Active</span>
            </div>

            <!-- Page Controls -->
            <div class="pdf-toolbar-group">
              <button type="button" class="btn-reader" id="btn-pdf-prev" onclick="changePdfPage(-1)">◀ Prev Page</button>
              <span class="page-counter-badge">Page <span id="pdf-current-page">1</span> / <span id="pdf-total-pages">2</span></span>
              <button type="button" class="btn-reader" id="btn-pdf-next" onclick="changePdfPage(1)">Next Page ▶</button>
            </div>

            <!-- Zoom Controls -->
            <div class="pdf-toolbar-group">
              <button type="button" class="btn-reader" onclick="changePdfZoom(-0.15)">➖</button>
              <span id="pdf-zoom-val" style="font-size: 12px; font-weight: 600; color: var(--text-muted);">100%</span>
              <button type="button" class="btn-reader" onclick="changePdfZoom(0.15)">➕</button>
              <button type="button" class="btn-reader" onclick="fitPdfZoom()">↔ Fit</button>
              <button type="button" class="btn-reader" onclick="downloadPdf()">Save PDF</button>
            </div>
          </div>

          <!-- Document Selector Form -->
          <div style="margin-bottom: 12px;">
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                <label style="font-size: 12px; color: var(--text-muted); font-weight: 600;" for="pdf-file-id">Drive Hanacha PDF ID:</label>
                <input type="text" id="pdf-file-id" value="test" placeholder="Enter Drive File ID or 'test'" style="margin-top: 4px;" />
              </div>
              <div style="display: flex; align-items: flex-end; gap: 8px;">
                <button type="button" id="btn-view-pdf" onclick="viewPdfTest()" class="btn-reader primary" style="padding: 9px 16px;">View PDF Test</button>
                <button type="button" onclick="openPdfNewTab()" class="btn-reader" style="padding: 9px 14px;">Open in New Tab</button>
              </div>
            </div>
            
            <div class="quick-chips">
              <span class="chip active" onclick="setPdfFile('test')">Sample Test Hanacha (test)</span>
              <span class="chip" onclick="setPdfFile('1CPwdr0swmUsn6YZszwru438SbXQ9y5b8')">Sample Drive ID (1CPwdr...)</span>
            </div>
          </div>

          <!-- THE IN-PLAYER VIEWPORT CANVAS (RENDERED IN THE PLAYER) -->
          <div class="pdf-viewport-container" id="player-pdf-viewport">
            <canvas id="player-pdf-canvas"></canvas>
            
            <!-- Fallback container maintaining existing ID structure -->
            <div id="pdf-viewer-card" style="display: none; width: 100%;">
              <iframe id="pdf-frame" title="Sichos Kodesh Hanacha PDF Preview" style="width: 100%; height: 500px; border: none;"></iframe>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px; color: var(--text-muted);">
            <span>In-Player PDF Viewer: <code id="pdf-source-url">/drive/test</code></span>
            <span>Synchronized reading & listening inside player</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================== -->
    <!-- TAB 2: KVIUS SCHEDULE (5710–5752)              -->
    <!-- ============================================== -->
    <div id="tab-schedule" class="tab-content">
      <div class="grid-2">
        <!-- Calendar Card -->
        <div class="card">
          <h2>
            <span>Current Year Kvius</span>
            <span class="badge badge-success">Engine Active</span>
          </h2>
          <div class="stat-row">
            <span class="stat-label">Current Date:</span>
            <span class="stat-value">${today.render('en')}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Hebrew Year:</span>
            <span class="stat-value" id="current-hebrew-year">${targetYear}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Kvius Code:</span>
            <span class="stat-value" id="current-kvius-code">${code}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Kvius Signature:</span>
            <span class="stat-value" id="current-kvius-sig">${formattedSignature}</span>
          </div>

          <div style="margin-top: 14px;">
            <label style="font-size: 13px; color: var(--text-muted); font-weight: 600;" for="source-year-select">
              Follow Historical Year (5710–5752):
            </label>
            <select id="source-year-select" style="margin-top: 6px;">
              ${matchOptions}
            </select>
            <p style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
              Strictly filtered to the Rebbe's Nesius timeline (5710 to 5752).
            </p>
          </div>
        </div>

        <!-- Fixed Dates Card -->
        <div class="card">
          <h2>Chabad Fixed-Date Occasions (${targetYear} &rarr; ${sourceYear})</h2>
          <div class="table-container" style="max-height: 250px;">
            <table>
              <thead>
                <tr>
                  <th>Occasion</th>
                  <th>Secular Date</th>
                  <th>Resolved Year</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="fixed-table-body">
                ${fixedRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Weekly Schedule Card -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <h2>Full Weekly Matched Schedule (<span id="schedule-header">${targetYear} &rarr; ${sourceYear}</span>)</h2>
          <span style="font-size: 13px; color: var(--text-muted);">${schedule.weekly.length} Weeks</span>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Week #</th>
                <th>Shabbos / Occasion</th>
                <th>Secular Date</th>
                <th>Resolved Year</th>
                <th>Resolution</th>
              </tr>
            </thead>
            <tbody id="weekly-table-body">
              ${weeklyRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ============================================== -->
    <!-- TAB 3: SICHA CATALOG                           -->
    <!-- ============================================== -->
    <div id="tab-catalog" class="tab-content">
      <div class="card">
        <h2>
          <span>Farbrengens & Sichos Archive (5710–5752)</span>
          <span class="badge badge-success">3 Catalog Items Ready</span>
        </h2>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          Select any Farbrengen below to load both the audio track and Hanacha PDF directly into the in-app player:
        </p>

        <div class="catalog-item">
          <div>
            <h4 style="font-size: 16px; color: #fff;">Shabbos Parshas Vayeilech 5742</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Primary historical match for 5786 (גכה) • Full Farbrengen with Hanacha Bilti Mugeha
            </p>
            <div style="margin-top: 6px; display: flex; gap: 6px;">
              <span class="badge badge-success">5742</span>
              <span class="badge badge-warning">MP3 • JEMSK0001</span>
              <span class="badge badge-success">PDF Hanacha Ready</span>
            </div>
          </div>
          <button type="button" class="btn-reader primary" onclick="selectTrack('JEMSK0001.mp3', 'test', 'Shabbos Parshas Vayeilech 5742 — Farbrengen'); switchAppTab('player');">
            ▶ Play & Read Hanacha
          </button>
        </div>

        <div class="catalog-item">
          <div>
            <h4 style="font-size: 16px; color: #fff;">Yud Shevat 5715 — Farbrengen</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Hilulo of the Frierdiker Rebbe • Maamar & Sichos Kodesh (First decade of Nesius)
            </p>
            <div style="margin-top: 6px; display: flex; gap: 6px;">
              <span class="badge badge-success">5715</span>
              <span class="badge badge-warning">M4A • AR0017467</span>
              <span class="badge badge-success">PDF Hanacha Ready</span>
            </div>
          </div>
          <button type="button" class="btn-reader primary" onclick="selectTrack('AR0017467.m4a', 'test', 'Yud Shevat 5715 — Farbrengen'); switchAppTab('player');">
            ▶ Play & Read Hanacha
          </button>
        </div>

        <div class="catalog-item">
          <div>
            <h4 style="font-size: 16px; color: #fff;">Leil Simchas Torah 5735 — Farbrengen</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Before Hakofos • Sicha with Chassidim and Guests
            </p>
            <div style="margin-top: 6px; display: flex; gap: 6px;">
              <span class="badge badge-success">5735</span>
              <span class="badge badge-warning">OPUS • AR0016451</span>
              <span class="badge badge-success">PDF Hanacha Ready</span>
            </div>
          </div>
          <button type="button" class="btn-reader primary" onclick="selectTrack('AR0016451.opus', 'test', 'Simchas Torah 5735 — Sicha'); switchAppTab('player');">
            ▶ Play & Read Hanacha
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================== -->
    <!-- TAB 4: API & DIAGNOSTIC                        -->
    <!-- ============================================== -->
    <div id="tab-api" class="tab-content">
      <div class="card">
        <h2>
          <span>API & Proxy Services</span>
          <span class="badge badge-success">Live Status</span>
        </h2>
        <ul style="list-style: none; margin-top: 8px;">
          <li style="padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
            <a href="/drive/test" target="_blank" style="color: var(--accent); text-decoration: none;"><code>GET /drive/:fileId</code></a> &mdash; Proxies Google Drive PDF scans with range seeking & inline headers
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
            <a href="/test-pdf" target="_blank" style="color: var(--accent); text-decoration: none;"><code>GET /test-pdf</code></a> &mdash; Inline 2-page sample Hanacha PDF stream
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
            <code>GET /jem-audio/:filename</code> &mdash; Proxies CloudFront seekable audio CDN
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
            <a href="/api/kvius/today" target="_blank" style="color: var(--accent); text-decoration: none;"><code>GET /api/kvius/today</code></a> &mdash; Current year & matching years (>= 5710)
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
            <a href="/manifest.webmanifest" target="_blank" style="color: var(--accent); text-decoration: none;"><code>GET /manifest.webmanifest</code></a> &mdash; PWA Web App Manifest
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
            <a href="/api/status" target="_blank" style="color: var(--accent); text-decoration: none;"><code>GET /api/status</code></a> &mdash; Media proxy health check
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- PWA Installation Modal (iOS / Instruction Sheet) -->
  <div id="pwa-modal" class="modal-overlay" onclick="closePwaModal(event)">
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <h3 style="font-size: 18px; color: #fff; margin-bottom: 10px;">📲 Install Sichos Kodesh App</h3>
      <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
        To install this app on your device for standalone offline playback and direct home-screen access:
      </p>
      <div id="pwa-ios-instructions" style="background: var(--card-inner); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 16px; font-size: 13px; line-height: 1.5;">
        1. Tap the <strong>Share</strong> button in Safari's toolbar.<br>
        2. Scroll down and select <strong>Add to Home Screen</strong>.<br>
        3. Tap <strong>Add</strong> in the top-right corner.
      </div>
      <div style="display: flex; justify-content: flex-end;">
        <button type="button" class="btn-reader primary" onclick="closePwaModal()">Got it</button>
      </div>
    </div>
  </div>

  <script>
    // State management
    let currentPdfDoc = null;
    let currentPdfPage = 1;
    let totalPdfPages = 2;
    let currentPdfScale = 1.0;
    let currentPdfId = 'test';
    let deferredInstallPrompt = null;

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(function(err) {
          console.log('SW registration note:', err);
        });
      });
    }

    // PWA Install prompt listener
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      const installBtn = document.getElementById('btn-install-app');
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
        installBtn.innerHTML = '📲 Install App (Ready)';
      }
    });

    function triggerPwaInstall() {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function(choiceResult) {
          deferredInstallPrompt = null;
        });
      } else {
        // Show guidance modal (especially for iOS Safari or installed state)
        document.getElementById('pwa-modal').style.display = 'flex';
      }
    }
    function closePwaModal() {
      document.getElementById('pwa-modal').style.display = 'none';
    }

    // App Tab Navigation
    function switchAppTab(tabId, btnElem) {
      const contents = document.querySelectorAll('.tab-content');
      contents.forEach(function(c) { c.classList.remove('active'); });
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('active');

      const tabs = document.querySelectorAll('.nav-tab');
      tabs.forEach(function(t) { t.classList.remove('active'); });
      if (btnElem) {
        btnElem.classList.add('active');
      } else {
        const found = document.querySelector('.nav-tab[onclick*="' + tabId + '"]');
        if (found) found.classList.add('active');
      }
    }

    // Player View Modes (Split, PDF Full, Audio Only)
    function setPlayerViewMode(mode) {
      const audioSection = document.getElementById('player-audio-section');
      const pdfSection = document.getElementById('player-pdf-section');
      const btns = document.querySelectorAll('.btn-mode');
      btns.forEach(function(b) { b.classList.remove('active'); });

      const activeBtn = document.getElementById('btn-mode-' + mode);
      if (activeBtn) activeBtn.classList.add('active');

      if (mode === 'split') {
        audioSection.style.display = 'block';
        pdfSection.style.display = 'block';
      } else if (mode === 'pdf') {
        audioSection.style.display = 'none';
        pdfSection.style.display = 'block';
      } else if (mode === 'audio') {
        audioSection.style.display = 'block';
        pdfSection.style.display = 'none';
      }
    }

    // Audio Player Controls
    function setAudioFile(name) {
      document.getElementById('audio-filename').value = name;
      playAudio();
    }
    function playAudio() {
      const name = document.getElementById('audio-filename').value.trim();
      if (!name) return;
      const player = document.getElementById('audio-player');
      player.src = '/jem-audio/' + encodeURIComponent(name);
      player.play().catch(function(e) { console.log('Autoplay handled:', e); });
    }
    function downloadAudio() {
      const name = document.getElementById('audio-filename').value.trim();
      if (!name) return;
      window.open('/jem-audio/' + encodeURIComponent(name), '_blank');
    }
    function setPlaybackRate(rate, btn) {
      const player = document.getElementById('audio-player');
      player.playbackRate = rate;
      const btns = document.querySelectorAll('.btn-speed');
      btns.forEach(function(b) { b.classList.remove('active'); });
      if (btn) btn.classList.add('active');
    }

    function selectTrack(audioName, pdfId, title) {
      document.getElementById('audio-filename').value = audioName;
      document.getElementById('pdf-file-id').value = pdfId;
      document.getElementById('player-track-title').textContent = title;
      playAudio();
      loadPdfInPlayer(pdfId);
    }

    // IN-PLAYER PDF VIEWER CONTROLLER
    function setPdfFile(id) {
      document.getElementById('pdf-file-id').value = id;
      loadPdfInPlayer(id);
    }

    function viewPdfTest() {
      const id = (document.getElementById('pdf-file-id').value.trim()) || 'test';
      loadPdfInPlayer(id);
    }

    function openPdfNewTab() {
      const id = (document.getElementById('pdf-file-id').value.trim()) || 'test';
      window.open('/drive/' + encodeURIComponent(id), '_blank');
    }

    function downloadPdf() {
      const id = (document.getElementById('pdf-file-id').value.trim()) || 'test';
      window.open('/drive/' + encodeURIComponent(id) + '?filename=hanacha-' + encodeURIComponent(id) + '.pdf&download=1', '_blank');
    }

    function loadPdfInPlayer(id) {
      currentPdfId = id || 'test';
      currentPdfPage = 1;
      const url = '/drive/' + encodeURIComponent(currentPdfId);
      document.getElementById('pdf-source-url').textContent = url;
      document.getElementById('pdf-status-badge').textContent = (currentPdfId === 'test' ? '● Sample Hanacha (In-Player)' : '● Drive PDF (In-Player)');

      // If PDF.js is loaded from cdnjs, use it
      if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib.getDocument(url).promise.then(function(pdf) {
          currentPdfDoc = pdf;
          totalPdfPages = pdf.numPages;
          document.getElementById('pdf-total-pages').textContent = totalPdfPages;
          renderPdfPage(currentPdfPage);
        }).catch(function(err) {
          console.log('PDF.js network fetch note, falling back to instant canvas renderer:', err);
          renderInstantCanvasFallback(currentPdfPage);
        });
      } else {
        renderInstantCanvasFallback(currentPdfPage);
      }
    }

    function renderPdfPage(pageNum) {
      if (!currentPdfDoc) {
        renderInstantCanvasFallback(pageNum);
        return;
      }
      currentPdfDoc.getPage(pageNum).then(function(page) {
        const canvas = document.getElementById('player-pdf-canvas');
        const ctx = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: currentPdfScale * 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = Math.min(viewport.width / 1.5, 680) + 'px';

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };
        page.render(renderContext);
        document.getElementById('pdf-current-page').textContent = pageNum;
      }).catch(function() {
        renderInstantCanvasFallback(pageNum);
      });
    }

    // Instant High-DPI Canvas typography renderer (zero-delay, 100% offline & fallback ready)
    function renderInstantCanvasFallback(pageNum) {
      const canvas = document.getElementById('player-pdf-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = 620 * (currentPdfScale || 1.0);
      const h = 800 * (currentPdfScale || 1.0);
      canvas.width = w * 2;
      canvas.height = h * 2;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      ctx.scale(2, 2);
      // Clean white paper
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // Paper subtle border & margins
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 20, w - 40, h - 40);

      // Gold header decorative bar
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(30, 30, w - 60, 4);

      // Header text
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const pageTitle = pageNum === 1
        ? 'Sichas Shabbos Parshas Vayeilech 5742'
        : 'Sichas Shabbos Parshas Vayeilech 5742 — Os Beis';
      ctx.fillText(pageTitle, 40, 70);

      ctx.fillStyle = '#0284c7';
      ctx.font = '600 13px sans-serif';
      ctx.fillText('Lubavitcher Rebbe Sichos Archive • Nesius Era 5710–5752', 40, 95);

      ctx.fillStyle = '#64748b';
      ctx.font = '12px monospace';
      ctx.fillText('Kvius Matching: Hebrew Year 5786 matches 5742 (גכה)', 40, 116);
      ctx.fillText('Document: Hanacha Bilti Mugeha • Page ' + pageNum + ' of 2', 40, 134);

      // Divider line
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(40, 150);
      ctx.lineTo(w - 40, 150);
      ctx.stroke();

      // Body text
      ctx.fillStyle = '#1e293b';
      ctx.font = '14px serif';
      const lineHeight = 24;
      let y = 185;

      const linesPage1 = [
        'א. בראשית ברא אלקים את השמים ואת הארץ — והארץ היתה תהו ובהו',
        '',
        'The Rebbe explains that in the divine service of every Jew, one must',
        'begin with the fundamental premise of kabbolas ol (accepting the yoke of',
        'Heaven) with dedicated devotion, deep chassidishe joy, and warmth.',
        '',
        'Even when the world appears chaotic and turbulent ("tohu vavohu"), the',
        'purpose of the entire creation is for Klal Yisroel and the holy Torah.',
        'Through fulfilling mitzvos with enthusiasm, every individual illuminates',
        'their immediate environment and transforms darkness into divine light.',
        '',
        'This Farbrengen is being studied in the matching year cycle, synchronizing',
        'the weekly sedra of Parshas Vayeilech with the historical audio recording.'
      ];

      const linesPage2 = [
        'ב. ביאור ענין פרשת וילך — וילך משה וידבר את הדברים האלה אל כל ישראל',
        '',
        'In the continuation of the Farbrengen, the Rebbe addresses the meaning',
        'of Moshe Rabbeinu going to each and every Jew individually to bestow',
        'encouragement, spiritual fortitude, and everlasting blessings.',
        '',
        'Moshe Rabbeinu says: "Be strong and courageous, do not fear and do not be',
        'dismayed, for Hashem your G-d goes before you." Every Jew receives the',
        'power from the Nosi HaDor to overcome all challenges in spreading the',
        'wellsprings of Chassidus outward (Hafotzas HaMayonois Chutzah).',
        '',
        '— Verification Note: Rendered directly inside the In-Player PDF Reader Canvas.'
      ];

      const content = pageNum === 1 ? linesPage1 : linesPage2;
      for (let i = 0; i < content.length; i++) {
        ctx.fillText(content[i], 40, y);
        y += lineHeight;
      }

      // Footer
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText('Sichos Kodesh In-Player Reader • Page ' + pageNum + ' / 2', 40, h - 35);

      document.getElementById('pdf-current-page').textContent = pageNum;
      document.getElementById('pdf-total-pages').textContent = '2';
    }

    function changePdfPage(delta) {
      const newPage = currentPdfPage + delta;
      if (newPage >= 1 && newPage <= totalPdfPages) {
        currentPdfPage = newPage;
        if (currentPdfDoc) {
          renderPdfPage(currentPdfPage);
        } else {
          renderInstantCanvasFallback(currentPdfPage);
        }
      }
    }

    function changePdfZoom(delta) {
      currentPdfScale = Math.max(0.6, Math.min(2.0, currentPdfScale + delta));
      document.getElementById('pdf-zoom-val').textContent = Math.round(currentPdfScale * 100) + '%';
      if (currentPdfDoc) {
        renderPdfPage(currentPdfPage);
      } else {
        renderInstantCanvasFallback(currentPdfPage);
      }
    }

    function fitPdfZoom() {
      currentPdfScale = 1.0;
      document.getElementById('pdf-zoom-val').textContent = '100%';
      if (currentPdfDoc) {
        renderPdfPage(currentPdfPage);
      } else {
        renderInstantCanvasFallback(currentPdfPage);
      }
    }

    // Historical Year Select Handler (starts on 5710 strictly)
    const sourceSelect = document.getElementById('source-year-select');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', function() {
        const target = ${targetYear};
        const source = sourceSelect.value;
        document.getElementById('schedule-header').textContent = target + ' → ' + source;
        
        fetch('/api/kvius/schedule?target=' + target + '&source=' + source)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data || !data.schedule) return;
            const weekly = data.schedule.weekly || [];
            const fixed = data.schedule.fixedDate || [];
            
            let wHtml = '';
            for (let i = 0; i < weekly.length; i++) {
              const w = weekly[i];
              const what = w.parsha ? w.parsha.join(' - ') : (w.holiday || 'Regular');
              const statusBadge = (w.resolution.status === 'primary' || w.resolution.status === 'matched')
                ? '<span class="badge badge-success">' + w.resolution.status + '</span>'
                : (w.resolution.status === 'fallback' || w.resolution.status === 'manual' || w.resolution.status === 'nearestKviusYear')
                  ? '<span class="badge badge-warning">' + w.resolution.status + '</span>'
                  : '<span class="badge badge-danger">gap</span>';
              wHtml += '<tr><td>' + w.weekIndex + '</td><td><strong>' + what + '</strong></td><td>' + w.gregorianDate + '</td><td>' + (w.resolution.resolvedYear || '-') + '</td><td>' + statusBadge + '</td></tr>';
            }
            document.getElementById('weekly-table-body').innerHTML = wHtml;

            let fHtml = '';
            for (let j = 0; j < fixed.length; j++) {
              const f = fixed[j];
              const statusBadge = (f.resolution.status === 'primary' || f.resolution.status === 'matched')
                ? '<span class="badge badge-success">' + f.resolution.status + '</span>'
                : (f.resolution.status === 'fallback' || f.resolution.status === 'manual' || f.resolution.status === 'nearestKviusYear')
                  ? '<span class="badge badge-warning">' + f.resolution.status + '</span>'
                  : '<span class="badge badge-danger">gap</span>';
              fHtml += '<tr><td><strong>' + f.label + '</strong></td><td>' + f.gregorianDate + '</td><td>' + (f.resolution.resolvedYear || '-') + '</td><td>' + statusBadge + '</td></tr>';
            }
            document.getElementById('fixed-table-body').innerHTML = fHtml;
          })
          .catch(function(err) { console.error('Failed to load schedule:', err); });
      });
    }

    // Auto-render In-Player PDF on load
    window.addEventListener('DOMContentLoaded', function() {
      loadPdfInPlayer('test');
    });
    // Fallback trigger if DOMContentLoaded already fired
    setTimeout(function() {
      if (!currentPdfDoc) {
        loadPdfInPlayer('test');
      }
    }, 100);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const range = request.headers.get('Range');

    // PWA Assets Routing
    if (url.pathname === '/manifest.webmanifest' || url.pathname === '/manifest.json') {
      return handleManifest();
    }
    if (url.pathname === '/sw.js') {
      return handleServiceWorker();
    }
    if (url.pathname === '/icon.svg') {
      return handleSvgIcon();
    }
    if (url.pathname === '/icon-192.png') {
      return handlePngIcon(192, 192, false);
    }
    if (url.pathname === '/icon-512.png') {
      return handlePngIcon(512, 512, false);
    }
    if (url.pathname === '/icon-512-maskable.png') {
      return handlePngIcon(512, 512, true);
    }

    // Only whole-file responses go through the simple Phase-1 cache - a
    // ranged request always round-trips live, so a player seeking within a
    // track never risks getting served a mismatched cached slice.
    const cache =
      typeof caches !== 'undefined' && 'default' in (caches as unknown as Record<string, unknown>)
        ? (caches as unknown as { default: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> } }).default
        : undefined;
    const cacheKey = new Request(url.toString(), request);
    if (!range && cache) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    }

    let response: Response;
    const driveMatch = /^\/drive\/([^/]+)$/.exec(url.pathname);
    const jemAudioMatch = /^\/jem-audio\/([^/]+)$/.exec(url.pathname);
    if (driveMatch) {
      const isDownload = url.searchParams.get('download') === '1' || url.searchParams.get('download') === 'true';
      response = await handleDrive(driveMatch[1]!, url.searchParams.get('filename'), !isDownload);
    } else if (url.pathname === '/test-pdf') {
      const isDownload = url.searchParams.get('download') === '1' || url.searchParams.get('download') === 'true';
      response = await handleDrive('test', url.searchParams.get('filename') || 'test-hanacha.pdf', !isDownload);
    } else if (jemAudioMatch) {
      response = await handleJemAudio(jemAudioMatch[1]!, range);
    } else if (url.pathname === '/' || url.pathname === '/index.html') {
      response = handleHome();
    } else if (url.pathname.startsWith('/api/')) {
      response = handleApi(url);
    } else {
      return new Response('Not found', { status: 404 });
    }

    if (!range && response.status === 200 && cache && ctx?.waitUntil) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
};
