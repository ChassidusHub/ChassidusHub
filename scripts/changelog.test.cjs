// Folding changes/ into CHANGELOG.md: node --test scripts/changelog.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const { fold } = require('./changelog.cjs');

const NOTE = 'The newest entries wait as one file each in [changes/](changes/) until\n`npm run changelog` moves them in below.\n';
const log = `# Changelog\n\nIntro.\n\n## Unreleased\n\n${NOTE}\n- Old entry.\n`;

test('entries go under the note, newest first, above the old ones', () => {
  const out = fold(log, [
    { file: 'a.md', at: 100, text: '- Older new entry.\n' },
    { file: 'b.md', at: 200, text: '- Newer entry,\n  on two lines.\n' },
  ]);
  assert.strictEqual(out, `# Changelog\n\nIntro.\n\n## Unreleased\n\n${NOTE}\n- Newer entry,\n  on two lines.\n\n- Older new entry.\n\n- Old entry.\n`);
});

test('entries added at the same time keep the order of their names', () => {
  const out = fold(log, [{ file: 'z.md', at: 5, text: '- Z.' }, { file: 'a.md', at: 5, text: '- A.' }]);
  assert.ok(out.indexOf('- A.') < out.indexOf('- Z.'));
});

test('without the note, entries go straight under the heading', () => {
  const out = fold('## Unreleased\n\n- Old.\n', [{ file: 'a.md', at: 1, text: '- New.' }]);
  assert.strictEqual(out, '## Unreleased\n\n- New.\n\n- Old.\n');
});

test('a changelog without "Unreleased" is an error, not a guess', () => {
  assert.throws(() => fold('# Changelog\n', [{ file: 'a.md', at: 1, text: '- New.' }]), /Unreleased/);
});
