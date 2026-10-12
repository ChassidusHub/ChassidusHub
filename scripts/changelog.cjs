#!/usr/bin/env node
/**
 * Moves the entries waiting in changes/ into CHANGELOG.md's "Unreleased" list, newest first, and deletes
 * their files: `npm run changelog`. Pull requests add a file there instead of editing CHANGELOG.md, because
 * entries added at the top of the same list put every other open pull request in conflict (changes/README.md).
 *
 * Newest is the time git first saw the file; a file not yet committed counts as newest of all.
 * Tests: node --test scripts/changelog.test.cjs
 */
const { execFileSync } = require('node:child_process');
const { readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');

const HEADING = '## Unreleased\n';
// The note under the heading that points at changes/; entries go in after it.
const NOTE_END = 'moves them in below.\n';

/** The changelog with these entries ({ text, at }) at the top of "Unreleased", newest first. */
function fold(changelog, entries) {
  const heading = changelog.indexOf(HEADING);
  if (heading < 0) throw new Error(`CHANGELOG.md has no "${HEADING.trim()}" heading.`);
  const note = changelog.indexOf(NOTE_END, heading);
  const at = note < 0 ? heading + HEADING.length : note + NOTE_END.length;
  const sorted = [...entries].sort((a, b) => b.at - a.at || a.file.localeCompare(b.file));
  const rest = changelog.slice(at).replace(/^\n+/, '');
  return `${changelog.slice(0, at)}\n${sorted.map((e) => `${e.text.trim()}\n\n`).join('')}${rest}`;
}

/** When git first saw changes/<file>, in seconds; not yet committed is newest of all. */
function added(file) {
  const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%ct', '--', `changes/${file}`], { encoding: 'utf8' }).trim();
  return out ? Number(out.split('\n').at(-1)) : Number.MAX_SAFE_INTEGER;
}

if (require.main === module) {
  const files = readdirSync('changes').filter((name) => name.endsWith('.md') && name !== 'README.md');
  if (!files.length) {
    console.log('No entries waiting in changes/.');
  } else {
    const entries = files.map((file) => ({ file, at: added(file), text: readFileSync(`changes/${file}`, 'utf8') }));
    writeFileSync('CHANGELOG.md', fold(readFileSync('CHANGELOG.md', 'utf8'), entries));
    for (const file of files) rmSync(`changes/${file}`);
    console.log(`Moved ${files.length} entr${files.length === 1 ? 'y' : 'ies'} into CHANGELOG.md: ${files.join(', ')}`);
  }
}

module.exports = { fold };
