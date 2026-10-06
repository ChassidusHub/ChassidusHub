import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { AudioProfile, ObjectKind } from '@chassidushub-reader/pack-format';
import { nowIso, openDb, type Db } from './db.js';

/**
 * The archive on disk:
 *
 *   <root>/raw/objects/<aa>/<sha256>   every upstream file, immutable
 *   <root>/raw/index.sqlite            the versioned store (schema.ts)
 *   <root>/raw/tmp/                    downloads in flight (.part files)
 *   <root>/derived/<profile>/          encoded audio (services/pack-builder)
 *   <root>/packs/                      built packs (services/pack-builder)
 *   <root>/catalog/                    catalog snapshots per release
 */
export class ArchiveStore {
  readonly root: string;
  readonly db: Db;

  private constructor(root: string, db: Db) {
    this.root = root;
    this.db = db;
  }

  static async open(root: string): Promise<ArchiveStore> {
    for (const dir of ['raw/objects', 'raw/tmp', 'derived', 'packs', 'catalog', 'keys']) {
      await mkdir(path.join(root, dir), { recursive: true });
    }
    return new ArchiveStore(root, openDb(path.join(root, 'raw', 'index.sqlite')));
  }

  close(): void {
    this.db.close();
  }

  objectPath(sha256: string): string {
    return path.join(this.root, 'raw', 'objects', sha256.slice(0, 2), sha256);
  }

  tmpPath(): string {
    return path.join(this.root, 'raw', 'tmp', `${randomBytes(8).toString('hex')}.part`);
  }

  /** Whether the store knows this object (its row); `objectExistsOnDisk` says whether the bytes are here right now. */
  hasObject(sha256: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM objects WHERE sha256 = ?').get(sha256);
  }

  /** Opens a commit; the caller adds objects/refs under it. Bot commits go straight to main. */
  beginCommit(author: string, message: string, status: 'main' | 'pending' = 'main'): string {
    const parent = (this.db.prepare("SELECT id FROM commits WHERE status = 'main' ORDER BY created_at DESC, rowid DESC LIMIT 1").get() as { id: string } | undefined)?.id ?? null;
    const id = randomBytes(16).toString('hex');
    this.db.prepare('INSERT INTO commits (id, parent, author, message, created_at, status) VALUES (?, ?, ?, ?, ?, ?)').run(id, parent, author, message, nowIso(), status);
    return id;
  }

  /**
   * Moves a fully downloaded, already hashed file into the object store and
   * records it. Returns whether bytes were placed: false when the object's
   * file is already on disk (the caller discards its copy). A known object
   * whose bytes went missing or failed `verify` gets them back this way -
   * the row and its refs are history and never go away, like a Git object
   * that failed fsck: the items still point at that hash.
   */
  async putObject(tmpFile: string, sha256: string, bytes: number, kind: ObjectKind, profile: AudioProfile | null, mime: string | null, commitId: string): Promise<boolean> {
    const dest = this.objectPath(sha256);
    const onDisk = await this.objectExistsOnDisk(sha256);
    if (!onDisk) {
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(tmpFile, dest);
    }
    this.db.prepare('INSERT OR IGNORE INTO objects (sha256, bytes, kind, profile, mime, commit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(sha256, bytes, kind, profile, mime, commitId, nowIso());
    // Freshly hashed bytes are a verification too, so `stats` stops counting the object as lost.
    this.db.prepare('INSERT OR REPLACE INTO verifications (sha256, verified_at, ok) VALUES (?, ?, 1)').run(sha256, nowIso());
    return !onDisk;
  }

  /** Where an encoded recording lives: `derived/<profile>/<aa>/<sha256>`. */
  derivedPath(profile: AudioProfile, sha256: string): string {
    return path.join(this.root, 'derived', profile, sha256.slice(0, 2), sha256);
  }

  /**
   * Where an object's bytes are: an upstream original under raw/, or an
   * encoded profile under derived/. Null for a hash the store does not know.
   */
  pathOf(sha256: string): string | null {
    if (this.hasObject(sha256)) return this.objectPath(sha256);
    const row = this.db.prepare('SELECT profile FROM derivations WHERE sha256 = ? LIMIT 1').get(sha256) as { profile: AudioProfile } | undefined;
    return row ? this.derivedPath(row.profile, sha256) : null;
  }

  /**
   * Records an original's encoding in `profile` and moves the encoded file
   * into place (or drops it, when identical bytes are already there).
   */
  async putDerived(tmpFile: string, srcSha256: string, profile: AudioProfile, sha256: string, bytes: number, encoder: string): Promise<void> {
    const dest = this.derivedPath(profile, sha256);
    if (await exists(dest)) await unlink(tmpFile);
    else {
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(tmpFile, dest);
    }
    this.db
      .prepare('INSERT OR REPLACE INTO derivations (src_sha256, profile, sha256, bytes, encoder, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(srcSha256, profile, sha256, bytes, encoder, nowIso());
  }

  async objectExistsOnDisk(sha256: string): Promise<boolean> {
    try {
      await stat(this.objectPath(sha256));
      return true;
    } catch {
      return false;
    }
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export async function hashFile(file: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), bytes };
}
