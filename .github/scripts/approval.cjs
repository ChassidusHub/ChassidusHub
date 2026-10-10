// The approval gate (.github/workflows/approval.yml): a pull request may reach main only once a reviewer has
// commented "APPROVE <head sha>" on it, naming the exact commit they read. Later commits keep that approval only
// when every one of them is the QA lane bringing main in ("QA: merge main ..."), changing nothing main did not.
// An open issue titled studio-stop holds every pull request, approved or not.
// Read-only: it lists comments, reviews, issues and commits, and writes nothing.

/** "APPROVE <sha>" at the start of a comment, the full forty-character commit id. */
const APPROVE = /^\s*APPROVE\s+([0-9a-f]{40})\b/i;

/** The QA lane's merge commits from main start with this line (docs: studio/briefs/qa.md, the merge train). */
const QA_MERGE = /^QA: merge main\b/;

/** Only people who can push to the repository approve; anyone can comment on a pull request. */
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/** The commit ids a trusted person approved, from comments and review bodies alike. */
function approvedShas(comments) {
  const shas = new Set();
  for (const comment of comments) {
    if (!TRUSTED.has(comment.author_association)) continue;
    const match = APPROVE.exec(comment.body ?? '');
    if (match) shas.add(match[1].toLowerCase());
  }
  return shas;
}

/** True when an open issue (not a pull request) is titled studio-stop. */
function stopped(issues) {
  return issues.some((issue) => !issue.pull_request && issue.state === 'open' && issue.title.trim().toLowerCase() === 'studio-stop');
}

/**
 * Whether the commits after an approved one (oldest first, as GitHub's compare lists them) are all the QA lane's
 * merges from main: two parents, the first the commit before it, the second already on main, and the QA line.
 * onMain(sha) says whether a commit is on main; mainFiles are the files main changed since the approved commit.
 * Returns null when they are, or the reason they are not.
 */
async function onlyQaMerges(approved, commits, onMain, changedFiles, mainFiles) {
  let previous = approved;
  for (const commit of commits) {
    const parents = commit.parents.map((p) => p.sha);
    const message = commit.commit.message;
    if (parents.length !== 2 || parents[0] !== previous || !QA_MERGE.test(message)) {
      return `${commit.sha.slice(0, 7)} came after the approved commit and is not the QA lane merging main.`;
    }
    if (!(await onMain(parents[1]))) return `${commit.sha.slice(0, 7)} merges a commit that is not on main.`;
    previous = commit.sha;
  }
  const extra = changedFiles.filter((file) => !mainFiles.has(file));
  if (extra.length) return `Since the approved commit, files main never changed were changed too: ${extra.slice(0, 5).join(', ')}.`;
  return null;
}

/** Decides one pull request. Returns { ok, summary }. */
async function decide({ github, owner, repo, pr }) {
  const head = pr.head.sha.toLowerCase();
  const base = pr.base.ref;

  const issues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', per_page: 100 });
  if (stopped(issues)) return { ok: false, summary: 'The studio is stopped: an issue titled studio-stop is open. Nothing merges until it is closed.' };

  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: pr.number, per_page: 100 });
  const reviews = await github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number: pr.number, per_page: 100 });
  const shas = approvedShas([...comments, ...reviews]);
  if (shas.has(head)) return { ok: true, summary: `Approved: a reviewer commented APPROVE ${head}, this pull request's head.` };
  if (!shas.size) return { ok: false, summary: `Waiting for a reviewer to comment "APPROVE ${head}".` };

  const onMain = async (sha) => {
    const { data } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${sha}...${base}`, per_page: 1 });
    return data.status === 'identical' || data.status === 'ahead';
  };
  const reasons = [];
  for (const approved of shas) {
    let compared;
    try {
      ({ data: compared } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${approved}...${head}`, per_page: 100 }));
    } catch {
      reasons.push(`${approved.slice(0, 7)} is not a commit of this pull request.`);
      continue;
    }
    // The approved commit must be in the head's history, and no further back than GitHub lists.
    if (compared.status !== 'ahead' || compared.behind_by !== 0 || compared.total_commits > compared.commits.length) {
      reasons.push(`${approved.slice(0, 7)} is not an earlier commit of this pull request's head.`);
      continue;
    }
    const last = compared.commits[compared.commits.length - 1];
    let mainFiles = new Set();
    if (last && last.parents.length === 2) {
      const { data: fromMain } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${approved}...${last.parents[1].sha}` });
      mainFiles = new Set((fromMain.files ?? []).map((f) => f.filename));
    }
    // GitHub lists at most 300 changed files; past that nobody can tell what else changed.
    if ((compared.files ?? []).length >= 300 || mainFiles.size >= 300) {
      reasons.push(`Too many files changed since ${approved.slice(0, 7)} to check the merges; approve the head.`);
      continue;
    }
    const changed = (compared.files ?? []).map((f) => f.filename);
    const reason = await onlyQaMerges(approved, compared.commits, onMain, changed, mainFiles);
    if (!reason) return { ok: true, summary: `Approved at ${approved.slice(0, 7)}; every commit since is the QA lane merging main.` };
    reasons.push(reason);
  }
  return { ok: false, summary: `The approval is for an older commit. Waiting for "APPROVE ${head}". ${reasons.join(' ')}` };
}

/** The workflow's step (actions/github-script). */
async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pr = context.payload.pull_request;
  const { ok, summary } = await decide({ github, owner, repo, pr });
  await core.summary.addRaw(summary).write();
  if (ok) core.info(summary);
  else core.setFailed(summary);
}

module.exports = { run, decide, approvedShas, stopped, onlyQaMerges };
