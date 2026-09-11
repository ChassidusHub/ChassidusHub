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
  buildMatchedSchedule,
  findMatchingYears,
  kviusCode,
  kviusSignature,
} from '@sichos-kodesh/kvius-engine';

export const DRIVE_ID_PATTERN = /^[a-zA-Z0-9_-]{10,64}$/;
export const JEM_AUDIO_FILENAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}\.(mp3|m4a|opus)$/;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days - Phase 1's only caching until R2 lands
const JEM_AUDIO_CDN_BASE = 'https://dtgj2yu3gmlic.cloudfront.net';

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
function cleanResponseHeaders(upstream: Response, filename: string | null): Headers {
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
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  }
  return headers;
}

async function handleDrive(fileId: string, filename: string | null): Promise<Response> {
  if (!DRIVE_ID_PATTERN.test(fileId)) {
    return new Response('Invalid file id', { status: 400 });
  }
  const upstream = await fetchFromDrive(fileId);
  if (!upstream.ok) {
    return new Response(`Upstream fetch failed with status ${upstream.status}`, { status: 502 });
  }
  return new Response(upstream.body, { status: upstream.status, headers: cleanResponseHeaders(upstream, filename) });
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
    const matches = findMatchingYears(targetYear, { fromYear: targetYear - 120, toYear: targetYear - 1 });
    return new Response(
      JSON.stringify({
        today: today.render('en'),
        targetYear,
        kviusSignature: kviusSignature(targetYear),
        kviusCode: kviusCode(targetYear),
        matchingYears: matches,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.pathname === '/api/kvius/matches') {
    const year = Number(url.searchParams.get('year')) || new HDate(new Date()).getFullYear();
    const matches = findMatchingYears(year, { fromYear: year - 120, toYear: year - 1 });
    return new Response(
      JSON.stringify({
        targetYear: year,
        kviusSignature: kviusSignature(year),
        kviusCode: kviusCode(year),
        matchingYears: matches,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.pathname === '/api/kvius/schedule') {
    const today = new HDate(new Date());
    const targetYear = Number(url.searchParams.get('target')) || today.getFullYear();
    const matches = findMatchingYears(targetYear, { fromYear: targetYear - 120, toYear: targetYear - 1 });
    const defaultSource = matches[0]?.hebrewYear ?? targetYear - 40;
    const sourceYear = Number(url.searchParams.get('source')) || defaultSource;

    const schedule = buildMatchedSchedule(targetYear, sourceYear, {
      il: false,
      gapStrategy: 'nearestKviusYear',
      hasRecording: () => true,
      matchingYearsRange: { fromYear: targetYear - 120, toYear: targetYear - 1 },
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
        targetSignature: kviusSignature(targetYear),
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
  const code = kviusCode(targetYear);
  const matches = findMatchingYears(targetYear, { fromYear: targetYear - 120, toYear: targetYear - 1 });
  const sourceYear = matches[0]?.hebrewYear ?? (targetYear - 40);

  const schedule = buildMatchedSchedule(targetYear, sourceYear, {
    il: false,
    gapStrategy: 'nearestKviusYear',
    hasRecording: () => true,
    matchingYearsRange: { fromYear: targetYear - 120, toYear: targetYear - 1 },
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sichos Kodesh — Kvius Matching & Media Engine</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-hover: #0284c7;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
    }
    .container {
      max-width: 1080px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    h1 .subtitle {
      font-size: 16px;
      font-weight: 400;
      color: var(--accent);
      background: rgba(56, 189, 248, 0.1);
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    p.lead {
      color: var(--text-muted);
      margin-top: 8px;
      font-size: 15px;
      max-width: 800px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .card h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 14px;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { color: var(--text-muted); }
    .stat-value { font-weight: 600; font-family: monospace; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-success { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    select, input, button {
      background: #0f172a;
      border: 1px solid var(--border);
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 14px;
      width: 100%;
      margin-top: 6px;
    }
    select:focus, input:focus {
      outline: none;
      border-color: var(--accent);
    }
    button {
      background: var(--accent);
      color: #0f172a;
      font-weight: 600;
      cursor: pointer;
      margin-top: 12px;
      transition: background 0.15s;
    }
    button:hover {
      background: var(--accent-hover);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      margin-top: 10px;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: rgba(15, 23, 42, 0.5);
      color: var(--text-muted);
      font-weight: 600;
    }
    .table-container {
      max-height: 420px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .player-box {
      margin-top: 12px;
    }
    audio {
      width: 100%;
      margin-top: 10px;
    }
    .quick-chips {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .chip {
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent);
      font-family: monospace;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
    }
    .chip:hover {
      background: rgba(56, 189, 248, 0.2);
    }
    code {
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      color: var(--accent);
    }
    .api-list {
      list-style: none;
      margin-top: 8px;
    }
    .api-list li {
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 13px;
    }
    .api-list a {
      color: var(--accent);
      text-decoration: none;
    }
    .api-list a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>
        Sichos Kodesh
        <span class="subtitle">שיחות קודש</span>
      </h1>
      <p class="lead">
        Offline-first scheduling engine & media proxy for the Lubavitcher Rebbe's recorded Sichos Kodesh and Farbrengens.
        Follow along with a chosen historical Hebrew year, mapped week-by-week using live kvius-matching.
      </p>
    </header>

    <div class="grid">
      <!-- Calendar Card -->
      <div class="card">
        <h2>
          <span>Kvius Calendar</span>
          <span class="badge badge-success">Live Engine</span>
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
          <span class="stat-value" id="current-kvius-sig">${signature}</span>
        </div>

        <div style="margin-top: 14px;">
          <label style="font-size: 13px; color: var(--text-muted);" for="source-year-select">
            Follow Historical Year:
          </label>
          <select id="source-year-select">
            ${matchOptions}
          </select>
        </div>
      </div>

      <!-- Media Proxy Card -->
      <div class="card">
        <h2>
          <span>Media Proxy</span>
          <span class="badge badge-success">CloudFront & Drive</span>
        </h2>
        <p style="font-size: 13px; color: var(--text-muted);">
          Stream JEM audio recordings or proxy Drive hanacha PDFs with range seeking:
        </p>

        <div class="player-box">
          <label style="font-size: 13px; color: var(--text-muted);" for="audio-filename">JEM Audio Filename:</label>
          <input type="text" id="audio-filename" value="JEMSK0001.mp3" placeholder="e.g. JEMSK0001.mp3" />
          
          <div class="quick-chips">
            <span class="chip" onclick="setAudioFile('JEMSK0001.mp3')">JEMSK0001.mp3</span>
            <span class="chip" onclick="setAudioFile('AR0017467.m4a')">AR0017467.m4a</span>
            <span class="chip" onclick="setAudioFile('AR0016451.opus')">AR0016451.opus</span>
          </div>

          <audio id="audio-player" controls preload="none" src="/jem-audio/JEMSK0001.mp3"></audio>
          
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button type="button" onclick="playAudio()" style="margin-top:0;">Load & Play</button>
            <button type="button" onclick="downloadAudio()" style="margin-top:0; background: #334155; color: #fff;">Direct Link</button>
          </div>
        </div>
      </div>

      <!-- API Card -->
      <div class="card">
        <h2>
          <span>Active Endpoints</span>
          <span class="badge badge-success">HTTP & JSON</span>
        </h2>
        <ul class="api-list">
          <li><code>GET /drive/:fileId</code> &mdash; Proxies Google Drive PDF scans</li>
          <li><code>GET /jem-audio/:filename</code> &mdash; Proxies seekable JEM audio CDN</li>
          <li><a href="/api/kvius/today" target="_blank"><code>GET /api/kvius/today</code></a> &mdash; Current year & matching years</li>
          <li><a href="/api/kvius/schedule?target=${targetYear}&source=${sourceYear}" target="_blank"><code>GET /api/kvius/schedule</code></a> &mdash; Matched schedule JSON</li>
          <li><a href="/api/status" target="_blank"><code>GET /api/status</code></a> &mdash; Service health & diagnostic</li>
        </ul>
      </div>
    </div>

    <!-- Fixed-Date Occasions -->
    <div class="card" style="margin-bottom: 24px;">
      <h2>Chabad Fixed-Date Occasions (${targetYear} &rarr; ${sourceYear})</h2>
      <div class="table-container">
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

    <!-- Weekly Matched Schedule -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
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

  <script>
    function setAudioFile(name) {
      document.getElementById('audio-filename').value = name;
      playAudio();
    }
    function playAudio() {
      const name = document.getElementById('audio-filename').value.trim();
      if (!name) return;
      const player = document.getElementById('audio-player');
      player.src = '/jem-audio/' + encodeURIComponent(name);
      player.play().catch(function(e) { console.log('Autoplay prevented:', e); });
    }
    function downloadAudio() {
      const name = document.getElementById('audio-filename').value.trim();
      if (!name) return;
      window.open('/jem-audio/' + encodeURIComponent(name), '_blank');
    }

    const sourceSelect = document.getElementById('source-year-select');
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
            const statusBadge = w.resolution.status === 'matched'
              ? '<span class="badge badge-success">matched</span>'
              : (w.resolution.status === 'nearestKviusYear'
                ? '<span class="badge badge-warning">fallback</span>'
                : '<span class="badge badge-danger">gap</span>');
            wHtml += '<tr><td>' + w.weekIndex + '</td><td><strong>' + what + '</strong></td><td>' + w.gregorianDate + '</td><td>' + (w.resolution.resolvedYear || '-') + '</td><td>' + statusBadge + '</td></tr>';
          }
          document.getElementById('weekly-table-body').innerHTML = wHtml;

          let fHtml = '';
          for (let j = 0; j < fixed.length; j++) {
            const f = fixed[j];
            const statusBadge = f.resolution.status === 'matched'
              ? '<span class="badge badge-success">matched</span>'
              : (f.resolution.status === 'nearestKviusYear'
                ? '<span class="badge badge-warning">fallback</span>'
                : '<span class="badge badge-danger">gap</span>');
            fHtml += '<tr><td><strong>' + f.label + '</strong></td><td>' + f.gregorianDate + '</td><td>' + (f.resolution.resolvedYear || '-') + '</td><td>' + statusBadge + '</td></tr>';
          }
          document.getElementById('fixed-table-body').innerHTML = fHtml;
        })
        .catch(function(err) { console.error('Failed to load schedule:', err); });
    });
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
      response = await handleDrive(driveMatch[1]!, url.searchParams.get('filename'));
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
