import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { ObjectsIndex, PackManifest } from '@sichos-kodesh/pack-format';

// An in-memory file system behind react-native-blob-util: the object store,
// the download ledger and the import all read and write through it.
const mockFiles = new Map<string, string>();
jest.mock('react-native-blob-util', () => {
  const dir = '/data/files';
  const ls = (path: string) => {
    const prefix = `${path.replace(/\/$/, '')}/`;
    const names = new Set<string>();
    for (const key of mockFiles.keys()) if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]!);
    return [...names];
  };
  return {
    fs: {
      dirs: { DocumentDir: dir },
      exists: jest.fn(async (path: string) => mockFiles.has(path) || ls(path).length > 0),
      ls: jest.fn(async (path: string) => ls(path)),
      mkdir: jest.fn(async () => undefined),
      stat: jest.fn(async (path: string) => {
        if (!mockFiles.has(path)) throw new Error(`no ${path}`);
        return { size: String(mockFiles.get(path)!.length) };
      }),
      readFile: jest.fn(async (path: string) => {
        if (!mockFiles.has(path)) throw new Error(`no ${path}`);
        return mockFiles.get(path);
      }),
      writeFile: jest.fn(async (path: string, text: string) => {
        mockFiles.set(path, text);
      }),
      unlink: jest.fn(async (path: string) => {
        mockFiles.delete(path);
      }),
      mv: jest.fn(async (from: string, to: string) => {
        mockFiles.set(to, mockFiles.get(from) ?? '');
        mockFiles.delete(from);
      }),
    },
  };
});

const packFormat = require('@sichos-kodesh/pack-format') as typeof import('@sichos-kodesh/pack-format');
const placement = require('./placement') as typeof import('./placement');
const packImport = require('./packImport') as typeof import('./packImport');
const looseImport = require('./looseImport') as typeof import('./looseImport');
const exportScope = require('./exportScope') as typeof import('./exportScope');
const objectStore = require('./objectStore') as typeof import('./objectStore');
const stateFiles = require('./stateFiles') as typeof import('./stateFiles');
const offlineJobs = require('./offlineJobs') as typeof import('./offlineJobs');
const downloadStorage = require('../download/downloadStorage') as typeof import('../download/downloadStorage');
const { catalogStore } = require('../catalog/catalogStore') as typeof import('../catalog/catalogStore');

const DIR = '/data/files';
const sha = (n: number) => n.toString(16).padStart(64, '0');

/** A real farbrengen from the bundled catalog, so download records resolve against real targets. */
function realEntry(): CatalogEntry {
  const entry = Object.values(catalogStore.getCatalog())
    .flat()
    .find((e) => e.audio.length >= 2 && e.pdfs.some((p) => p.section === 'mugah'));
  if (!entry) throw new Error('the bundled catalog has no farbrengen with two recordings and a mugah');
  return entry;
}

function manifestFor(entry: CatalogEntry, profile: 'src' | 'opus24' = 'src'): PackManifest {
  const audio = entry.audio.slice(0, 2).map((chapter, index) => ({ sha256: sha(index + 1), bytes: 10 + index, kind: 'audio' as const, profile, sourceId: chapter.workerFilename, role: String(index) }));
  const pdf = entry.pdfs.find((p) => p.section === 'mugah')!;
  const refs = [...audio, { sha256: sha(9), bytes: 30, kind: 'pdf' as const, sourceId: pdf.driveFileId, role: 'mugah' }];
  const objects: Record<string, number> = {};
  for (const ref of refs) objects[ref.sha256] = ref.bytes;
  return {
    schema: 1,
    packId: 'test-pack',
    builtAt: '2026-09-24T00:00:00.000Z',
    catalogVersion: '1.0.0',
    profile: { audio: profile },
    scope: { kind: 'month', collection: 'farbrengens', hebrewYear: entry.hebrewYear, month: '01', label: { en: 'Tishrei', he: 'תשרי' } },
    entries: [{ collection: 'farbrengens', itemId: String(entry.occasionId), hebrewYear: entry.hebrewYear, hebrewDate: entry.hebrewDate, label: entry.occasionLabel, refs }],
    objects,
  };
}

const emptyPhone = () => ({ held: new Map<string, string>(), unverifiedFiles: new Set<string>(), fileSizes: new Map<string, number>() });

beforeEach(async () => {
  mockFiles.clear();
  objectStore.resetObjectStoreCache();
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
});

describe('placement', () => {
  it('puts objects where the downloader does, and nothing outside the files directory', () => {
    expect(placement.objectFileName('audio', 'JEMSK0562A.mp3', 'src')).toBe('JEMSK0562A.mp3');
    expect(placement.objectFileName('pdf', '1Sff_afTE96gZbJb6GRv8P8j08vOVDxDs')).toBe('1Sff_afTE96gZbJb6GRv8P8j08vOVDxDs.pdf');
    expect(placement.objectFileName('text', 'igros:123')).toBe('texts/igros_123.html');
    expect(placement.objectFileName('text', 'work:tanya:0123456789abcdef')).toBe('texts/work_tanya_0123456789abcdef.html');
    expect(placement.objectFileName('search', 'search:tanya')).toBe('indexes/search_tanya.sqlite');
    expect(placement.objectFileName('search', '../x')).toBeNull();
    expect(placement.objectFileName('audio', '../evil.mp3', 'src')).toBeNull();
    expect(placement.objectFileName('pdf', '../../x')).toBeNull();
    expect(placement.objectFileName('text', 'a/../../b')).toBeNull();
    // Opus waits for playback to be verified on real phones.
    expect(placement.objectFileName('audio', 'JEMSK0562A.mp3', 'opus24')).toBeNull();
  });

  it('trusts the development key on debug builds only', () => {
    const dev = packFormat.developmentKeyPair();
    expect(placement.trustedPackKeys(true)[dev.keyId]).toBe(dev.publicKey);
    expect(placement.trustedPackKeys(false)[dev.keyId]).toBeUndefined();
  });
});

describe('planPackImport', () => {
  it('writes what the phone lacks, once per hash', () => {
    const manifest = manifestFor(realEntry());
    manifest.entries.push({ ...manifest.entries[0]!, itemId: '999' });
    const plan = packImport.planPackImport(manifest, emptyPhone());
    expect(plan.write).toHaveLength(3);
    expect(plan.bytesToWrite).toBe(10 + 11 + 30);
    expect(plan.refs).toHaveLength(6);
  });

  it('skips a file already held or downloaded at the same size, and replaces an unverified one', () => {
    const manifest = manifestFor(realEntry());
    const [a, b, pdf] = manifest.entries[0]!.refs;
    const phone = emptyPhone();
    phone.held.set(a!.sha256, a!.sourceId);
    phone.fileSizes.set(a!.sourceId, 10);
    phone.fileSizes.set(b!.sourceId, 11);
    phone.fileSizes.set(`${pdf!.sourceId}.pdf`, 30);
    phone.unverifiedFiles.add(`${pdf!.sourceId}.pdf`);
    const plan = packImport.planPackImport(manifest, phone);
    expect(plan.present.map((o) => o.sha256)).toEqual([a!.sha256, b!.sha256]);
    expect(plan.write.map((o) => o.sha256)).toEqual([pdf!.sha256]);
  });

  it('counts recordings in a profile this build does not take', () => {
    const plan = packImport.planPackImport(manifestFor(realEntry(), 'opus24'), emptyPhone());
    expect(plan.unsupported).toBe(2);
    expect(plan.write).toHaveLength(1);
  });
});

describe('importPack', () => {
  function fakeNative(manifestText: string, free = 10 ** 10) {
    const imported: Array<{ entry: string; dest: string }> = [];
    const native = {
      readEntry: jest.fn(async () => manifestText),
      deviceInfo: jest.fn(async () => ({ model: 'Test', androidVersion: '14', freeBytes: free, filesDir: DIR })),
      importEntries: jest.fn(async (_uri: string, _job: string, items: Array<{ entry: string; dest: string; sha256: string; bytes?: number }>) =>
        items.map((item) => {
          imported.push({ entry: item.entry, dest: item.dest });
          mockFiles.set(`${DIR}/${item.dest}`, 'x'.repeat(item.bytes ?? 1));
          return { entry: item.entry, dest: item.dest, ok: true, sha256: item.sha256, bytes: item.bytes ?? 1 };
        }),
      ),
    };
    return { native: native as unknown as import('./packsNative').PacksNativeModule, imported };
  }

  it('refuses an unsigned pack as a pack', async () => {
    const { native } = fakeNative(JSON.stringify(manifestFor(realEntry())));
    const outcome = await packImport.importPack(native, 'content://x', 'job');
    expect(outcome).toMatchObject({ status: 'untrusted', reason: 'unsigned' });
  });

  it('imports a pack signed with the development key, records the objects and marks the files downloaded', async () => {
    const entry = realEntry();
    const signed = packFormat.signManifest(manifestFor(entry), packFormat.developmentKeyPair());
    const { native, imported } = fakeNative(JSON.stringify(signed));
    const outcome = await packImport.importPack(native, 'content://x', 'job');
    expect(outcome).toMatchObject({ status: 'imported', added: 3, present: 0, failed: 0 });
    expect(imported.map((i) => i.dest).sort()).toEqual([entry.audio[0]!.workerFilename, entry.audio[1]!.workerFilename, `${entry.pdfs.find((p) => p.section === 'mugah')!.driveFileId}.pdf`].sort());

    const held = await objectStore.readHeldObjects();
    expect(Object.keys(held).sort()).toEqual([sha(1), sha(2), sha(9)]);
    expect(Object.values(held).every((o) => o.source === 'pack' && o.verified)).toBe(true);

    const records = await downloadStorage.listStoredDownloads();
    expect(records.filter((r) => r.occasionId === entry.occasionId && r.kind === 'audio').map((r) => r.chapterIndex).sort()).toEqual([0, 1]);
    expect(records.some((r) => r.kind === 'pdf' && r.section === 'mugah')).toBe(true);
    expect((await objectStore.readInstalledPacks())[0]).toMatchObject({ packId: 'test-pack', added: 3, objects: 3 });

    // The same pack again writes nothing.
    const again = await packImport.importPack(native, 'content://x', 'job2');
    expect(again).toMatchObject({ status: 'imported', added: 0, present: 3 });
  });

  it('refuses when the phone lacks the room', async () => {
    const signed = packFormat.signManifest(manifestFor(realEntry()), packFormat.developmentKeyPair());
    const { native, imported } = fakeNative(JSON.stringify(signed), 1000);
    expect(await packImport.importPack(native, 'content://x', 'job')).toMatchObject({ status: 'no-space' });
    expect(imported).toHaveLength(0);
  });
});

describe('planLooseImport', () => {
  const staged = (path: string, n: number, bytes = 100) => ({ path, staged: `import-staging/${n}.tmp`, sha256: sha(1000 + n), bytes });

  it('stores known hashes, keeps catalog-known names as unverified, skips the rest', () => {
    const entry = realEntry();
    const [first, second] = entry.audio;
    const index: ObjectsIndex = {
      schema: 1,
      version: '1.0.0',
      builtAt: '2026-09-24T00:00:00.000Z',
      objects: { [sha(1001)]: { kind: 'audio', profile: 'src', bytes: 100, sourceId: first!.workerFilename, collection: 'farbrengens', itemId: String(entry.occasionId) } },
    };
    const files = [
      staged('stuff/renamed.mp3', 1), // known by hash, whatever its name
      staged(`תשל״ו/תשרי/${second!.workerFilename}`, 2), // known by name
      staged('תשל״ו/JEMSK9999Z.mp3', 3), // named like JEM, but no such recording in the catalog
      staged('notes.txt', 4),
      staged('manifest.json', 5),
    ];
    const plan = looseImport.planLooseImport(files, index, emptyPhone(), [entry]);
    expect(plan.commit.map((c) => [c.object.file, c.verified])).toEqual([
      [first!.workerFilename, true],
      [second!.workerFilename, false],
    ]);
    expect(plan.unrecognized).toBe(2);
  });

  it('refuses a named file whose bytes the index says are another copy, and never overwrites by name', () => {
    const entry = realEntry();
    const [first, second] = entry.audio;
    const index: ObjectsIndex = {
      schema: 1,
      version: '1.0.0',
      builtAt: '2026-09-24T00:00:00.000Z',
      objects: { [sha(1)]: { kind: 'audio', profile: 'src', bytes: 100, sourceId: first!.workerFilename, collection: 'farbrengens', itemId: String(entry.occasionId) } },
    };
    const phone = emptyPhone();
    phone.fileSizes.set(second!.workerFilename, 5);
    const plan = looseImport.planLooseImport([staged(first!.workerFilename, 1), staged(second!.workerFilename, 2)], index, phone, [entry]);
    expect(plan.mismatched).toBe(1);
    expect(plan.present).toBe(1);
    expect(plan.commit).toHaveLength(0);
  });
});

describe('an untrusted pack', () => {
  it('comes in as named files: each entry must hash to its name, and only src audio is kept', () => {
    const entry = realEntry();
    const manifest = manifestFor(entry);
    const [a, b, pdf] = manifest.entries[0]!.refs;
    const hints = looseImport.nameHintsFrom(manifest);
    const files = [
      { path: 'manifest.json', staged: 's/0', sha256: sha(500), bytes: 10 },
      { path: `objects/${a!.sha256}`, staged: 's/1', sha256: a!.sha256, bytes: 10 },
      { path: `objects/${b!.sha256}`, staged: 's/2', sha256: sha(777), bytes: 11 }, // damaged in transit
      { path: `objects/${pdf!.sha256}`, staged: 's/3', sha256: pdf!.sha256, bytes: 30 },
    ];
    const plan = looseImport.planLooseImport(files, null, emptyPhone(), [entry], hints);
    expect(plan.commit.map((c) => [c.object.file, c.verified])).toEqual([
      [a!.sourceId, false],
      [`${pdf!.sourceId}.pdf`, false],
    ]);
    expect(plan.unrecognized).toBe(1);

    const opus = looseImport.nameHintsFrom(manifestFor(entry, 'opus24'));
    const opusPlan = looseImport.planLooseImport(files.slice(1, 2), null, emptyPhone(), [entry], opus);
    expect(opusPlan).toMatchObject({ unsupported: 1, commit: [] });
  });
});

describe('export', () => {
  it('lays a month out in Hebrew folders that a second phone reads back', () => {
    const entry = realEntry();
    const existing = new Set([entry.audio[0]!.workerFilename, `${entry.pdfs[0]!.driveFileId}.pdf`]);
    const files = exportScope.planExport([entry], existing);
    expect(files).toHaveLength(2);
    for (const file of files) {
      const scope = packFormat.parseFolderScope(file.name);
      expect(scope?.hebrewYear).toBe(entry.hebrewYear);
      expect(scope?.month).toBe(entry.hebrewDate.split('-')[1]);
      const id = packFormat.identifyFile({ path: file.name, bytes: 1 }, null);
      expect(id.status).toBe('guessed');
    }
    const manifest = exportScope.exportManifest(
      exportScope.exportScopeOf({ hebrewYear: entry.hebrewYear, month: entry.hebrewDate.split('-')[1] }),
      files.map((f, i) => ({ ...f, sha256: sha(i + 1), bytes: 10 })),
      '1.0.0',
      new Date('2026-09-24T00:00:00Z'),
    );
    expect(packFormat.parsePackManifest(JSON.parse(JSON.stringify(manifest)))).not.toBeNull();
    expect(packFormat.verifyManifest(manifest, placement.trustedPackKeys(true))).toEqual({ ok: false, reason: 'unsigned' });
  });

  it('writes file-system-safe names', () => {
    expect(exportScope.safeFolderName('יום ב\' דר"ה: א/ב')).toBe('יום ב׳ דר״ה א ב');
    expect(exportScope.exportFileName(exportScope.exportScopeOf({ hebrewYear: 5736, month: '01' }))).toBe('תשרי תשל״ו.zip');
  });
});

describe('state and store', () => {
  it('lists every held hash in have.json, sorted', () => {
    const have = stateFiles.buildHaveFile({ [sha(2)]: {} as never, [sha(1)]: {} as never }, '1.2.3', new Date('2026-09-24T00:00:00Z'));
    expect(packFormat.parseHaveFile(have)).toMatchObject({ catalogVersion: '1.2.3', profiles: ['src'], objects: [sha(1), sha(2)] });
  });

  it('merges objects indexes, the newer one winning', () => {
    const entry = { kind: 'pdf' as const, bytes: 1, sourceId: 'x'.repeat(28), collection: 'farbrengens' as const, itemId: '1' };
    const older: ObjectsIndex = { schema: 1, version: '1', builtAt: '2026-01-01T00:00:00Z', objects: { [sha(1)]: entry, [sha(2)]: entry } };
    const newer: ObjectsIndex = { schema: 1, version: '2', builtAt: '2026-02-01T00:00:00Z', objects: { [sha(2)]: { ...entry, itemId: '2' } } };
    const merged = objectStore.mergeObjectsIndexes(newer, older);
    expect(merged.version).toBe('2');
    expect(Object.keys(merged.objects)).toHaveLength(2);
    expect(merged.objects[sha(2)]!.itemId).toBe('2');
  });

  it('keeps one record per file', async () => {
    const base = { bytes: 1, kind: 'audio' as const, sourceId: 'A.mp3', file: 'A.mp3', source: 'shared' as const, verified: false, addedAt: '' };
    await objectStore.recordHeldObjects([{ ...base, sha256: sha(1) }]);
    await objectStore.recordHeldObjects([{ ...base, sha256: sha(2), verified: true }]);
    expect(Object.keys(await objectStore.readHeldObjects())).toEqual([sha(2)]);
  });
});

describe('offline jobs', () => {
  it('names picked files and recognises importable ones', () => {
    expect(offlineJobs.displayNameOfUri('content://com.android.externalstorage.documents/document/primary%3ADownload%2F5736-01-tishrei-src.skpack')).toBe('5736-01-tishrei-src.skpack');
    expect(offlineJobs.isImportableName('5736-01-tishrei-src.skpack')).toBe(true);
    expect(offlineJobs.isImportableName('תשרי תשל״ו.ZIP')).toBe(true);
    expect(offlineJobs.isImportableName('have.json')).toBe(false);
  });
});

describe('report lines', () => {
  const { STRINGS } = require('../i18n/translations') as typeof import('../i18n/translations');
  const reportText = require('./reportText') as typeof import('./reportText');
  const scope = { kind: 'month' as const, collection: 'farbrengens' as const, hebrewYear: 5736, month: '01', label: { en: 'Tishrei 5736', he: 'תשרי תשל״ו' } };

  it('says in one Hebrew line what a pack brought', () => {
    const line = reportText.offlineReportLine(STRINGS.he, 'he', { kind: 'pack', name: 'x.skpack', scope, part: { index: 0, count: 3 }, added: 31, addedBytes: 82.4 * 1024 * 1024, present: 2, unsupported: 0, failed: 0, at: 0 });
    expect(line).toBe('תשרי תשל״ו - חלק 1 מתוך 3: 31 קבצים נוספו (82.4 MB), 2 כבר היו');
  });

  it('counts what a shared ZIP left out', () => {
    const line = reportText.offlineReportLine(STRINGS.he, 'he', { kind: 'shared', name: 'תשרי.zip', added: 31, addedBytes: 1, present: 0, unsupported: 0, mismatched: 0, unrecognized: 4, failed: 0, at: 0 });
    expect(line).toBe('תשרי.zip: 31 קבצים נוספו, 4 לא זוהו');
    expect(reportText.offlineReportLine(STRINGS.en, 'en', { kind: 'error', name: '', code: 'no-space', needed: 2 * 1024 ** 3, free: 1024 ** 3, at: 0 })).toBe('Not enough room on the phone: needs 2.00 GB, 1.00 GB free');
  });

  it('shows progress once the total is known', () => {
    expect(reportText.offlineActivityLine(STRINGS.en, { kind: 'import', name: 'a.skpack', bytes: 0, total: 0 })).toBe('Importing a.skpack…');
    expect(reportText.offlineActivityLine(STRINGS.he, { kind: 'import', name: 'a.skpack', bytes: 45, total: 100 })).toBe('מייבא a.skpack · 45%');
  });
});

describe('share periods', () => {
  const { groupDownloadedByYear } = require('../screens/OfflineScreen') as typeof import('../screens/OfflineScreen');

  it('offers only months with something on the phone, in order', () => {
    const entry = (hebrewYear: number, hebrewDate: string) => ({ entry: { hebrewYear, hebrewDate, occasionId: 1, occasionLabel: '', audio: [], pdfs: [] }, targets: [], audioCount: 0, pdfCount: 0 });
    expect(groupDownloadedByYear([entry(5746, '5746-07-11'), entry(5736, '5736-01-13'), entry(5746, '5746-06A-14'), entry(5746, '5746-07-13')])).toEqual([
      { hebrewYear: 5736, occasions: 1, months: [{ token: '01', occasions: 1 }] },
      {
        hebrewYear: 5746,
        occasions: 3,
        months: [
          { token: '06A', occasions: 1 },
          { token: '07', occasions: 2 },
        ],
      },
    ]);
  });
});
