# @sichos-kodesh/kvius-engine

The core "kvius" matching and scheduling engine for the Sichos Kodesh app. Given
the current Hebrew year and a historical year the user wants to "follow along
with," this computes which week's/date's recording from that historical year
(or a fallback year) corresponds to each week/date of the current year.

No hand-transcribed table of the traditional "14 keviyot" — every fact here is
derived from calendar arithmetic via [`@hebcal/core`](https://www.npmjs.com/package/@hebcal/core),
so it's correct for any year that library supports, not just the years someone
happened to type into a chart.

## Concepts

- **Kviah / kvius signature** (`kviusSignature`): the triple of (leap status,
  Rosh Hashana weekday, year-length class) that fully determines a Hebrew
  year's day-of-week-to-date mapping — and therefore its entire Torah-reading
  and holiday-vs-Shabbos structure. Two years with the same signature are
  "kvius-matched."
- **Kvius code** (`kviusCode`): the traditional 3-letter Hebrew mnemonic (e.g.
  `גכה`), for display purposes — derived, not looked up.
- **Weekly occasions** (`buildWeeklySchedule`): one entry per Shabbat of a
  Hebrew year, with its parsha (or the holiday that displaced it), keyed by a
  stable `week:<n>` index anchored to the first Shabbat on/after Rosh Hashana.
  Kvius-matched years always produce structurally identical arrays.
- **Fixed-date occasions** (`buildFixedDateSchedule`): Hebrew-date-anchored
  content (Yud-Tes Kislev, Purim, etc.), with Adar-anchored occasions
  resolved to the correct Adar (I vs II) via a resolver function.
- **Gap resolution** (`resolveOccasion` / `buildMatchedSchedule`): for a given
  occasion, checks a manual override, then the user's chosen source year,
  then — under the `'nearestKviusYear'` strategy — the nearest other
  kvius-matched year that actually has a recording. Never silently guesses; a
  fully unresolved occasion comes back as `{ status: 'gap', resolvedYear: null }`.
- **Historical bounds** (`MIN_HISTORICAL_YEAR` / `MAX_HISTORICAL_YEAR`, both
  exported): 5690-5752, the real span of `packages/mafteiach-index`'s
  crawled catalog (verified against the database, not assumed).
  `findMatchingYears` defaults to, and clamps any explicit range to, this
  span by default — a kvius match outside it can never resolve to an actual
  recording, so there's no reason to ever offer one as a candidate. Pass
  `allowOutOfHistoricalRange: true` to search past it (calendar-math
  testing/demos only; neither app does this).

## Usage

```ts
import { buildMatchedSchedule, findMatchingYears } from '@sichos-kodesh/kvius-engine';

const targetYear = 5786; // current Hebrew year
const candidates = findMatchingYears(targetYear); // defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR]
const sourceYear = candidates[0].hebrewYear; // user picks one of these

const schedule = buildMatchedSchedule(targetYear, sourceYear, {
  il: false, // Diaspora vs Israel Sedra schedule
  gapStrategy: 'nearestKviusYear',
  matchingYearsRange: { fromYear: 5690, toYear: 5752 },
  hasRecording: (year, occasionKey) => catalog.has(year, occasionKey), // app-supplied
  fixedOccasions: [
    { key: 'yud-tes-kislev', label: 'Yud-Tes Kislev', day: 19, month: 9 },
  ],
});
```

`buildMatchedSchedule` throws if `sourceYear` isn't actually kvius-matched to
`targetYear` — only ever offer users years returned by `findMatchingYears`.

## ⚠️ Licensing note: `@hebcal/core` is GPL-2.0

`@hebcal/core` (and its `@hebcal/hdate` dependency) is licensed **GPL-2.0**,
not MIT/permissive. That's a copyleft obligation on the combined work: fine
for a backend service (GPL doesn't restrict network/SaaS use under GPLv2),
fine for this package's own tests/tooling, but a real issue if this package
is bundled directly into a closed-source mobile app binary — React Native
bundles JS into the shipped app, which counts as distribution. See
`docs/PLANNING.md` → "Open Questions & Risks" for the recommended mitigation
(run this engine server-side behind an API for now; revisit a clean-room
permissively-licensed reimplementation of just the needed primitives if the
app later needs fully offline, client-side kvius computation).

The engine deliberately knows nothing about media files, titles, or rights —
`hasRecording` is the only touchpoint with the content catalog, so the catalog
schema can evolve independently (see `docs/PLANNING.md` at the repo root for
the proposed catalog data model).

## Scripts

```
npm run build      # tsc -> dist/
npm test           # vitest run
npm run typecheck
npm run example    # runs examples/basicUsage.ts against today's real Hebrew date
```
