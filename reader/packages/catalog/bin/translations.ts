#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_HISTORICAL_YEAR } from '@chassidushub-reader/kvius-engine';
import { translateChapterName } from '../src/translate/chapterNameHe.js';
import { translateOccasionLabel } from '../src/translate/occasionLabelEn.js';

/**
 * How much of the catalog the display translations cover (see
 * src/translate/): every distinct occasion label (-> English) and JEM
 * chapter name (-> Hebrew) of the years the apps bundle, counted once and by
 * how often it occurs, and the ones the rules leave untranslated - the list
 * to work from when extending the dictionaries after a re-crawl.
 *
 *   npm run translation-coverage -w @chassidushub-reader/catalog -- --db ../mafteiach-index/mafteiach.db
 *
 *   --db <path>   mafteiach.db (default: packages/mafteiach-index/mafteiach.db)
 *   --all         print every translation, not only the ones missing
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const db = new DatabaseSync(arg('db', path.join(__dirname, '..', '..', 'mafteiach-index', 'mafteiach.db')), { readOnly: true });
const showAll = process.argv.includes('--all');

function report(title: string, rows: Array<{ text: string; n: number }>, translate: (text: string) => string | null): void {
  let distinct = 0;
  let occurrences = 0;
  let total = 0;
  const missing: string[] = [];
  const all: string[] = [];
  for (const { text, n } of rows) {
    total += n;
    const translated = translate(text);
    if (translated) {
      distinct++;
      occurrences += n;
      if (showAll) all.push(`  ${n}\t${text}\t-> ${translated}`);
    } else missing.push(`  ${n}\t${text}`);
  }
  const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
  console.log(`${title}: ${distinct}/${rows.length} distinct (${pct(distinct, rows.length)}), ${occurrences}/${total} by occurrence (${pct(occurrences, total)})`);
  if (showAll) console.log(all.join('\n'));
  if (missing.length) console.log(`Untranslated (${missing.length}):\n${missing.join('\n')}`);
  console.log('');
}

const labels = db
  .prepare('SELECT occasion_label AS text, count(*) AS n FROM occasions WHERE hebrew_year >= ? GROUP BY occasion_label ORDER BY n DESC, occasion_label')
  .all(MIN_HISTORICAL_YEAR) as unknown as Array<{ text: string; n: number }>;
const chapters = db
  .prepare(
    'SELECT j.chapter_name AS text, count(*) AS n FROM jem_audio j JOIN occasions o ON o.id = j.occasion_id WHERE o.hebrew_year >= ? AND j.chapter_name IS NOT NULL GROUP BY j.chapter_name ORDER BY n DESC, j.chapter_name',
  )
  .all(MIN_HISTORICAL_YEAR) as unknown as Array<{ text: string; n: number }>;

report('Occasion labels -> English', labels, translateOccasionLabel);
report('Chapter names -> Hebrew', chapters, translateChapterName);
