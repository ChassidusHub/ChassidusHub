# Changes not yet in the changelog

Each pull request that changes something people or programs will notice
adds **one new file here** instead of editing [CHANGELOG.md](../CHANGELOG.md):
`changes/<subject>.md`, named like its branch's subject (for example
`changes/search-parsha.md`), holding the entry as it should read in the
changelog, one or more `- ` paragraphs.

Why: every pull request used to add its entry at the top of
CHANGELOG.md's "Unreleased" list, so each merge put every other open
pull request in conflict there, and CI stops running on a conflicted head.
In the studio's first day that was 9 of the Reviewer's 31 "Changes
needed" (studio/status/studio-report.md). New files never conflict.

`npm run changelog` moves these entries into CHANGELOG.md, newest first,
and deletes the files. It runs in a pull request of its own that touches
nothing else, so it conflicts with nobody.

CI's "Changelog entry" check fails a pull request that changes the API
(`services/api/src/openapi.ts`) without adding an entry here. Folding is
tested by `node --test scripts/changelog.test.cjs`.
