import type { AudioProfile, CollectionId, ObjectKind, ObjectsIndex, PackManifest } from '@sichos-kodesh/pack-format';
import { buildSourceLookup, identifyFile, importPlan, objectEntryName, sha256FromEntryName, sourceKey } from '@sichos-kodesh/pack-format';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import { getCatalog } from '../catalog/catalogStore';
import { upsertStoredDownloads } from '../download/downloadStorage';
import { allCatalogEntries, catalogKnowsSource, targetsBySourceId } from './catalogTargets';
import type { HeldObject } from './objectStore';
import { documentPath, readTrustedObjectsIndex, recordHeldObjects } from './objectStore';
import type { PhoneState } from './packImport';
import { readPhoneState } from './packImport';
import type { PacksNativeModule, StagedFile } from './packsNative';
import { objectFileName } from './placement';

/**
 * Shared ZIPs and folders (docs/offline-plan.md WP4 item 4): what bochurim
 * pass around, an unsigned pack, or another phone's export. Every file is
 * copied into a staging area and hashed natively, then:
 *
 * - a hash the trusted objects index knows is the right bytes by
 *   definition, whatever the file was called: it is stored;
 * - a file named like a JEM recording (`JEMSK####A.mp3`, `AR#######.mp3`)
 *   or carrying a Drive id is kept only when the catalog lists that id,
 *   when the objects index does not say those bytes are wrong, and when
 *   the phone has no file for it yet. It is recorded as unverified, so a
 *   signed pack's copy replaces it later;
 * - a pack whose signature this build does not trust (unsigned, or signed
 *   with a key this build does not know) is read the same way: its
 *   manifest only names each `objects/<sha256>` entry, like a file name
 *   would, and the entry's bytes must hash to its name;
 * - everything else is skipped and counted.
 *
 * The ZIP's own `manifest.json` or `objects.json` never vouches for bytes:
 * only an index that arrived inside a signed pack does (objectStore.ts).
 */

export interface LooseObject {
  sha256: string;
  bytes: number;
  kind: ObjectKind;
  profile?: AudioProfile;
  sourceId: string;
  file: string;
  collection?: CollectionId;
  itemId?: string;
}

/** What an untrusted manifest says each object entry is: a name, no more. */
export interface NameHint {
  kind: ObjectKind;
  sourceId: string;
  profile?: AudioProfile;
}

export function nameHintsFrom(manifest: PackManifest | null | undefined): Map<string, NameHint> {
  const hints = new Map<string, NameHint>();
  for (const entry of manifest?.entries ?? []) {
    for (const ref of entry.refs) {
      const hint: NameHint = { kind: ref.kind, sourceId: ref.sourceId };
      if (ref.kind === 'audio') hint.profile = ref.profile ?? manifest!.profile.audio;
      hints.set(objectEntryName(ref.sha256), hint);
    }
  }
  return hints;
}

export interface LoosePlan {
  commit: Array<{ staged: StagedFile; object: LooseObject; verified: boolean }>;
  /** Already on the phone. */
  present: number;
  /** Known objects in an audio profile this build does not take. */
  unsupported: number;
  /** Named like an upstream file, but the objects index says the bytes are not that file's. */
  mismatched: number;
  /** Neither known by hash nor placeable by name. */
  unrecognized: number;
}

const IGNORED_NAMES = /(^|\/)(manifest\.json|objects\.json|catalog\.json|\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

/** Pure: what to keep of a staged ZIP or folder. */
export function planLooseImport(staged: StagedFile[], index: ObjectsIndex | null, phone: PhoneState, catalogEntries: CatalogEntry[], hints: Map<string, NameHint> = new Map()): LoosePlan {
  const plan: LoosePlan = { commit: [], present: 0, unsupported: 0, mismatched: 0, unrecognized: 0 };
  const files = staged.filter((file) => !IGNORED_NAMES.test(file.path) && file.bytes > 0);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const listing = files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 }));
  const held = new Set(phone.held.keys());
  const base = importPlan(listing, index, held);
  const lookup = index ? buildSourceLookup(index) : null;
  const claimed = new Set<string>();
  plan.present += base.held;

  for (const item of base.store) {
    const stagedFile = byPath.get(item.path)!;
    const file = objectFileName(item.entry.kind, item.entry.sourceId, item.entry.profile);
    if (!file) {
      if (item.entry.kind === 'audio' && (item.entry.profile ?? 'src') !== 'src') plan.unsupported += 1;
      else plan.unrecognized += 1;
      continue;
    }
    const size = phone.fileSizes.get(file);
    if (claimed.has(file) || (size === item.bytes && !phone.unverifiedFiles.has(file))) {
      plan.present += 1;
      continue;
    }
    claimed.add(file);
    const object: LooseObject = { sha256: item.sha256, bytes: stagedFile.bytes, kind: item.entry.kind, sourceId: item.entry.sourceId, file, collection: item.entry.collection, itemId: item.entry.itemId };
    if (item.entry.profile) object.profile = item.entry.profile;
    plan.commit.push({ staged: stagedFile, object, verified: true });
  }

  // An unknown `objects/<sha256>` entry the untrusted manifest names, with bytes that match that name, counts as named.
  const guessed: Array<{ path: string; kind: 'audio' | 'pdf'; sourceId: string }> = [...base.guessed];
  for (const item of base.unknown) {
    const hint = hints.get(item.path);
    const named = sha256FromEntryName(item.path);
    if (!hint || !named || named !== byPath.get(item.path)?.sha256 || hint.kind === 'text') {
      plan.unrecognized += 1;
      continue;
    }
    if (hint.kind === 'audio' && (hint.profile ?? 'src') !== 'src') {
      plan.unsupported += 1;
      continue;
    }
    guessed.push({ path: item.path, kind: hint.kind, sourceId: hint.sourceId });
  }

  for (const item of guessed) {
    const stagedFile = byPath.get(item.path)!;
    const file = objectFileName(item.kind, item.sourceId, 'src');
    if (!file || !catalogKnowsSource(catalogEntries, item.kind, item.sourceId)) {
      plan.unrecognized += 1;
      continue;
    }
    const archived = lookup?.get(sourceKey(item.kind, item.sourceId, 'src'));
    if (archived && archived !== stagedFile.sha256) {
      plan.mismatched += 1;
      continue;
    }
    if (claimed.has(file) || phone.fileSizes.has(file)) {
      plan.present += 1;
      continue;
    }
    claimed.add(file);
    const object: LooseObject = { sha256: stagedFile.sha256, bytes: stagedFile.bytes, kind: item.kind, sourceId: item.sourceId, file };
    if (item.kind === 'audio') object.profile = 'src';
    plan.commit.push({ staged: stagedFile, object, verified: false });
  }

  return plan;
}

/** The files each staged file might become, for reading their sizes before planning. */
export function candidateFiles(staged: StagedFile[], index: ObjectsIndex | null, hints: Map<string, NameHint> = new Map()): string[] {
  const files: string[] = [];
  for (const file of staged) {
    const id = identifyFile({ path: file.path, bytes: file.bytes, sha256: file.sha256 }, index);
    const hint = hints.get(file.path);
    const name =
      id.status === 'known'
        ? objectFileName(id.entry.kind, id.entry.sourceId, id.entry.profile)
        : id.status === 'guessed'
          ? objectFileName(id.kind, id.sourceId, 'src')
          : hint
            ? objectFileName(hint.kind, hint.sourceId, hint.profile)
            : null;
    if (name) files.push(name);
  }
  return files;
}

export interface LooseImportOutcome {
  added: number;
  addedBytes: number;
  present: number;
  unsupported: number;
  mismatched: number;
  unrecognized: number;
  failed: number;
}

export type LooseSource = { kind: 'zip'; uri: string } | { kind: 'folder'; treeUri: string };

/** `untrustedManifest`: the manifest of a pack whose signature is not trusted, read only as names for its entries. */
export async function importLoose(native: PacksNativeModule, source: LooseSource, jobId: string, untrustedManifest?: PackManifest | null): Promise<LooseImportOutcome> {
  try {
    const staged = source.kind === 'zip' ? await native.stageZip(source.uri, jobId) : await native.stageFolder(source.treeUri, jobId);
    const index = await readTrustedObjectsIndex();
    const hints = nameHintsFrom(untrustedManifest);
    const phone = await readPhoneState(candidateFiles(staged, index, hints));
    const entries = allCatalogEntries(getCatalog());
    const plan = planLooseImport(staged, index, phone, entries, hints);

    const now = new Date().toISOString();
    const committed: HeldObject[] = [];
    let failed = 0;
    for (const { staged: stagedFile, object, verified } of plan.commit) {
      try {
        await native.commitStaged(stagedFile.staged, object.file);
        committed.push({ ...object, source: 'shared', verified, addedAt: now });
      } catch {
        failed += 1;
      }
    }
    await recordHeldObjects(committed);

    if (committed.length > 0) {
      const bySource = targetsBySourceId(entries);
      const records: Array<{ target: DownloadTarget; localPath: string }> = [];
      for (const object of committed) {
        for (const target of bySource.get(object.sourceId) ?? []) records.push({ target, localPath: documentPath(object.file) });
      }
      await upsertStoredDownloads(records);
    }

    return {
      added: committed.length,
      addedBytes: committed.reduce((sum, object) => sum + object.bytes, 0),
      present: plan.present,
      unsupported: plan.unsupported,
      mismatched: plan.mismatched,
      unrecognized: plan.unrecognized,
      failed,
    };
  } finally {
    await native.clearStaging().catch(() => undefined);
  }
}
