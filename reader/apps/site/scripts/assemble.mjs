#!/usr/bin/env node
/**
 * Puts the two built sites into one directory for the Worker's static files
 * (wrangler.toml): the web app (apps/web/dist) at the root, the download site
 * (apps/download/dist, built with base /get/) under get/. Run after both are
 * built; `npm run build` does all three.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apps = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(apps, 'site', 'dist');
const web = path.join(apps, 'web', 'dist');
const download = path.join(apps, 'download', 'dist');
for (const dir of [web, download]) if (!existsSync(path.join(dir, 'index.html'))) throw new Error(`${dir} is not built`);
if (existsSync(path.join(web, 'get'))) throw new Error('apps/web/dist has its own get/, which the download site needs');

rmSync(out, { recursive: true, force: true });
cpSync(web, out, { recursive: true });
cpSync(download, path.join(out, 'get'), { recursive: true });
console.log(`site: ${out} (web app at /, download site at /get/)`);
