import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { one } from '@chassidushub/db';
import { CITATIONS_BOT, recordingTranscript, type Catalog, type Json, type NewRevision, type TranscriptView } from '@chassidushub/core';
import { LANGUAGES, newId, orderKeys, type EntityId, type Language, type RelationData, type SegmentQuote } from '@chassidushub/model';
import { TRANSCRIBE_BOT, transcribeRecordings, type Heard, type Transcriber } from './transcribe.js';

/**
 * Transcripts made outside the site, on rented GPU pods, loaded into the
 * catalog (docs/transcription.md, "Transcripts made on GPU pods"). A pod
 * hears JEM's recordings with chassidushub-whisper and writes, for each,
 * `lines/<rec>.json` (rec is JEM's id of the audio recording): its lines
 * with their times and each word's, the words said with stress, and the
 * verses and sayings it quotes with where they are from; and
 * `<language>/<rec>.json`, a machine translation of it, line for line.
 *
 * Each transcript goes in exactly as `chassidushub transcribe` writes one
 * (transcribeRecordings, given the pod's lines as what was heard): the
 * transcription bot's suggestion, approved by a steward, every paragraph
 * and word labelled machine output until a person checks it. A recording
 * that has a transcript already is left as it is, unless asked to replace
 * one nobody has touched. Where things go:
 *
 * - The words: a paragraph per line, the marked words when the pod gives
 *   them (quotes between ” ”, Hebrew terms between ' '), timed word by word.
 * - Stress: `bold` on the word's timing in the alignment span (model
 *   AlignmentSpanData), the one place a word is kept by where it stands;
 *   the listening view draws it bold.
 * - Quotes: on the paragraph (SegmentData `quotes`), each with its Sefaria
 *   ref and page; a Relation must point at a catalog item, and most
 *   sources are not in the catalog. Those that are (a Sefaria book the
 *   catalog has, by its `sefaria` external id) also get a `cites` Relation
 *   proposed for review, from the recording at the paragraph, as the
 *   citations bot proposes the ones it finds in a transcript (core/citations.ts).
 * - Translations: a text of kind `translation` of the transcript, a
 *   paragraph per line, synced to the recording paragraph by paragraph
 *   with the same times, so it plays along like subtitles.
 */

export const TRANSLATE_BOT = 'bot:translate';
/** The transcriber's name in each paragraph's label: `transcribe:whisper-pod@chassidushub-whisper-v3`. */
export const POD_TRANSCRIBER = 'whisper-pod';

export interface PodWord {
  text: string;
  startMs: number;
  endMs: number;
  bold?: boolean;
}

export interface PodQuote {
  /** The first and last of the line's words it takes, by index, inclusive. */
  start_word: number;
  end_word: number;
  text?: string;
  ref?: string | null;
  url?: string | null;
  source_title_he?: string | null;
  score?: number;
  method?: string;
}

export interface PodLine {
  startMs: number;
  endMs: number;
  /** In the house spelling, plain. */
  text: string;
  /** The same words with quotes between ” ” and Hebrew terms between ' '. */
  marked?: string;
  words?: PodWord[];
  quotes?: PodQuote[];
  terms?: Array<{ start_word: number; end_word: number }>;
}

export interface PodTranscript {
  rec: number | string;
  recording?: { rec?: number | string; event?: number | string; event_name?: string; type?: string; name?: string; ms?: number; file?: string };
  engine?: string;
  lines: PodLine[];
}

export interface PodTranslation {
  rec: number | string;
  language: string;
  translationOf?: string;
  engine?: string;
  machine?: boolean;
  lines: Array<{ startMs: number; endMs: number; text: string }>;
}

/** One recording's files from a pod: its transcript and its translations. */
export interface PodItem {
  rec: string;
  transcript: PodTranscript;
  translations: PodTranslation[];
}

/** A pod's folder, one recording at a time (they are large, and there are hundreds): `lines/<rec>.json`, with `<language>/<rec>.json` beside it. */
export async function* readPodFolder(dir: string): AsyncIterable<PodItem> {
  const names = (await readdir(join(dir, 'lines'))).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  const languages: string[] = [];
  for (const entry of await readdir(dir)) {
    if (entry !== 'lines' && /^[a-z]{2,3}$/.test(entry) && (await stat(join(dir, entry))).isDirectory()) languages.push(entry);
  }
  for (const name of names) {
    const rec = name.replace(/\.json$/, '');
    const transcript = JSON.parse(await readFile(join(dir, 'lines', name), 'utf8')) as PodTranscript;
    const translations: PodTranslation[] = [];
    for (const language of languages.sort()) {
      const file = join(dir, language, name);
      const body = await readFile(file, 'utf8').catch(() => null);
      if (body === null) continue;
      const translation = JSON.parse(body) as PodTranslation;
      translations.push({ ...translation, language: translation.language ?? language });
    }
    yield { rec, transcript, translations };
  }
}

/**
 * The catalog's recording of a JEM recording. By its file on JEM's CDN
 * (`JEMSK2919.mp3`), which every JEM recording in the catalog names in its
 * sources, whichever importer brought it (importers/jem.ts,
 * sichosKodeshOccasions.ts), and which is one recording's alone; else by
 * JEM's own ids, the recording's and its event's both, as the JEM
 * importer keeps them (`externalIds`). Null when it is not there, or when
 * more than one recording answers and it cannot say which.
 */
export async function findJemRecording(catalog: Catalog, jem: { rec: string; event?: string; file?: string }): Promise<EntityId | null> {
  if (jem.file) {
    const { rows } = await catalog.db.query<{ id: EntityId }>(
      `SELECT e.id FROM entity e JOIN revision r ON r.id = e.main_rev
       WHERE e.type = 'recording' AND NOT e.deleted AND r.data->'sources' @> $1::jsonb ORDER BY e.id LIMIT 2`,
      [JSON.stringify([{ source: 'jem', sourceId: jem.file }])],
    );
    if (rows.length === 1) return rows[0]!.id;
    if (rows.length > 1) return null;
  }
  const { rows } = await catalog.db.query<{ id: EntityId; event: string | null }>(
    `SELECT e.id, r.data->'externalIds'->>'jem-event' AS event FROM entity_external_id x
     JOIN entity e ON e.id = x.entity_id AND e.type = 'recording' AND NOT e.deleted JOIN revision r ON r.id = e.main_rev
     WHERE x.key = 'jem-recording' AND x.value = $1 ORDER BY e.id LIMIT 10`,
    [jem.rec],
  );
  // JEM's recording id alone is trusted only together with its event, when the pod says which.
  const found = jem.event ? rows.filter((r) => r.event === jem.event) : rows;
  return found.length === 1 ? found[0]!.id : null;
}

export interface ImportReport {
  imported: Array<{ rec: string; recording: EntityId; paragraphs: number; quotes: number }>;
  translated: Array<{ rec: string; recording: EntityId; language: string; paragraphs: number }>;
  skipped: Array<{ rec: string; recording?: EntityId; why: string }>;
  notFound: Array<{ rec: string; file: string | null }>;
  /** Suggestions of `cites` links, waiting for review. */
  links: { proposed: number; suggestions: number[] };
}

/**
 * Loads a pod's transcripts and translations (see the top of this file).
 * `replace`: a recording's transcript is made again from the pod's, when
 * no person has checked, fixed or synced any of it; with `replaceChecked`
 * even then (the steward, 2026-10-07: their fixes are kept as training clips
 * first, and the old paragraphs stay in the history). `dryRun`: only finds
 * each recording and says what would be done.
 */
export async function importPodTranscripts(
  catalog: Catalog,
  input: { items: AsyncIterable<PodItem> | Iterable<PodItem>; approveAs: string; replace?: boolean; replaceChecked?: boolean; limit?: number; dryRun?: boolean; log?: (line: string) => void },
): Promise<ImportReport> {
  const log = input.log ?? (() => {});
  const report: ImportReport = { imported: [], translated: [], skipped: [], notFound: [], links: { proposed: 0, suggestions: [] } };
  if (!input.dryRun) await catalog.createAccount({ id: TRANSLATE_BOT, displayName: 'Machine translation', isBot: true });
  /** The transcripts whose quotes are linked at the end. */
  const linked: Array<{ recording: EntityId; text: EntityId }> = [];
  let seen = 0;
  for await (const item of input.items) {
    if (input.limit !== undefined && seen >= input.limit) break;
    seen++;
    const { rec, transcript } = item;
    const file = transcript.recording?.file ?? null;
    const event = transcript.recording?.event;
    const recording = await findJemRecording(catalog, { rec, file: file ?? undefined, event: event === undefined || event === null ? undefined : String(event) });
    if (!recording) {
      report.notFound.push({ rec, file });
      log(`${rec}${file ? ` (${file})` : ''}: no such recording in the catalog`);
      continue;
    }
    const engine = (transcript.engine ?? '').trim().slice(0, 100) || 'unknown';
    const by = `transcribe:${POD_TRANSCRIBER}@${engine}`;
    const { heard, kept } = heardOf(transcript, engine);
    if (!heard.length) {
      report.skipped.push({ rec, recording, why: 'no words' });
      continue;
    }
    let view = await recordingTranscript(catalog, recording);
    // This pod's own transcript, from an earlier run: only what it lacks is added (its translations).
    const ours = view !== null && view.paragraphs.length === heard.length && view.paragraphs.every((p) => p.by === by);
    if (input.dryRun) {
      const what = view && !ours ? (input.replace ? 'would replace its transcript' : 'has a transcript; left as it is') : view ? 'already loaded' : `would load ${heard.length} paragraphs`;
      log(`${rec}: ${recording}: ${what}`);
      if (view && !ours && !input.replace) report.skipped.push({ rec, recording, why: 'has a transcript' });
      continue;
    }
    try {
      if (view && (input.replace || !ours)) {
        if (!input.replace) {
          report.skipped.push({ rec, recording, why: 'has a transcript' });
          log(`${rec}: ${recording}: has a transcript; left as it is (--replace to make it again)`);
          continue;
        }
        const refused = await removeTranscript(catalog, { approveAs: input.approveAs, text: view.text, recording, force: input.replaceChecked });
        if (refused) {
          report.skipped.push({ rec, recording, why: refused });
          log(`${rec}: ${recording}: not replaced: ${refused}`);
          continue;
        }
        view = null;
      }
      if (!view) {
        const transcriber: Transcriber = { name: POD_TRANSCRIBER, version: engine, transcribe: async () => heard };
        const done = await transcribeRecordings(catalog, {
          approveAs: input.approveAs,
          transcriber,
          // The pod heard it; there is nothing to fetch.
          fetchAudio: async () => new Uint8Array(),
          recording,
          linked: true,
          // The pod's lines are the lines, as it cut them.
          lines: (lines) => lines,
          log,
        });
        view = await recordingTranscript(catalog, recording);
        if (!done.length || !view) {
          report.skipped.push({ rec, recording, why: 'the catalog has no file or link for it to transcribe' });
          continue;
        }
        report.imported.push({ rec, recording, paragraphs: view.paragraphs.length, quotes: heard.reduce((n, h) => n + (h.quotes?.length ?? 0), 0) });
      }
      linked.push({ recording, text: view.text });
      for (const translation of item.translations) {
        const outcome = await addTranslation(catalog, { approveAs: input.approveAs, recording, view, translation, kept, lines: transcript.lines.length });
        if (typeof outcome === 'string') {
          if (outcome !== 'has it') log(`${rec}: ${translation.language} translation: ${outcome}`);
          continue;
        }
        report.translated.push({ rec, recording, language: translation.language, paragraphs: outcome.paragraphs });
        log(`${rec}: ${recording}: ${translation.language} translation, ${outcome.paragraphs} paragraphs`);
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      report.skipped.push({ rec, recording, why: `failed: ${why}` });
      log(`${rec}: ${recording}: failed: ${why}`);
    }
  }
  if (!input.dryRun && linked.length) report.links = await proposeQuoteLinks(catalog, linked, log);
  return report;
}

/**
 * A pod's lines as what was heard: the marked words when it gives them,
 * each word's time and stress, and the quotes that have a source. `kept`
 * is which of the pod's lines became paragraphs (a line with no words is
 * left out), so a translation's lines are matched to them.
 */
export function heardOf(transcript: PodTranscript, engine: string): { heard: Heard[]; kept: number[] } {
  const heard: Heard[] = [];
  const kept: number[] = [];
  for (const [i, line] of (transcript.lines ?? []).entries()) {
    const text = (line.marked?.trim() || line.text?.trim() || '').replace(/\s+/g, ' ');
    if (!text) continue;
    const words = (line.words ?? []).filter((w) => w.text?.trim()).map((w) => ({ text: w.text.trim(), startMs: Math.max(0, Math.round(w.startMs)), endMs: Math.max(0, Math.round(w.endMs)), ...(w.bold ? { bold: true } : {}) }));
    const quotes: SegmentQuote[] = [];
    for (const q of line.quotes ?? []) {
      const ref = q.ref?.trim();
      const url = q.url?.trim() && /^https?:\/\//.test(q.url.trim()) ? q.url.trim().slice(0, 2000) : undefined;
      if (!ref && !url) continue;
      const said = (q.text?.trim() || (line.words ?? []).slice(q.start_word, q.end_word + 1).map((w) => w.text).join(' ').trim()).slice(0, 2000);
      if (!said) continue;
      const method = (q.method ?? 'pod').replace(/[^\w.-]/g, '').slice(0, 40) || 'pod';
      quotes.push({ words: said, ...(ref ? { ref: ref.slice(0, 500) } : {}), ...(url ? { url } : {}), ...(q.source_title_he?.trim() ? { source: q.source_title_he.trim().slice(0, 500) } : {}), origin: { by: `quotes:${method}@${engine}` } });
    }
    heard.push({ startMs: Math.max(0, Math.round(line.startMs)), endMs: Math.max(0, Math.round(line.endMs)), text, ...(words.length ? { words } : {}), ...(quotes.length ? { quotes: quotes.slice(0, 200) } : {}) });
    kept.push(i);
  }
  return { heard, kept };
}

/**
 * A machine translation of a transcript, line for line: a text of kind
 * `translation` of it, a paragraph per line, labelled until a person
 * checks each, and synced to the recording paragraph by paragraph at the
 * transcript's own times, so it can be shown along as it plays. As the
 * translation bot, approved by `approveAs`. Says why not when it is not
 * added (`has it` when the transcript has one in that language already).
 */
async function addTranslation(
  catalog: Catalog,
  input: { approveAs: string; recording: EntityId; view: TranscriptView; translation: PodTranslation; kept: number[]; lines: number },
): Promise<{ paragraphs: number } | string> {
  const { view, translation } = input;
  const language = translation.language as Language;
  if (!(LANGUAGES as readonly string[]).includes(language)) return `${translation.language} is not a language the catalog has`;
  if (language === view.language) return 'in the language of the transcript';
  const { rows: have } = await catalog.db.query(
    `SELECT 1 FROM entity_ref x JOIN entity t ON t.id = x.from_id AND t.type = 'text' AND NOT t.deleted JOIN revision tr ON tr.id = t.main_rev
     WHERE x.to_id = $1 AND x.field = 'translationOf' AND tr.data->>'language' = $2 LIMIT 1`,
    [view.text, language],
  );
  if (have.length) return 'has it';
  const lines = input.kept.map((i) => translation.lines?.[i]);
  if (translation.lines?.length !== input.lines || lines.some((l) => !l) || lines.length !== view.paragraphs.length) return "its lines are not the transcript's, line for line";
  const engine = (translation.engine ?? '').trim().slice(0, 100) || 'unknown';
  const origin = { by: `translate:${engine}`.slice(0, 200) };
  const suggestion = await catalog.createChangeset(TRANSLATE_BOT, { title: `Machine translation (${language}) of the transcript of ${input.recording} (${engine})` });
  const text = await catalog.putRevision(suggestion.id, TRANSLATE_BOT, {
    type: 'text',
    data: { kind: 'translation', translationOf: view.text, language, credit: `Machine translation (${engine})` } as Json,
  });
  const alignment = await catalog.putRevision(suggestion.id, TRANSLATE_BOT, {
    type: 'alignment',
    data: { recording: input.recording, text, granularity: 'paragraph', engine: { name: 'translate', version: engine } } as Json,
  });
  const orders = orderKeys(lines.length);
  const items: NewRevision[] = [];
  for (const [i, line] of lines.entries()) {
    const p = view.paragraphs[i]!;
    const segment = newId();
    items.push({
      id: segment,
      type: 'segment',
      data: { text, order: orders[i]!, kind: 'paragraph', content: String(line!.text ?? '').replace(/\s+/g, ' ').trim(), proofread: 0, origin } as Json,
    });
    // Heard when the transcript's paragraph is heard; the pod gives the same times.
    const startMs = p.startMs ?? Math.max(0, Math.round(line!.startMs));
    const endMs = p.endMs ?? Math.max(startMs, Math.round(line!.endMs));
    items.push({ type: 'alignment-span', data: { alignment, segment, startMs, endMs, origin } as Json });
  }
  await catalog.putRevisions(suggestion.id, TRANSLATE_BOT, items);
  await catalog.submit(suggestion.id, TRANSLATE_BOT);
  await catalog.merge(suggestion.id, input.approveAs, {}, 'Machine translation, labelled as such until checked');
  return { paragraphs: lines.length };
}

/**
 * Takes a machine transcript out, with everything made from it (its sync,
 * its translations and theirs, the links found in it), so it can be made
 * again; as the transcription bot, approved by `approveAs`. Refused (and
 * why) when a person has checked, fixed or synced any of it, or something
 * else points at it; `force` takes it out even when people worked on it.
 */
export async function removeTranscript(catalog: Catalog, input: { approveAs: string; text: EntityId; recording: EntityId; force?: boolean }): Promise<string | null> {
  const all = new Map<EntityId, string>([[input.text, 'text']]);
  let frontier: EntityId[] = [input.text];
  while (frontier.length) {
    const { rows } = await catalog.db.query<{ from_id: EntityId; type: string; field: string }>(
      'SELECT r.from_id, e.type, r.field FROM entity_ref r JOIN entity e ON e.id = r.from_id WHERE r.to_id = ANY($1::text[]) AND NOT e.deleted',
      [frontier],
    );
    frontier = [];
    for (const r of rows) {
      if (all.has(r.from_id)) continue;
      const expected = (r.type === 'segment' && r.field === 'text') || (r.type === 'alignment' && r.field === 'text') || (r.type === 'alignment-span' && (r.field === 'alignment' || r.field === 'segment')) || (r.type === 'text' && r.field === 'translationOf') || (r.type === 'relation' && r.field === 'at');
      if (!expected) return `${r.from_id} (a ${r.type}) points at it`;
      all.set(r.from_id, r.type);
      frontier.push(r.from_id);
    }
  }
  const { rows } = await catalog.db.query<{ id: EntityId; type: string; data: Record<string, unknown> & { origin?: { checked?: boolean; edited?: boolean } } }>(
    'SELECT e.id, e.type, r.data FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = ANY($1::text[])',
    [[...all.keys()]],
  );
  for (const r of input.force ? [] : rows) {
    const o = r.data.origin;
    const machine = o !== undefined && !o.checked && !o.edited;
    if (r.type === 'segment' && (!machine || Number(r.data.proofread ?? 0) > 0)) return `a person checked or fixed paragraph ${r.id}`;
    if (r.type === 'alignment-span' && (!machine || r.data.locked)) return `a person set where ${String(r.data.segment)} is heard`;
    if (r.type === 'relation' && !machine) return `a person checked the link ${r.id}`;
  }
  const suggestion = await catalog.createChangeset(TRANSCRIBE_BOT, { title: `Machine transcript of ${input.recording} taken out, to be made again` });
  await catalog.putRevisions(suggestion.id, TRANSCRIBE_BOT, [...all.keys()].map((id) => ({ id, type: all.get(id) as 'text', data: null })));
  await catalog.submit(suggestion.id, TRANSCRIBE_BOT);
  await catalog.merge(suggestion.id, input.approveAs, {}, 'A machine transcript replaced by a newer one');
  return null;
}

/** The longest Sefaria book title the catalog has that a ref starts with (`Genesis` for `Genesis 1:1`), by the sefarim's `sefaria` external id. */
export function bookOf(ref: string, books: ReadonlyArray<{ title: string; id: EntityId }>): EntityId | null {
  let best: { title: string; id: EntityId } | null = null;
  for (const b of books) {
    if ((ref === b.title || ref.startsWith(`${b.title} `) || ref.startsWith(`${b.title},`)) && (!best || b.title.length > best.title.length)) best = b;
  }
  return best?.id ?? null;
}

/**
 * The quotes of these transcripts whose source the catalog has, proposed
 * as `cites` links for review: from the recording, at the paragraph,
 * to the sefer, with the ref, its page and the words quoted in the note.
 * As the citations bot, a hundred links a suggestion, as core/citations.ts
 * does; a link proposed before (merged, waiting or sent back) is never
 * proposed again.
 */
async function proposeQuoteLinks(catalog: Catalog, transcripts: Array<{ recording: EntityId; text: EntityId }>, log: (line: string) => void): Promise<{ proposed: number; suggestions: number[] }> {
  const { rows: books } = await catalog.db.query<{ title: string; id: EntityId }>(
    "SELECT x.value AS title, e.id FROM entity_external_id x JOIN entity e ON e.id = x.entity_id AND e.type = 'work' AND NOT e.deleted WHERE x.key = 'sefaria'",
  );
  if (!books.length) return { proposed: 0, suggestions: [] };
  const pending: RelationData[] = [];
  for (const t of transcripts) {
    // Read from the paragraphs as they now stand, so a run that stopped before its links were proposed proposes them the next time.
    const { rows } = await catalog.db.query<{ id: EntityId; quotes: SegmentQuote[] | null }>(
      `SELECT s.id, sr.data->'quotes' AS quotes FROM entity_ref x JOIN entity s ON s.id = x.from_id AND s.type = 'segment' AND NOT s.deleted
       JOIN revision sr ON sr.id = s.main_rev WHERE x.to_id = $1 AND x.field = 'text' AND sr.data ? 'quotes' ORDER BY sr.data->>'order'`,
      [t.text],
    );
    for (const s of rows) {
      for (const q of s.quotes ?? []) {
        const to = q.ref ? bookOf(q.ref, books) : null;
        if (!to) continue;
        const seen = await one(
          catalog.db,
          "SELECT 1 FROM revision WHERE entity_type = 'relation' AND data->>'kind' = 'cites' AND data->>'from' = $1 AND data->>'to' = $2 AND data->>'at' = $3 LIMIT 1",
          [t.recording, to, s.id],
        );
        if (seen || pending.some((p) => p.from === t.recording && p.to === to && p.at === s.id)) continue;
        const note = [q.ref, q.url, `”${q.words}”`].filter(Boolean).join(' · ').slice(0, 2000);
        pending.push({ kind: 'cites', from: t.recording, to, at: s.id, note, origin: q.origin ?? { by: 'quotes:pod' } });
      }
    }
  }
  const suggestions: number[] = [];
  if (pending.length) await catalog.createAccount({ id: CITATIONS_BOT, displayName: 'Citations (machine)', isBot: true });
  for (let i = 0; i < pending.length; i += 100) {
    const batch = pending.slice(i, i + 100);
    const suggestion = await catalog.createChangeset(CITATIONS_BOT, {
      title: `מראי מקומות בתמלולים (${batch.length}), נמצאו במכונה`,
      description: 'Verses and sayings quoted in machine transcripts, each linked from the recording, at its paragraph, to the sefer it is from. Check them before approving.',
    });
    for (const relation of batch) await catalog.putRevision(suggestion.id, CITATIONS_BOT, { type: 'relation', data: relation as unknown as Json });
    await catalog.submit(suggestion.id, CITATIONS_BOT);
    suggestions.push(suggestion.id);
    log(`suggestion ${suggestion.id}: ${batch.length} links to quoted sources`);
  }
  return { proposed: pending.length, suggestions };
}
