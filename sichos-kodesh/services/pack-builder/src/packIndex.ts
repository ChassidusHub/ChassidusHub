import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { PackIndexEntry, PackIndexFile } from '@sichos-kodesh/pack-format';
import { MANIFEST_ENTRY_NAME, PACK_EXTENSION, PACK_INDEX_SCHEMA_VERSION, parsePackManifest } from '@sichos-kodesh/pack-format';
import { readEntry, readZipDirectory } from './zip.js';

/**
 * index.json: one line per built pack - its id, file, size, hash, catalog
 * version, profile, scope and object list - so the download site can offer
 * prebuilt packs and the station can compute a phone's delta without
 * downloading a single pack.
 */

async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function indexPacks(dir: string, now: () => Date = () => new Date()): Promise<{ index: PackIndexFile; skipped: string[] }> {
  const files = (await readdir(dir)).filter((name) => name.endsWith(PACK_EXTENSION)).sort();
  const packs: PackIndexEntry[] = [];
  const skipped: string[] = [];
  for (const name of files) {
    const file = path.join(dir, name);
    try {
      const entries = await readZipDirectory(file);
      const manifestEntry = entries.find((e) => e.name === MANIFEST_ENTRY_NAME);
      const manifest = manifestEntry ? parsePackManifest(JSON.parse((await readEntry(file, manifestEntry)).toString('utf8'))) : null;
      if (!manifest) {
        skipped.push(`${name}: no valid manifest`);
        continue;
      }
      const { size } = await stat(file);
      const entry: PackIndexEntry = {
        packId: manifest.packId,
        file: name,
        bytes: size,
        sha256: await hashFile(file),
        catalogVersion: manifest.catalogVersion,
        profile: manifest.profile.audio,
        scope: manifest.scope,
        objects: manifest.objects,
      };
      if (manifest.part) entry.part = manifest.part;
      packs.push(entry);
    } catch (error) {
      skipped.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { index: { schema: PACK_INDEX_SCHEMA_VERSION, builtAt: now().toISOString(), packs }, skipped };
}
