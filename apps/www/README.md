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

## Who builds what

The design system (`app/ui`), the shell, the player and the routes table are
the foundation's; every screen is one route file, owned by one screen thread.
Screens are put together from `app/ui` only: a missing colour, size or piece
is asked of the foundation, never added in a screen.

| Route | File | Thread |
| --- | --- | --- |
| `/` | routes/home.tsx | 1. Home and listening |
| `/listen`, `/listen/:year` | routes/listen.tsx | 1. Home and listening |
| `/library` | routes/library.tsx | 2. Library and path bar |
| any item's path, `/rh-…` | routes/item.tsx (a shelf, sefer or volume: 2; a sicha: 3; an event or recording: 1) | foundation, then by kind |
| `/search` | routes/search.tsx | 5. Search |
| `/me/fixes` | routes/fixes.tsx | 4. Fixing and Edit |
| `/signin`, `/about`, `/back` | routes/signin.tsx, about.tsx, backroom.tsx | 6. Back room and the rest |
| `/ui` | routes/ui.tsx: every piece of the design system | foundation |

A page's loader reads the API as `context.api` (the typed client of
packages/client; through the Worker's service binding on Cloudflare). A route
names its place in the bar with `handle = { section }`; a page's top is
`<TopBar path={…} />` or `<TopBar title={…} />`.

In a cloud session DATABASE_URL is the live database: start anything local with
`env -u DATABASE_URL`.
