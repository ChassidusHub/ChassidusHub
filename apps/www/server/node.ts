import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { createRequestListener } from '@react-router/node';
import type { ServerBuild } from 'react-router';
import { apiFor, forwardFor, visitorApi } from '../app/lib/api';
import { pageContext } from '../app/serverOnly';
import { memoryShowcases } from '../app/stewards/showcase';

/**
 * The built site on Node, for the browser tests in CI and for trying a build
 * locally: the same server build the Worker runs, and build/client served as
 * Workers assets would serve it. `PORT` picks the port (default 3001);
 * `API_URL` the API pages read from (default https://api.chassidushub.org).
 */
const root = path.resolve(import.meta.dirname, '..');
const client = path.join(root, 'build/client');
// @ts-ignore - made by `react-router build`
const build = (await import('../build/server/index.js')) as unknown as ServerBuild;
const api = apiFor({ baseUrl: process.env.API_URL });
const forward = forwardFor({ baseUrl: process.env.API_URL });
// Showcases are kept in memory here: this is the site for local work and the browser tests.
const showcases = memoryShowcases();
const pages = createRequestListener({ build, getLoadContext: (request) => ({ api, visitor: visitorApi(request, (cookie) => apiFor({ baseUrl: process.env.API_URL, cookie })), forward, showcases, ...pageContext(request) }) });

const types: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

createServer((req, res) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
  } catch {
    // A broken % escape is no file; the pages answer it.
    void pages(req, res);
    return;
  }
  const file = path.join(client, pathname);
  if (file.startsWith(client + path.sep) && existsSync(file) && statSync(file).isFile()) {
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    if (pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(file).pipe(res);
    return;
  }
  void pages(req, res);
}).listen(Number(process.env.PORT ?? 3001));
