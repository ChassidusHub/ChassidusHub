#!/usr/bin/env node
/**
 * Local stand-in for the Vercel function: `npm run dev` after `npm run build`
 * serves the same router on http://localhost:8788 (curl it, or point an app's
 * CATALOG_API_BASE_URL at it). Uses tsx to load the TypeScript directly.
 * The hosted texts (public/v3/texts, static files on Vercel) are served
 * from disk, with the headers vercel.json gives them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { tsImport } = await import('tsx/esm/api');
const { default: handler } = await tsImport(pathToFileURL(path.join(here, '..', 'src', 'handler.ts')).href, import.meta.url);

const port = Number(process.env.PORT ?? 8788);
const textsDir = path.join(here, '..', 'public', 'v3', 'texts');
createServer((req, res) => {
  const text = /^\/v3\/texts\/([0-9a-f]{64})$/.exec(req.url ?? '');
  if (text && existsSync(path.join(textsDir, text[1]))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' });
    res.end(readFileSync(path.join(textsDir, text[1])));
    return;
  }
  handler(req, res);
}).listen(port, () => {
  console.log(`catalog-api listening on http://localhost:${port}/v1/catalog/manifest.json`);
});
