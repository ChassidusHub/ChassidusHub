#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import type { ApkAbi } from '../src/apk.js';
import { APK_ABIS, copyApkTo, syncApk } from '../src/apk.js';
import { packApi } from '../src/api.js';
import type { StationConfig } from '../src/config.js';
import { DEFAULT_CONFIG, configProblems, parseStationConfig, parseTrustPairs } from '../src/config.js';
import { formatBytes } from '../src/labels.js';
import { mirrorPaths, readMirrorIndex, syncMirror } from '../src/mirror.js';
import { directoryPhone, findSharedFolder, loadPhone, planPhone, readPhoneState } from '../src/phone.js';
import { writePlayerFolders } from '../src/player.js';

/**
 * sk-station: the yeshiva station (docs/offline-plan.md WP6), on the
 * command line. The mirror root holds station.json, the packs and their
 * index (--root, or SK_STATION_ROOT). See README.md for the routine.
 */

const program = new Command()
  .name('sk-station')
  .description('Keep a mirror of signed packs, and load phones (or plain MP3 players) from it.')
  .option('--root <dir>', 'mirror root', process.env.SK_STATION_ROOT ?? path.resolve(process.cwd(), 'station'));

const root = () => program.opts<{ root: string }>().root;
const log = (line: string) => console.log(line);

async function readConfig(): Promise<StationConfig> {
  const file = mirrorPaths(root()).config;
  const config = parseStationConfig(JSON.parse(await readFile(file, 'utf8').catch(() => 'null')));
  if (!config) throw new Error(`no station config at ${file}: run sk-station init first`);
  const problems = configProblems(config);
  if (problems.length > 0) throw new Error(`${file}:\n  ${problems.join('\n  ')}`);
  return config;
}

async function mirrorIndex() {
  const index = await readMirrorIndex(root());
  if (!index) throw new Error(`no mirror at ${root()} yet: run sk-station sync first`);
  return index;
}

async function sharedFolder(dir: string): Promise<string> {
  const found = await findSharedFolder(dir);
  if (!found) throw new Error(`${dir} has no state/ or import/ folder, nor Documents/SichosKodesh: pick the app's shared folder in Settings > Offline packs first`);
  return found;
}

program
  .command('init')
  .description('write station.json: the pack API and the scopes to keep ready')
  .requiredOption('--api <url>', 'the pack API (services/pack-api, or sk-pack serve)')
  .option('--scope <scope...>', 'Hebrew years or year-months to keep ready (5736, 5736-01)', [])
  .option('--sections <spec>', 'essentials, everything, or a list', DEFAULT_CONFIG.sections)
  .option('--profile <profile>', 'audio profile', DEFAULT_CONFIG.profile)
  .option('--max-mb <n>', 'largest pack file in MB', (v) => Number(v), DEFAULT_CONFIG.maxMb)
  .option('--trust <keyId=publicKey...>', 'extra trusted signing keys', [])
  .option('--accept-unsigned', 'keep packs whose signature does not verify (an API run with --unsigned)')
  .option('--reserve-mb <n>', 'space to leave free on a phone', (v) => Number(v), DEFAULT_CONFIG.phoneReserveMb)
  .action(async (opts: { api: string; scope: string[]; sections: string; profile: string; maxMb: number; trust: string[]; acceptUnsigned?: boolean; reserveMb: number }) => {
    const trust = parseTrustPairs(opts.trust);
    const config: StationConfig = {
      ...DEFAULT_CONFIG,
      api: opts.api,
      scopes: opts.scope,
      sections: opts.sections,
      profile: opts.profile,
      maxMb: opts.maxMb,
      trust,
      acceptUnsigned: opts.acceptUnsigned === true,
      phoneReserveMb: opts.reserveMb,
    };
    const problems = configProblems(config);
    if (problems.length > 0) throw new Error(problems.join('\n'));
    await mkdir(root(), { recursive: true });
    await writeFile(mirrorPaths(root()).config, `${JSON.stringify(config, null, 2)}\n`);
    log(`station config -> ${mirrorPaths(root()).config} (${config.scopes.length} scope(s))`);
  });

program
  .command('sync')
  .description('fetch every pack the scopes call for, verify each, and index the mirror (run it overnight)')
  .action(async () => {
    const config = await readConfig();
    const report = await syncMirror({ root: root(), config, api: packApi(config.api), log });
    log(
      `sync: ${report.downloaded.length} fetched (${formatBytes(report.downloadedBytes)}), ${report.kept.length} kept, ${report.removed.length} removed, ${report.failed.length} failed; ${report.packs} pack(s) in the mirror`,
    );
    if (report.unsigned.length > 0) log(`  unsigned: ${report.unsigned.join(', ')}`);
    for (const { file, problem } of report.failed) log(`  FAILED ${file}: ${problem}`);
    if (report.failed.length > 0) process.exitCode = 1;
  });

program
  .command('status <phone>')
  .description("what loading this phone would copy: reads its state/have.json and device.json")
  .action(async (phoneDir: string) => {
    const config = await readConfig();
    const folder = await sharedFolder(phoneDir);
    const state = await readPhoneState(directoryPhone(folder));
    const plan = planPhone(await mirrorIndex(), state, { reserveBytes: config.phoneReserveMb * 1024 * 1024 });
    if (state.device) log(`${state.device.model} · Android ${state.device.androidVersion} · app ${state.device.appVersion} · ${formatBytes(state.device.freeBytes)} free`);
    if (state.have) log(`holds ${state.have.objects.length} object(s), catalog ${state.have.catalogVersion}`);
    for (const warning of plan.warnings) log(`! ${warning}`);
    log(plan.summary);
    for (const pack of plan.copy) log(`  + ${pack.label}: ${pack.entry.file} (${formatBytes(pack.entry.bytes)}; ${pack.delta.missing.length} new object(s), ${formatBytes(pack.delta.missingBytes)})`);
    for (const pack of plan.noRoom) log(`  - no room: ${pack.label} (${formatBytes(pack.cost)})`);
    if (state.pending.length > 0) log(`  waiting in import/: ${state.pending.join(', ')}`);
  });

program
  .command('load <phone>')
  .description('copy the packs this phone lacks into its import/ folder')
  .action(async (phoneDir: string) => {
    const config = await readConfig();
    const folder = await sharedFolder(phoneDir);
    const phone = directoryPhone(folder);
    const plan = planPhone(await mirrorIndex(), await readPhoneState(phone), { reserveBytes: config.phoneReserveMb * 1024 * 1024 });
    log(plan.summary);
    if (plan.copy.length === 0) return;
    const report = await loadPhone(plan, mirrorPaths(root()).packs, phone, (file, i, count) => log(`  ${i + 1}/${count} ${file}`));
    log(`copied ${report.copied.length} pack(s), ${formatBytes(report.bytes)}. Unplug the phone and open the app: it imports them and checks every file.`);
  });

program
  .command('player <out>')
  .description('write the mirror\'s recordings as plain MP3 folders for a player with no app')
  .option('--scope <scope...>', 'only these years or year-months')
  .action(async (out: string, opts: { scope?: string[] }) => {
    const report = await writePlayerFolders({ root: root(), index: await mirrorIndex(), out, ...(opts.scope ? { scopes: opts.scope } : {}), onFile: (file) => log(`  ${file}`) });
    log(`player: ${report.written} file(s) written (${formatBytes(report.bytes)}), ${report.kept} already there`);
    if (report.notMp3.length > 0) log(`  skipped (not MP3): ${report.notMp3.join(', ')}`);
  });

program
  .command('apk')
  .description("fetch the newest release's phone APKs from the app server into the mirror, for phones without the app")
  .option('--server <url>', 'the app server', 'https://api.sk.shmuky.dev')
  .action(async (opts: { server: string }) => {
    const report = await syncApk(root(), undefined, opts.server);
    log(`apk ${report.version}: ${report.downloaded.length} fetched, ${report.kept.length} kept`);
  });

program
  .command('apk-to <storage>')
  .description("copy the app's APK into a phone's Download/ folder")
  .option('--abi <abi>', `${APK_ABIS.join(' or ')}`, 'arm64-v8a')
  .action(async (storage: string, opts: { abi: string }) => {
    if (!(APK_ABIS as readonly string[]).includes(opts.abi)) throw new Error(`--abi must be ${APK_ABIS.join(' or ')}`);
    log(`copied to ${await copyApkTo(root(), storage, opts.abi as ApkAbi)}: open it in the phone's file manager to install`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
