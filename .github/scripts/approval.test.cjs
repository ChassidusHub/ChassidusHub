// The approval gate's decisions, with GitHub played by a fake: node --test .github/scripts/approval.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const { decide } = require('./approval.cjs');

const A = 'a'.repeat(40), B = 'b'.repeat(40), M = 'c'.repeat(40), X = 'd'.repeat(40);

/** A fake GitHub: issues, comments, and compare answers by "base...head". */
function fake({ issues = [], comments = [], reviews = [], compare = {}, commits = [] }) {
  const rest = {
    issues: { listForRepo: () => issues, listComments: () => comments },
    pulls: { listReviews: () => reviews },
    repos: {
      getCommit: async ({ ref }) => {
        const commit = commits.find((c) => c.sha === ref);
        if (!commit) throw new Error(`no commit ${ref}`);
        return { data: commit };
      },
      compareCommitsWithBasehead: async ({ basehead }) => {
        if (!(basehead in compare)) throw new Error(`no commit ${basehead}`);
        return { data: compare[basehead] };
      },
    },
  };
  return { rest, paginate: async (fn) => fn() };
}
const pr = (head) => ({ number: 7, head: { sha: head }, base: { ref: 'main' } });
const said = (body, author_association = 'MEMBER') => ({ body, author_association });
const merge = (sha, first, second, message = 'QA: merge main into claude/site-x') => ({ sha, parents: [{ sha: first }, { sha: second }], commit: { message } });

test('approved at the head passes', async () => {
  const github = fake({ comments: [said(`APPROVE ${A}`)] });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(A) })).ok, true);
});

test('an approval in a review body counts too', async () => {
  const github = fake({ reviews: [said(`APPROVE ${A}\nLooks right.`)] });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(A) })).ok, true);
});

test('no approval fails', async () => {
  const github = fake({ comments: [said('Looks good')] });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(A) })).ok, false);
});

test('a stranger cannot approve', async () => {
  const github = fake({ comments: [said(`APPROVE ${A}`, 'NONE')] });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(A) })).ok, false);
});

test('a short sha is not enough', async () => {
  const github = fake({ comments: [said(`APPROVE ${A.slice(0, 7)}`)] });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(A) })).ok, false);
});

test('studio-stop holds even an approved head', async () => {
  const github = fake({ issues: [{ title: 'studio-stop', state: 'open' }], comments: [said(`APPROVE ${A}`)] });
  const result = await decide({ github, owner: 'o', repo: 'r', pr: pr(A) });
  assert.equal(result.ok, false);
  assert.match(result.summary, /stopped/);
});

test('a pull request titled studio-stop is not the stop', async () => {
  const github = fake({ issues: [{ title: 'studio-stop', state: 'open', pull_request: {} }], comments: [said(`APPROVE ${A}`)] });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(A) })).ok, true);
});

test('a builder commit after the approval fails', async () => {
  const github = fake({
    comments: [said(`APPROVE ${A}`)],
    compare: { [`${A}...${B}`]: { status: 'ahead', behind_by: 0, total_commits: 1, commits: [], files: [{ filename: 'x.ts' }] } },
    commits: [{ sha: B, parents: [{ sha: A }], commit: { message: 'more' } }],
  });
  const result = await decide({ github, owner: 'o', repo: 'r', pr: pr(B) });
  assert.equal(result.ok, false);
  assert.match(result.summary, /APPROVE b{40}/);
});

test('a QA merge of main after the approval passes', async () => {
  const github = fake({
    comments: [said(`APPROVE ${A}`)],
    compare: {
      [`${A}...${B}`]: { status: 'ahead', behind_by: 0, total_commits: 1, commits: [], files: [{ filename: 'main-file.ts' }] },
      [`${A}...${M}`]: { status: 'ahead', files: [{ filename: 'main-file.ts' }] },
      [`${M}...main`]: { status: 'identical' },
    },
    commits: [merge(B, A, M)],
  });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(B) })).ok, true);
});

test('a merge that is not from main fails', async () => {
  const github = fake({
    comments: [said(`APPROVE ${A}`)],
    compare: {
      [`${A}...${B}`]: { status: 'ahead', behind_by: 0, total_commits: 1, commits: [], files: [{ filename: 'f.ts' }] },
      [`${A}...${X}`]: { status: 'ahead', files: [{ filename: 'f.ts' }] },
      [`${X}...main`]: { status: 'diverged' },
    },
    commits: [merge(B, A, X)],
  });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(B) })).ok, false);
});

test('a merge without the QA line fails', async () => {
  const github = fake({
    comments: [said(`APPROVE ${A}`)],
    compare: {
      [`${A}...${B}`]: { status: 'ahead', behind_by: 0, total_commits: 1, commits: [], files: [] },
      [`${A}...${M}`]: { status: 'ahead', files: [] },
      [`${M}...main`]: { status: 'identical' },
    },
    commits: [merge(B, A, M, "Merge branch 'main'")],
  });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(B) })).ok, false);
});

test('a QA merge that slips in a change of its own fails', async () => {
  const github = fake({
    comments: [said(`APPROVE ${A}`)],
    compare: {
      [`${A}...${B}`]: { status: 'ahead', behind_by: 0, total_commits: 1, commits: [], files: [{ filename: 'main-file.ts' }, { filename: 'sneaky.ts' }] },
      [`${A}...${M}`]: { status: 'ahead', files: [{ filename: 'main-file.ts' }] },
      [`${M}...main`]: { status: 'identical' },
    },
    commits: [merge(B, A, M)],
  });
  const result = await decide({ github, owner: 'o', repo: 'r', pr: pr(B) });
  assert.equal(result.ok, false);
  assert.match(result.summary, /sneaky\.ts/);
});

test('past the 300 files GitHub lists, a QA merge cannot be checked', async () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ filename: `f${i}.ts` }));
  const github = fake({
    comments: [said(`APPROVE ${A}`)],
    compare: {
      [`${A}...${B}`]: { status: 'ahead', behind_by: 0, total_commits: 1, commits: [], files: many },
      [`${A}...${M}`]: { status: 'ahead', files: many },
      [`${M}...main`]: { status: 'identical' },
    },
    commits: [merge(B, A, M)],
  });
  const result = await decide({ github, owner: 'o', repo: 'r', pr: pr(B) });
  assert.equal(result.ok, false);
  assert.match(result.summary, /Too many files/);
});

test("main's own commits listed by the compare are not taken for the pull request's", async () => {
  // The shape of #86: head B merges main (M2) into the approved A; main's commit M2 shows in the compare too.
  const M2 = 'e'.repeat(40);
  const github = fake({
    comments: [said(`APPROVE ${A}`)],
    compare: {
      [`${A}...${B}`]: { status: 'ahead', behind_by: 0, total_commits: 2, commits: [{ sha: M2, parents: [{ sha: M }], commit: { message: 'ci: the gate (#85)' } }, merge(B, A, M2)], files: [{ filename: 'main-file.ts' }] },
      [`${A}...${M2}`]: { status: 'ahead', files: [{ filename: 'main-file.ts' }] },
      [`${M2}...main`]: { status: 'identical' },
    },
    commits: [merge(B, A, M2)],
  });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(B) })).ok, true);
});

test('two QA merges in a row pass', async () => {
  const C = 'f'.repeat(40), M2 = 'e'.repeat(40);
  const github = fake({
    comments: [said(`APPROVE ${A}`)],
    compare: {
      [`${A}...${C}`]: { status: 'ahead', behind_by: 0, files: [{ filename: 'main-file.ts' }] },
      [`${A}...${M2}`]: { status: 'ahead', files: [{ filename: 'main-file.ts' }] },
      [`${M}...main`]: { status: 'ahead' },
      [`${M2}...main`]: { status: 'identical' },
    },
    commits: [merge(B, A, M), merge(C, B, M2)],
  });
  assert.equal((await decide({ github, owner: 'o', repo: 'r', pr: pr(C) })).ok, true);
});
