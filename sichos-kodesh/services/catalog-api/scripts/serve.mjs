#!/usr/bin/env node
/**
 * Local stand-in for the Vercel function: `npm run dev` after `npm run build`
 * serves the same router on http://localhost:8788 (curl it, or point an app's
 * CATALOG_API_BASE_URL at it). Uses tsx to load the TypeScript directly.
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { tsImport } = await import('tsx/esm/api');
const { default: handler } = await tsImport(pathToFileURL(path.join(here, '..', 'api', 'index.ts')).href, import.meta.url);

const port = Number(process.env.PORT ?? 8788);
createServer((req, res) => handler(req, res)).listen(port, () => {
  console.log(`catalog-api listening on http://localhost:${port}/v1/catalog/manifest.json`);
});
