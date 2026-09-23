/**
 * Prints the GitHub Release notes for the current APP_VERSION as markdown -
 * what the "Android Signed Release APK" workflow puts on the release it
 * publishes: which APK to install, then the changelog entry in English and
 * Hebrew. Fails when src/changelog.ts has no entry for APP_VERSION: a
 * release without notes is a mistake (the same check the catalog release
 * makes on its changelog).
 *
 *   npm run --silent release-notes -w @sichos-kodesh/mobile
 */
import { APP_VERSION, CHANGELOG } from '../src/changelog';

const entry = CHANGELOG.find((e) => e.version === APP_VERSION);
if (!entry) {
  throw new Error(`src/changelog.ts has no entry for APP_VERSION ${APP_VERSION} - add one before releasing.`);
}

const apk = (abi: string) => `sichos-kodesh-${APP_VERSION}-${abi}.apk`;
const lines = [
  `## Sichos Kodesh ${APP_VERSION}`,
  '',
  '**Which file to install**',
  '',
  `- \`${apk('arm64-v8a')}\` - any phone from the last several years (64-bit). Start here.`,
  `- \`${apk('armeabi-v7a')}\` - an old 32-bit phone, when the first one refuses to install.`,
  `- \`${apk('universal')}\` - both in one file, about twice the size.`,
  '',
  'Installs over an earlier version and keeps your downloads and settings.',
  '',
  "### What's new",
  '',
  ...entry.en.map((line) => `- ${line}`),
  '',
  '### מה חדש',
  '',
  ...entry.he.map((line) => `- ${line}`),
];
console.log(lines.join('\n'));
