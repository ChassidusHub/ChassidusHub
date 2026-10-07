import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixParagraph, recordingTranscript, relationsOf } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { recordingsToAlign } from '../src/transcribe.js';
import { findJemRecording, importPodTranscripts, readPodFolder, type PodItem, type PodTranscript } from '../src/transcriptsImport.js';
import { add, freshCatalog, yudShvat } from '../../../packages/core/tests/helpers.js';

// Made-up words and sources only: no real texts.
const w = (text: string, startMs: number, endMs: number, bold?: boolean) => ({ text, startMs, endMs, ...(bold ? { bold } : {}) });

const pod = (rec: number, file: string, engine = 'chassidushub-whisper-v3'): PodTranscript => ({
  rec,
  recording: { rec, event: 77, event_name: 'test', type: 'farbrengen', name: 'part 1', ms: 9000, file },
  engine,
  lines: [
    {
      startMs: 0,
      endMs: 3000,
      text: 'אלף בית גימל דלת.',
      marked: 'אלף ”בית גימל” דלת.',
      words: [w('אלף', 0, 500), w('בית', 500, 1000, true), w('גימל', 1000, 2000), w('דלת.', 2000, 3000)],
      quotes: [
        { start_word: 1, end_word: 2, text: 'בית גימל', ref: 'Testbook 3:4', url: 'https://www.sefaria.org/Testbook.3.4', source_title_he: 'ספר בדיקה', score: 0.9, method: 'search' },
        { start_word: 0, end_word: 0, text: 'אלף', ref: 'Elsewhere 1:1', url: 'https://www.sefaria.org/Elsewhere.1.1', source_title_he: 'מקום אחר', score: 0.8, method: 'search' },
        { start_word: 3, end_word: 3, text: 'דלת', ref: null, url: null, source_title_he: null, score: 0.1, method: 'search' },
      ],
    },
    { startMs: 3000, endMs: 4000, text: '', words: [] },
    { startMs: 5000, endMs: 9000, text: 'הא ווי זין.', words: [w('הא', 5000, 6000), w('ווי', 6000, 7000, true), w('זין.', 7000, 9000)] },
  ],
});

const english = (rec: number) => ({
  rec,
  language: 'en',
  translationOf: 'yi',
  engine: 'translate-test-1',
  machine: true,
  lines: [
    { startMs: 0, endMs: 3000, text: 'Aleph bet gimel dalet.' },
    { startMs: 3000, endMs: 4000, text: '' },
    { startMs: 5000, endMs: 9000, text: 'Hey vav zayin.' },
  ],
});

async function setUp() {
  const { catalog, set } = await freshCatalog();
  const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
  const jem = (n: number) => ({
    event,
    title: { he: `חלק ${n}` },
    url: `https://media.example.org/jem-audio/JEMTEST000${n}.mp3`,
    language: 'yi',
    externalIds: { 'jem-recording': String(1000 + n), 'jem-event': '77' },
    sources: [{ source: 'jem', sourceId: `JEMTEST000${n}.mp3` }],
    sets: [set],
  });
  const first = await add(catalog, 'mendy', 'keeper', 'recording', jem(1));
  const second = await add(catalog, 'mendy', 'keeper', 'recording', jem(2));
  const author = await add(catalog, 'mendy', 'keeper', 'author', { name: { he: 'מחבר' }, kind: 'unknown', sets: [set] });
  const book = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ספר בדיקה' }, slug: 'testbook', authors: [author], genre: 'chassidus', levels: ['chapter'], externalIds: { sefaria: 'Testbook' }, sets: [set] });
  return { catalog, set, event, first, second, book };
}

const items = (...list: PodItem[]) => list;

describe('transcripts made on GPU pods', () => {
  it('finds a JEM recording by its file, else by its JEM ids together', async () => {
    const { catalog, first, second } = await setUp();
    expect(await findJemRecording(catalog, { rec: '1001', file: 'JEMTEST0001.mp3' })).toBe(first);
    expect(await findJemRecording(catalog, { rec: '1002', event: '77', file: 'renamed.mp3' })).toBe(second);
    expect(await findJemRecording(catalog, { rec: '1002', event: '78' })).toBeNull();
    expect(await findJemRecording(catalog, { rec: '9999', file: 'JEMTEST0009.mp3' })).toBeNull();
  });

  it('loads a transcript as the transcription bot would, with stress, quotes, their links and a translation', async () => {
    const { catalog, first, book } = await setUp();
    const report = await importPodTranscripts(catalog, {
      approveAs: 'steward',
      items: items({ rec: '1001', transcript: pod(1001, 'JEMTEST0001.mp3'), translations: [english(1001)] }, { rec: '4242', transcript: pod(4242, 'JEMNONE.mp3'), translations: [] }),
    });
    expect(report.imported).toEqual([{ rec: '1001', recording: first, paragraphs: 2, quotes: 2 }]);
    expect(report.notFound).toEqual([{ rec: '4242', file: 'JEMNONE.mp3' }]);
    expect(report.translated).toEqual([{ rec: '1001', recording: first, language: 'en', paragraphs: 2 }]);

    // The marked words, timed word by word, labelled as the pod's machine hearing; stressed words bold.
    const view = (await recordingTranscript(catalog, first))!;
    expect(view.granularity).toBe('word');
    expect(view.paragraphs).toMatchObject([
      { content: 'אלף ”בית גימל” דלת.', startMs: 0, endMs: 3000, checked: false, by: 'transcribe:whisper-pod@chassidushub-whisper-v3' },
      { content: 'הא ווי זין.', startMs: 5000, endMs: 9000 },
    ]);
    const boldWords = (i: number) => view.paragraphs[i]!.words!.filter((x) => x.bold).map((x) => view.paragraphs[i]!.content.slice(x.from, x.to));
    expect(boldWords(0)).toEqual(['”בית']);
    expect(boldWords(1)).toEqual(['ווי']);
    expect((await catalog.history(view.text))[0]).toMatchObject({ author: 'bot:transcribe', mergedBy: 'steward' });

    // Quotes with a source stay on the paragraph; the one whose sefer the catalog has is proposed as a link, for review.
    const segment = (await catalog.get(view.paragraphs[0]!.id))!;
    expect((segment.data as { quotes: unknown[] }).quotes).toEqual([
      { words: 'בית גימל', ref: 'Testbook 3:4', url: 'https://www.sefaria.org/Testbook.3.4', source: 'ספר בדיקה', origin: { by: 'quotes:search@chassidushub-whisper-v3' } },
      { words: 'אלף', ref: 'Elsewhere 1:1', url: 'https://www.sefaria.org/Elsewhere.1.1', source: 'מקום אחר', origin: { by: 'quotes:search@chassidushub-whisper-v3' } },
    ]);
    expect(report.links.proposed).toBe(1);
    const [suggestion] = report.links.suggestions;
    expect((await catalog.changeset(suggestion!)).status).toBe('open');
    expect(await relationsOf(catalog, first)).toEqual([]);
    await catalog.merge(suggestion!, 'keeper');
    expect(await relationsOf(catalog, first)).toMatchObject([{ kind: 'cites', direction: 'out', other: book, at: view.paragraphs[0]!.id, machine: true }]);
    expect((await relationsOf(catalog, first))[0]!.note).toContain('Testbook 3:4');

    // The translation: its own text of the transcript, a paragraph a line, synced at the same times.
    const [translation] = (await catalog.list({ type: 'text' })).filter((t) => (t.data as { kind: string }).kind === 'translation');
    expect(translation!.data).toMatchObject({ kind: 'translation', translationOf: view.text, language: 'en' });
    const segments = (await catalog.children(translation!.id as EntityId, 'text', 'segment')).map((s) => s.data as { order: string; content: string; origin: unknown });
    segments.sort((a, b) => (a.order < b.order ? -1 : 1));
    expect(segments).toMatchObject([
      { content: 'Aleph bet gimel dalet.', proofread: 0, origin: { by: 'translate:translate-test-1' } },
      { content: 'Hey vav zayin.', proofread: 0 },
    ]);
    const { rows: spans } = await catalog.db.query<{ start: string; end: string }>(
      `SELECT r.data->>'startMs' AS start, r.data->>'endMs' AS end FROM entity a JOIN revision ar ON ar.id = a.main_rev
       JOIN entity_ref x ON x.to_id = a.id AND x.field = 'alignment' JOIN entity s ON s.id = x.from_id JOIN revision r ON r.id = s.main_rev
       WHERE a.type = 'alignment' AND ar.data->>'text' = $1 ORDER BY (r.data->>'startMs')::int`,
      [translation!.id],
    );
    expect(spans.map((s) => [Number(s.start), Number(s.end)])).toEqual([
      [0, 3000],
      [5000, 9000],
    ]);
    // A translation's sync has no words to time: it does not send the recording to the align run.
    expect(await recordingsToAlign(catalog, { linked: true })).toEqual([]);

    // Run again: nothing twice.
    const again = await importPodTranscripts(catalog, { approveAs: 'steward', items: items({ rec: '1001', transcript: pod(1001, 'JEMTEST0001.mp3'), translations: [english(1001)] }) });
    expect(again).toMatchObject({ imported: [], translated: [], skipped: [], links: { proposed: 0 } });
  });

  it('keeps a word said with stress bold through a person fixing the paragraph', async () => {
    const { catalog, first } = await setUp();
    await importPodTranscripts(catalog, { approveAs: 'steward', items: items({ rec: '1001', transcript: pod(1001, 'JEMTEST0001.mp3'), translations: [] }) });
    const view = (await recordingTranscript(catalog, first))!;
    await catalog.merge((await fixParagraph(catalog, 'chaim', { segment: view.paragraphs[1]!.id, content: 'הא ווי זין חית.' })).id, 'keeper');
    const fixed = (await recordingTranscript(catalog, first))!.paragraphs[1]!;
    expect(fixed.words!.filter((x) => x.bold).map((x) => fixed.content.slice(x.from, x.to))).toEqual(['ווי']);
  });

  it('leaves a transcript made otherwise, and with --replace makes it again unless a person touched it', async () => {
    const { catalog, first, second } = await setUp();
    // Transcribed before by another engine.
    const other = (rec: number, file: string) => ({ ...pod(rec, file, 'older-model'), lines: pod(rec, file).lines.slice(0, 1) });
    await importPodTranscripts(catalog, { approveAs: 'steward', items: items({ rec: '1001', transcript: other(1001, 'JEMTEST0001.mp3'), translations: [english(1001)] }) });
    const fresh = () => items({ rec: '1001', transcript: pod(1001, 'JEMTEST0001.mp3'), translations: [english(1001)] });

    const left = await importPodTranscripts(catalog, { approveAs: 'steward', items: fresh() });
    expect(left.skipped).toEqual([{ rec: '1001', recording: first, why: 'has a transcript' }]);
    expect((await recordingTranscript(catalog, first))!.paragraphs).toHaveLength(1);
    expect((await importPodTranscripts(catalog, { approveAs: 'steward', items: fresh(), dryRun: true })).skipped).toHaveLength(1);

    const replaced = await importPodTranscripts(catalog, { approveAs: 'steward', items: fresh(), replace: true });
    expect(replaced.imported).toEqual([{ rec: '1001', recording: first, paragraphs: 2, quotes: 2 }]);
    expect(replaced.translated).toHaveLength(1);
    expect((await recordingTranscript(catalog, first))!.paragraphs.map((p) => p.by)).toEqual(['transcribe:whisper-pod@chassidushub-whisper-v3', 'transcribe:whisper-pod@chassidushub-whisper-v3']);
    expect((await catalog.list({ type: 'text' })).filter((t) => (t.data as { kind: string }).kind === 'translation')).toHaveLength(1);

    // A paragraph a person checked: never replaced.
    await importPodTranscripts(catalog, { approveAs: 'steward', items: items({ rec: '1002', transcript: other(1002, 'JEMTEST0002.mp3'), translations: [] }) });
    const view = (await recordingTranscript(catalog, second))!;
    await catalog.merge((await fixParagraph(catalog, 'chaim', { segment: view.paragraphs[0]!.id, content: view.paragraphs[0]!.content })).id, 'keeper');
    const refused = await importPodTranscripts(catalog, { approveAs: 'steward', items: items({ rec: '1002', transcript: { ...pod(1002, 'JEMTEST0002.mp3') }, translations: [] }), replace: true });
    expect(refused.skipped[0]).toMatchObject({ rec: '1002', recording: second, why: expect.stringContaining('a person checked or fixed') });
    expect((await recordingTranscript(catalog, second))!.paragraphs).toHaveLength(1);

    // Unless the steward asks for it with replaceChecked: then it is made again too.
    const forced = await importPodTranscripts(catalog, { approveAs: 'steward', items: items({ rec: '1002', transcript: { ...pod(1002, 'JEMTEST0002.mp3') }, translations: [] }), replace: true, replaceChecked: true });
    expect(forced.imported).toEqual([{ rec: '1002', recording: second, paragraphs: 2, quotes: 2 }]);
    expect((await recordingTranscript(catalog, second))!.paragraphs).toHaveLength(2);
  });

  it('reads a folder from a pod, one recording at a time, with its translations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pod-'));
    await mkdir(join(dir, 'lines'));
    await mkdir(join(dir, 'en'));
    await mkdir(join(dir, 'he'));
    await writeFile(join(dir, 'lines', '1001.json'), JSON.stringify(pod(1001, 'JEMTEST0001.mp3')));
    await writeFile(join(dir, 'lines', '1002.json'), JSON.stringify(pod(1002, 'JEMTEST0002.mp3')));
    await writeFile(join(dir, 'lines', 'notes.txt'), 'not a transcript');
    await writeFile(join(dir, 'en', '1001.json'), JSON.stringify(english(1001)));
    const read: PodItem[] = [];
    for await (const item of readPodFolder(dir)) read.push(item);
    expect(read.map((i) => [i.rec, i.transcript.lines.length, i.translations.map((t) => t.language)])).toEqual([
      ['1001', 3, ['en']],
      ['1002', 3, []],
    ]);
  });
});

