import type { DeviceFile, HaveFile } from '@sichos-kodesh/pack-format';
import { HAVE_SCHEMA_VERSION } from '@sichos-kodesh/pack-format';
import { catalogStore } from '../catalog/catalogStore';
import { reconcileStoredDownloads } from '../download/downloadStorage';
import { APP_VERSION } from '../version';
import type { HeldObject } from './objectStore';
import { documentPath, readTrustedObjectsIndex, recordHeldObjects, reconcileHeldObjects } from './objectStore';
import type { PacksNativeModule } from './packsNative';
import { IMPORTABLE_AUDIO_PROFILES } from './placement';

/**
 * `state/have.json` and `state/device.json` in the shared folder: what the
 * yeshiva station reads over USB to copy only what a phone lacks
 * (pack-format's have.ts). No server ever sees them.
 */

export const STATE_DIR = 'state';

/**
 * Brings the object store up to date with what the downloader fetched:
 * each downloaded file not yet in the store is hashed once, natively. The
 * first run after an update hashes the phone's existing downloads (the
 * one-time migration of the plan); later runs hash only new downloads.
 */
export async function hashNewDownloads(native: PacksNativeModule): Promise<number> {
  const held = await reconcileHeldObjects();
  const heldFiles = new Set(Object.values(held).map((object) => object.file));
  const prefix = `${documentPath('')}`;
  const records = await reconcileStoredDownloads();
  const index = await readTrustedObjectsIndex();
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const added: HeldObject[] = [];
  for (const record of records) {
    if (!record.localPath.startsWith(prefix)) continue;
    const file = record.localPath.slice(prefix.length);
    if (heldFiles.has(file) || seen.has(file)) continue;
    seen.add(file);
    const sourceId = record.kind === 'audio' ? record.workerFilename : record.driveFileId;
    if (!sourceId) continue;
    try {
      const { sha256, bytes } = await native.hashFile(record.localPath);
      const known = index?.objects[sha256];
      added.push({
        sha256,
        bytes,
        kind: record.kind,
        ...(record.kind === 'audio' ? { profile: 'src' as const } : {}),
        sourceId,
        file,
        collection: known?.collection ?? 'farbrengens',
        itemId: known?.itemId ?? String(record.occasionId),
        source: 'download',
        verified: true,
        addedAt: now,
      });
    } catch {
      // A file that cannot be read now is hashed on a later run.
    }
  }
  await recordHeldObjects(added);
  return added.length;
}

export function buildHaveFile(held: Record<string, HeldObject>, catalogVersion: string, now: Date): HaveFile {
  return {
    schema: HAVE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    catalogVersion,
    profiles: [...IMPORTABLE_AUDIO_PROFILES],
    writtenAt: now.toISOString(),
    objects: Object.keys(held).sort(),
  };
}

/** Writes both files into `state/` of the shared folder. */
export async function writeStateFiles(native: PacksNativeModule, treeUri: string, lastImportAt?: string): Promise<{ objects: number }> {
  await hashNewDownloads(native);
  const held = await reconcileHeldObjects();
  const have = buildHaveFile(held, catalogStore.get().version, new Date());
  const info = await native.deviceInfo();
  const device: DeviceFile = {
    schema: HAVE_SCHEMA_VERSION,
    model: info.model,
    androidVersion: info.androidVersion,
    appVersion: APP_VERSION,
    freeBytes: info.freeBytes,
    ...(lastImportAt ? { lastImportAt } : {}),
  };
  await native.writeFolderText(treeUri, STATE_DIR, 'have.json', `${JSON.stringify(have)}\n`);
  await native.writeFolderText(treeUri, STATE_DIR, 'device.json', `${JSON.stringify(device, null, 2)}\n`);
  return { objects: have.objects.length };
}
