import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { createRequestListener } from '@react-router/node';
import type { ServerBuild } from 'react-router';

/**
 * The built site on Node, for the browser tests in CI and for trying a build
 * locally: the same server build the Worker runs, and build/client served as
 * Workers assets would serve it. `PORT` picks the port (default 3001).
 */
const root = path.resolve(import.meta.dirname, '..');
const client = path.join(root, 'build/client');
// @ts-ignore - made by `react-router build`
const build = (await import('../build/server/index.js')) as unknown as ServerBuild;
const pages = createRequestListener({ build });

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
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
  const file = path.join(client, pathname);
  if (file.startsWith(client + path.sep) && existsSync(file) && statSync(file).isFile()) {
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    if (pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(file).pipe(res);
    return;
  }
  void pages(req, res);
}).listen(Number(process.env.PORT ?? 3001));
