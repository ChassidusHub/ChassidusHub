import { unlink } from 'node:fs/promises';
import { nowIso } from './db.js';
import { ArchiveStore, hashFile } from './store.js';

/**
 * Integrity: re-hash stored objects and compare with their names. Weekly
 * on a random 2%, quarterly in full. A mismatch or a missing file is
 * recorded, the bad bytes are discarded, and every source that produced
 * the object goes back to `error`, so the next crawl fetches it again and
 * `putObject` puts the bytes back. The object row and its refs stay: like
 * a Git object that failed fsck, its identity is still what the items
 * point at - only the bytes are lost, and only until the next crawl.
 */

export interface VerifyOptions {
  /** 0 < sample <= 1; 1 is a full scrub. */
  sample?: number;
  log?: (line: string) => void;
}

export interface VerifyResult {
  checked: number;
  ok: number;
  missing: string[];
  corrupt: string[];
}

export async function verify(store: ArchiveStore, options: VerifyOptions = {}): Promise<VerifyResult> {
  const sample = options.sample ?? 0.02;
  const rows = store.db.prepare('SELECT sha256, bytes FROM objects ORDER BY sha256').all() as Array<{ sha256: string; bytes: number }>;
  const chosen = sample >= 1 ? rows : rows.filter(() => Math.random() < sample);
  const result: VerifyResult = { checked: 0, ok: 0, missing: [], corrupt: [] };
  const record = store.db.prepare('INSERT OR REPLACE INTO verifications (sha256, verified_at, ok) VALUES (?, ?, ?)');
  const sendBack = store.db.prepare("UPDATE sources SET status = 'error', error = ? WHERE sha256 = ? AND status = 'ok'");
  for (const row of chosen) {
    result.checked += 1;
    const path = store.objectPath(row.sha256);
    let outcome: 'ok' | 'missing' | 'corrupt';
    try {
      const hashed = await hashFile(path);
      outcome = hashed.sha256 === row.sha256 && hashed.bytes === row.bytes ? 'ok' : 'corrupt';
    } catch {
      outcome = 'missing';
    }
    record.run(row.sha256, nowIso(), outcome === 'ok' ? 1 : 0);
    if (outcome === 'ok') {
      result.ok += 1;
      continue;
    }
    (outcome === 'missing' ? result.missing : result.corrupt).push(row.sha256);
    if (outcome === 'corrupt') await unlink(path).catch(() => undefined);
    const { changes } = sendBack.run(`verify: ${outcome}`, row.sha256);
    options.log?.(`${outcome}: ${row.sha256}${changes ? '' : ' (no upstream source to re-fetch from)'}`);
  }
  return result;
}
