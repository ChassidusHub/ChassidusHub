# apps/www: the new ChassidusHub site

Built fresh from the approved prototype (build plan:
https://claude.ai/code/artifact/3ce74147-3357-41a0-8348-b527d362426c). Nothing is
taken from apps/web. Hebrew and right to left throughout; the beta is at
https://new.chassidushub.org, hidden from search engines, until the switch-over.

- `npm run dev:www` (from the repository root): the site with hot reload.
- `npm run build:www`, then `npm start -w @chassidushub/www`: the built site on
  Node at http://localhost:3001, as the browser tests see it.
- `npx playwright test` (in apps/www, after a build): the page budgets
  (e2e/budgets.ts), accessibility and a smoke test of every page in
  e2e/pages.ts, on a phone and a desktop. `BASE_URL=https://new.chassidushub.org`
  runs them against the beta; `CHROMIUM_PATH` uses a Chromium already installed.

In a cloud session DATABASE_URL is the live database: start anything local with
`env -u DATABASE_URL`.
