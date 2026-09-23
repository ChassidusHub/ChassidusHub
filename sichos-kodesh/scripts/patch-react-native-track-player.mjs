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

// Index of the `}` that closes the `{` at `openIndex`, skipping braces inside
// string literals (Kotlin templates like "${x}") and line comments.
function findClosingBrace(source, openIndex) {
  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '/' && source[i + 1] === '/') i = source.indexOf('\n', i);
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('Unable to apply react-native-track-player patch; unbalanced braces');
}

// `@ReactMethod fun x(...) = scope.launch { ... }` returns the coroutine Job,
// and React Native's TurboModule interop refuses to load a module whose
// non-synchronous methods return anything ("assumes returnType == void iff the
// method is synchronous") - a fatal crash at app start under the New
// Architecture. Rewriting each as a block body makes them return Unit.
const launchMethod = /\)\s*=\s*scope\.launch\s*\{/g;
let launchCount = 0;
for (let match = launchMethod.exec(updated); match; match = launchMethod.exec(updated)) {
  const openIndex = match.index + match[0].length - 1;
  const closeIndex = findClosingBrace(updated, openIndex);
  updated = `${updated.slice(0, match.index)}) { scope.launch {${updated.slice(openIndex + 1, closeIndex + 1)} }${updated.slice(closeIndex + 1)}`;
  launchMethod.lastIndex = match.index + 1;
  launchCount += 1;
}
if (launchCount > 0) changed = true;

if (changed) {
  fs.writeFileSync(filePath, updated);
  console.log(`Patched react-native-track-player (Kotlin 2.2 nullability; ${launchCount} launch-returning @ReactMethods made void)`);
} else {
  console.log('react-native-track-player Kotlin patch already applied');
}

// MusicService.emit()/emitList() reach the JS event emitter through
// `reactNativeHost.reactInstanceManager`, and React Native 0.87 (New
// Architecture only) throws "You should not use ReactNativeHost directly in
// the New Architecture" from that getter - a fatal crash the moment the
// service sends its first event after app start. HeadlessJsTaskService
// already exposes a `reactContext` property that resolves the context through
// the bridgeless ReactHost, so use that instead.
const servicePath = path.join(path.dirname(path.dirname(filePath)), 'service', 'MusicService.kt');
if (fs.existsSync(servicePath)) {
  const serviceOriginal = fs.readFileSync(servicePath, 'utf8');
  const legacyContext = 'reactNativeHost.reactInstanceManager.currentReactContext';
  if (serviceOriginal.includes(legacyContext)) {
    fs.writeFileSync(servicePath, serviceOriginal.split(legacyContext).join('reactContext'));
    console.log('Patched react-native-track-player MusicService (bridgeless React context lookup)');
  } else {
    console.log('react-native-track-player MusicService patch already applied');
  }
}
