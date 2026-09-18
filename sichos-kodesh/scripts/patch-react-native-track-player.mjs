import fs from 'node:fs';
import path from 'node:path';

const filePath = path.join(
  process.cwd(),
  'node_modules',
  'react-native-track-player',
  'android',
  'src',
  'main',
  'java',
  'com',
  'doublesymmetry',
  'trackplayer',
  'module',
  'MusicModule.kt',
);

if (!fs.existsSync(filePath)) {
  console.log('react-native-track-player not installed; skipping Kotlin patch');
  process.exit(0);
}

const original = fs.readFileSync(filePath, 'utf8');
const replacements = [
  {
    from: '            callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))',
    to: '            callback.resolve(musicService.tracks[index].originalItem?.let { Arguments.fromBundle(it) })',
  },
  {
    from: '            else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )',
    to: '            else musicService.tracks[musicService.getCurrentTrackIndex()].originalItem?.let {\n                Arguments.fromBundle(it)\n            }',
  },
];

let updated = original;
let changed = false;
for (const { from, to } of replacements) {
  if (updated.includes(to)) {
    continue;
  }
  if (!updated.includes(from)) {
    throw new Error(`Unable to apply react-native-track-player patch; missing snippet: ${from}`);
  }
  updated = updated.replace(from, to);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, updated);
  console.log('Patched react-native-track-player for Kotlin 2.2 nullability');
} else {
  console.log('react-native-track-player Kotlin patch already applied');
}
