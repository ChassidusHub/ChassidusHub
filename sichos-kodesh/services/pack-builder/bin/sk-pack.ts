#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { ArchiveStore } from '@sichos-kodesh/archive';
import { CATALOG_VERSION, parseCatalogReleaseFile, parseCatalogWorksIndex, parseWorkContents } from '@sichos-kodesh/catalog';
import type { AudioProfile, PackableLibraryCollection, TrustedKeys } from '@sichos-kodesh/pack-format';
import { AUDIO_PROFILES, PACKABLE_LIBRARY_COLLECTIONS, TRUSTED_PACK_KEYS, manifestBytes } from '@sichos-kodesh/pack-format';
import { buildPacks } from '../src/build.js';
import { loadYearEntries } from '../src/catalogData.js';
import type { CatalogEntry, LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';
import { createKeyFile, defaultKeyFile, readKeyFile, readPublicKey } from '../src/keys.js';
import { indexPacks } from '../src/packIndex.js';
import { mirrorPublished } from '../src/mirror.js';
import { publishArchive } from '../src/publish.js';
import { servePublished } from '../src/serve.js';
import { entriesInScope, parseScope, parseSections } from '../src/scope.js';
import { ffmpegEncoder, transcode, type EncodedProfile } from '../src/transcode.js';
import { verifyPack } from '../src/verify.js';
import { buildWorkPack } from '../src/workPack.js';

/**
 * sk-pack: builds signed packs from the archive (`sk-archive`), verifies
 * them, and writes their index. Takes the same archive root as sk-archive
 * (--root or SK_ARCHIVE_ROOT). See README.md for the routine.
 */

const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, '..', '..', '..');

const program = new Command()
  .name('sk-pack')
  .description('Build, verify and index .skpack files from the archive.')
  .option('--root <dir>', 'archive root', process.env.SK_ARCHIVE_ROOT ?? path.resolve(process.cwd(), 'archive'));

const root = () => program.opts<{ root: string }>().root;
const log = (line: string) => console.log(line);

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

program
  .command('keygen')
  .description('create the pack signing key (once); prints the public half for TRUSTED_PACK_KEYS')
  .option('--out <file>', 'key file (default <root>/keys/pack-signing.json)')
  .option('--force', 'replace an existing key (every pack signed with it stops verifying)')
  .option('--dev', 'write the published development key instead (debug builds of the app trust it; release builds never do)')
  .action(async (opts: { out?: string; force?: boolean; dev?: boolean }) => {
    const file = opts.out ?? defaultKeyFile(root());
    const pair = await createKeyFile(file, { force: opts.force, development: opts.dev });
    if (opts.dev) {
      log(`wrote the development key to ${file}: packs signed with it import on debug builds only`);
      return;
    }
    log(`wrote ${file} (keep an offline copy; never commit it)`);
    log(`key id:     ${pair.keyId}`);
    log(`public key: ${pair.publicKey}`);
    log('add to TRUSTED_PACK_KEYS in packages/pack-format/src/signing.ts:');
    log(`  '${pair.keyId}': '${pair.publicKey}',`);
  });

program
  .command('transcode')
  .description('encode the original recordings into a smaller audio profile, once each (needs ffmpeg with libopus)')
  .option('--profile <profile>', 'opus16 (the default: the phone plays it, and the listening test heard no difference), opus24, opus32 or mp3-32', 'opus16')
  .option('--collection <id>', 'only the recordings of one collection')
  .option('--scope <year[-month]>', 'only the recordings of items dated in a Hebrew year or month')
  .option('--limit <n>', 'stop after this many encodes', (v) => Number(v))
  .option('--concurrency <n>', 'parallel encodes (default: half the CPUs)', (v) => Number(v))
  .option('--ffmpeg <path>', 'the ffmpeg binary', process.env.SK_FFMPEG ?? 'ffmpeg')
  .action(async (opts: { profile: string; collection?: string; scope?: string; limit?: number; concurrency?: number; ffmpeg: string }) => {
    if (opts.profile === 'src' || !(AUDIO_PROFILES as readonly string[]).includes(opts.profile)) throw new Error(`--profile must be one of ${AUDIO_PROFILES.filter((p) => p !== 'src').join(', ')}`);
    const store = await ArchiveStore.open(root());
    try {
      const result = await transcode(store, {
        profile: opts.profile as EncodedProfile,
        encode: ffmpegEncoder(opts.ffmpeg),
        collection: opts.collection,
        scope: opts.scope,
        limit: opts.limit,
        concurrency: opts.concurrency,
        log,
      });
      log(`transcode ${opts.profile}: ${result.encoded} encoded (${formatBytes(result.bytesIn)} -> ${formatBytes(result.bytesOut)}), ${result.skipped} already done, ${result.failed} failed`);
      if (result.failed) process.exitCode = 1;
    } finally {
      store.close();
    }
  });

program
  .command('build')
  .description('build the pack(s) for a scope from the objects the archive holds')
  .requiredOption('--scope <year[-month]>', 'a Hebrew year (5736) or year and mafteiach month token (5736-01)')
  .option('--profile <profile>', `audio profile (${AUDIO_PROFILES.join(', ')}); opus16 by default, src for the originals`, 'opus16')
  .option('--sections <list>', 'essentials | everything | audio,biltiMugah[:sichosKodesh+torasMenachem],mugah,maamorim,hagahos,hosofos', 'essentials')
  .option('--max-mb <n>', 'split into parts of at most this many MB', (v) => Number(v), 200)
  .option('--out <dir>', 'output directory (default <root>/packs)')
  .option('--catalog-dir <dir>', 'catalog year files', path.join(repoRoot, 'apps', 'mobile', 'src', 'catalog', 'data'))
  .option('--catalog-version <v>', 'the catalog version the year files are', CATALOG_VERSION)
  .option('--catalog-release <file>', 'carry this catalog.json release in the pack')
  .option('--key <file>', 'signing key (default <root>/keys/pack-signing.json)')
  .option('--unsigned', 'build without a signature (the apps import such a pack only as loose files)')
  .option('--no-objects-index', 'leave objects.json out')
  .option('--allow-missing', 'build even when part of the selection is not archived yet')
  .action(
    async (opts: {
      scope: string;
      profile: string;
      sections: string;
      maxMb: number;
      out?: string;
      catalogDir: string;
      catalogVersion: string;
      catalogRelease?: string;
      key?: string;
      unsigned?: boolean;
      objectsIndex: boolean;
      allowMissing?: boolean;
    }) => {
      if (!(AUDIO_PROFILES as readonly string[]).includes(opts.profile)) throw new Error(`unknown profile ${opts.profile}`);
      if (!(opts.maxMb > 0)) throw new Error('--max-mb must be a positive number');
      const scope = parseScope(opts.scope);
      const contentTypes = parseSections(opts.sections);
      const entries = entriesInScope(await loadYearEntries(opts.catalogDir, scope.year), scope);
      if (entries.length === 0) throw new Error(`the catalog has no farbrengens in ${opts.scope}`);
      const key = opts.unsigned ? null : await readKeyFile(opts.key ?? defaultKeyFile(root()));
      let catalogRelease: { file: string; version: string } | undefined;
      if (opts.catalogRelease) {
        const release = parseCatalogReleaseFile(JSON.parse(await readFile(opts.catalogRelease, 'utf8')));
        if (!release) throw new Error(`${opts.catalogRelease} is not a catalog release`);
        catalogRelease = { file: opts.catalogRelease, version: release.version };
      }
      const store = await ArchiveStore.open(root());
      try {
        const result = await buildPacks(store, {
          entries,
          contentTypes,
          profile: opts.profile as AudioProfile,
          scope: scope.scope,
          slug: scope.slug,
          outDir: opts.out ?? path.join(root(), 'packs'),
          maxBytes: Math.floor(opts.maxMb * 1024 * 1024),
          key,
          catalogVersion: opts.catalogVersion,
          embedObjectsIndex: opts.objectsIndex,
          catalogRelease,
          allowMissing: !!opts.allowMissing,
          log,
        });
        log(`${scope.scope.label.en}: ${result.packs.length} pack(s), ${result.objects} object(s), ${formatBytes(result.objectBytes)}${result.missing.length ? `; ${result.missing.length} file(s) left out, not archived yet` : ''}${key ? `; signed with ${key.keyId}` : '; UNSIGNED'}`);
      } finally {
        store.close();
      }
    },
  );

program
  .command('build-work')
  .description("build a sefer's text pack (catalog schema 3): its texts from the archive and a search index")
  .requiredOption('--work <id...>', 'work ids, as the catalog names them (tanya, torah-or, ...); "all" for every work with texts that may ship')
  .option('--works-dir <dir>', 'the works the phone bundles', path.join(repoRoot, 'apps', 'mobile', 'src', 'catalog', 'data', 'works'))
  .option('--catalog-version <v>', 'the catalog version the works are', CATALOG_VERSION)
  .option('--max-mb <n>', 'split into parts of at most this many MB', (v) => Number(v), 200)
  .option('--out <dir>', 'output directory (default <root>/packs)')
  .option('--key <file>', 'signing key (default <root>/keys/pack-signing.json)')
  .option('--unsigned', 'build without a signature')
  .option('--allow-missing', 'build even when some texts are not archived yet')
  .action(async (opts: { work: string[]; worksDir: string; catalogVersion: string; maxMb: number; out?: string; key?: string; unsigned?: boolean; allowMissing?: boolean }) => {
    if (!(opts.maxMb > 0)) throw new Error('--max-mb must be a positive number');
    // works.json since WP13's generator; index.json in older checkouts.
    const indexFile = await readFile(path.join(opts.worksDir, 'works.json'), 'utf8').catch(() => readFile(path.join(opts.worksDir, 'index.json'), 'utf8'));
    const index = parseCatalogWorksIndex(JSON.parse(indexFile));
    if (!index) throw new Error(`${opts.worksDir}/works.json is not a works index`);
    // "all": every work with a text that may ship (the link-only ones have none to pack).
    const ids = opts.work.includes('all') ? index.works.filter((w) => (w.textBytes ?? 0) > 0).map((w) => w.id) : opts.work;
    const key = opts.unsigned ? null : await readKeyFile(opts.key ?? defaultKeyFile(root()));
    const store = await ArchiveStore.open(root());
    try {
      for (const id of ids) {
        const work = index.works.find((w) => w.id === id);
        if (!work) throw new Error(`the catalog has no work "${id}"`);
        const contents = parseWorkContents(JSON.parse(await readFile(path.join(opts.worksDir, 'contents', `${id}.json`), 'utf8').catch(() => 'null')), work);
        if (!contents) throw new Error(`${id} has no contents of its own (only imported works have texts)`);
        const result = await buildWorkPack(store, {
          work,
          contents,
          catalogVersion: opts.catalogVersion,
          outDir: opts.out ?? path.join(root(), 'packs'),
          key,
          maxBytes: opts.maxMb * 1024 * 1024,
          allowMissing: !!opts.allowMissing,
          log,
        });
        log(
          `${work.title.en}: ${result.packs.length} pack(s), ${result.texts} text(s) (${formatBytes(result.textBytes)}), search index ${formatBytes(result.search.bytes)} over ${result.search.rows} rows` +
            `${result.missing.length ? `; ${result.missing.length} text(s) left out, not archived yet` : ''}${key ? `; signed with ${key.keyId}` : '; UNSIGNED'}`,
        );
      }
    } finally {
      store.close();
    }
  });

program
  .command('verify')
  .description('check packs the way a phone would, and more')
  .argument('<packs...>')
  .option('--key <file>', 'also trust this key file (default <root>/keys/pack-signing.json when present)')
  .option('--trust <keyId=publicKey...>', 'also trust these public keys')
  .action(async (packs: string[], opts: { key?: string; trust?: string[] }) => {
    const trusted: TrustedKeys = { ...TRUSTED_PACK_KEYS };
    const own = await readPublicKey(opts.key ?? defaultKeyFile(root()));
    if (own) trusted[own.keyId] = own.publicKey;
    for (const pair of opts.trust ?? []) {
      const [keyId, publicKey] = pair.split('=');
      if (!keyId || !publicKey) throw new Error(`--trust takes keyId=publicKey, not ${pair}`);
      trusted[keyId] = publicKey;
    }
    let failed = 0;
    for (const file of packs) {
      const check = await verifyPack(file, trusted);
      const m = check.manifest;
      const what = m ? `${m.scope.label.en}, ${m.profile.audio}${m.part ? `, part ${m.part.index + 1}/${m.part.count}` : ''}, ${m.entries.length} entries, ${check.objects} objects (${formatBytes(manifestBytes(m))})` : 'unreadable';
      if (check.ok) log(`ok   ${path.basename(file)}: ${what}, signed by ${check.signature?.ok ? check.signature.keyId : '?'}`);
      else {
        failed += 1;
        log(`FAIL ${path.basename(file)}: ${what}`);
        for (const problem of check.problems) log(`     ${problem}`);
      }
    }
    if (failed) process.exitCode = 1;
  });

program
  .command('index')
  .description('write index.json for the packs in a directory')
  .option('--dir <dir>', 'packs directory (default <root>/packs)')
  .option('--out <file>', 'index file (default <dir>/index.json)')
  .action(async (opts: { dir?: string; out?: string }) => {
    const dir = opts.dir ?? path.join(root(), 'packs');
    const { index, skipped } = await indexPacks(dir);
    const out = opts.out ?? path.join(dir, 'index.json');
    await writeFile(out, `${JSON.stringify(index, null, 2)}\n`);
    log(`index: ${index.packs.length} pack(s) -> ${out}`);
    for (const line of skipped) log(`  skipped ${line}`);
  });

program
  .command('publish')
  .description('write the archive as the pack API reads it (objects, per-year shards, packs), for rclone sync to R2 or sk-pack serve')
  .option('--out <dir>', 'published directory (default <root>/published)')
  .option('--catalog-dir <dir>', 'catalog year files', path.join(repoRoot, 'apps', 'mobile', 'src', 'catalog', 'data'))
  .option('--catalog-version <v>', 'the catalog version the year files are', CATALOG_VERSION)
  .option('--packs <dir>', 'prebuilt packs to publish too (default <root>/packs when it exists)')
  .option('--library-dir <dir>', 'the library collections (catalog schema 2)', path.join(repoRoot, 'apps', 'mobile', 'src', 'catalog', 'data', 'library'))
  .option('--works-dir <dir>', "the works catalog: the seforim's titles and authors, for the text packs among the prebuilt ones", path.join(repoRoot, 'apps', 'mobile', 'src', 'catalog', 'data', 'works'))
  .action(async (opts: { out?: string; catalogDir: string; catalogVersion: string; packs?: string; libraryDir: string; worksDir: string }) => {
    const years = new Map<number, CatalogEntry[]>();
    for (let year = 5680; year <= 5780; year += 1) {
      const entries = await loadYearEntries(opts.catalogDir, year).catch(() => []);
      if (entries.length > 0) years.set(year, entries);
    }
    const library: Partial<Record<PackableLibraryCollection, LibraryCollection<LibraryItemBase>>> = {};
    for (const collection of PACKABLE_LIBRARY_COLLECTIONS) {
      const text = await readFile(path.join(opts.libraryDir, `${collection}.json`), 'utf8').catch(() => null);
      if (text) library[collection] = JSON.parse(text) as LibraryCollection<LibraryItemBase>;
    }
    const packsDir = opts.packs ?? path.join(root(), 'packs');
    const hasPacks = await stat(packsDir).then((info) => info.isDirectory()).catch(() => false);
    const store = await ArchiveStore.open(root());
    try {
      const worksText = await readFile(path.join(opts.worksDir, 'works.json'), 'utf8').catch(() => null);
      const works = worksText ? (parseCatalogWorksIndex(JSON.parse(worksText)) ?? undefined) : undefined;
      await publishArchive(store, { years, library, ...(works ? { works } : {}), catalogVersion: opts.catalogVersion, outDir: opts.out ?? path.join(root(), 'published'), ...(hasPacks ? { packsDir } : {}), log });
    } finally {
      store.close();
    }
  });

program
  .command('mirror')
  .description('copy a published directory to the R2 bucket the pack API reads, over Cloudflare\'s API (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)')
  .option('--dir <dir>', 'published directory (default <root>/published)')
  .option('--bucket <name>', 'R2 bucket', 'sichos-kodesh-archive')
  .option('--concurrency <n>', 'parallel uploads', (v) => Number(v), 4)
  .option('--prune', 'drop each mirrored object from this disk, the archive\'s copy too (a small disk publishes a year at a time)')
  .action(async (opts: { dir?: string; bucket: string; concurrency: number; prune?: boolean }) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !token) throw new Error('set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (a token with R2 edit rights)');
    const store = opts.prune ? await ArchiveStore.open(root()) : null;
    try {
      await mirrorPublished({
        dir: opts.dir ?? path.join(root(), 'published'),
        target: { accountId, bucket: opts.bucket, token },
        concurrency: opts.concurrency,
        ...(store ? { prune: { store } } : {}),
        log,
      });
    } finally {
      store?.close();
    }
  });

program
  .command('serve')
  .description('run the pack API on a published directory (local development, or a server with no cloud)')
  .option('--dir <dir>', 'published directory (default <root>/published)')
  .option('--port <n>', 'port', (v) => Number(v), 8787)
  .option('--host <host>', 'address to listen on', '127.0.0.1')
  .option('--key <file>', 'signing key (default <root>/keys/pack-signing.json)')
  .option('--unsigned', 'serve unsigned custom packs (the apps take them only as loose files)')
  .action(async (opts: { dir?: string; port: number; host: string; key?: string; unsigned?: boolean }) => {
    const key = opts.unsigned ? null : await readKeyFile(opts.key ?? defaultKeyFile(root()));
    const dir = opts.dir ?? path.join(root(), 'published');
    await servePublished(dir, { port: opts.port, host: opts.host, signingKey: key });
    log(`pack API on http://${opts.host}:${opts.port}/v1/meta (${dir}, ${key ? `signing as ${key.keyId}` : 'UNSIGNED'})`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
