import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { worksJson } from '../generated/release';
import { TEXTS_PATH, handleRequest } from '../src/router';

const serviceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const textsDir = path.join(serviceRoot, 'public', 'v3', 'texts');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('hosted texts', () => {
  it('writes each text at its own sha256, and every text the works name for a source other than Sefaria is there', () => {
    expect(existsSync(textsDir)).toBe(true);
    const files = new Set(readdirSync(textsDir));
    expect(files.size).toBeGreaterThan(0);
    for (const name of [...files].slice(0, 200)) expect(sha256(readFileSync(path.join(textsDir, name)))).toBe(name);

    const works = JSON.parse(worksJson) as { works: Array<{ id: string; sources: Array<{ source: string }> }>; contents: Record<string, { units: Array<{ id: string; editions: Array<{ source: number; sha256?: string; bytes?: number }> }> }> };
    let hosted = 0;
    for (const work of works.works) {
      for (const unit of works.contents[work.id]?.units ?? []) {
        for (const edition of unit.editions) {
          if (!edition.sha256 || work.sources[edition.source]?.source === 'sefaria') continue;
          hosted += 1;
          expect(files.has(edition.sha256)).toBe(true);
          if (hosted <= 50) expect(readFileSync(path.join(textsDir, edition.sha256)).byteLength).toBe(edition.bytes);
        }
      }
    }
    expect(hosted).toBe(files.size);
  });

  it('names where they are in the index', () => {
    const response = handleRequest('GET', '/', 'https://preview.example.test');
    expect(JSON.parse(new TextDecoder().decode(response.body!))).toMatchObject({ texts: TEXTS_PATH });
    expect(TEXTS_PATH).toBe('/v3/texts/<sha256>');
  });
});
