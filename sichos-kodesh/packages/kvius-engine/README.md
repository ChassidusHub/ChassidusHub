# @sichos-kodesh/kvius-engine

The kvius matching and scheduling engine for the Sichos Kodesh app. Given the
current Hebrew year and a historical year the user wants to "follow along
with," it computes which week's/date's recording from that historical year
(or a fallback year) corresponds to each week and fixed date of the current
year.

Every fact here is derived from calendar arithmetic via
[`@hebcal/core`](https://www.npmjs.com/package/@hebcal/core) rather than a
hand-transcribed table of the traditional "14 keviyot," so it's correct for
any year the library supports.

## Concepts

- **Kviah / kvius signature** (`kviusSignature`): the triple of (leap status,
  Rosh Hashana weekday, year-length class) that fully determines a Hebrew
  year's day-of-week-to-date mapping, and therefore its entire Torah-reading
  and holiday-vs-Shabbos structure. Two years with the same signature are
  "kvius-matched" (`sameKvius`).
- **Kvius code** (`kviusCode`): the traditional 3-letter Hebrew mnemonic
  (e.g. `גכה`), for display purposes — derived, not looked up.
- **Weekly occasions** (`buildWeeklySchedule`): one entry per Shabbat of a
  Hebrew year, with its parsha (or the holiday that displaced it), keyed by
  a stable `week:<n>` index anchored to the first Shabbat on/after Rosh
  Hashana. Kvius-matched years always produce structurally identical
  arrays — same length, same parsha/holiday sequence, different Gregorian
  dates.
- **Fixed-date occasions** (`buildFixedDateSchedule`): Hebrew-date-anchored
  content (Yud-Tes Kislev, Purim, etc.), defined via `FixedOccasionDef`.
  Adar-anchored occasions resolve to the correct Adar (I vs II in a leap
  year) via a resolver function on `month`.
- **Gap resolution** (`resolveOccasion` / `buildMatchedSchedule`): for a
  given occasion, checks a manual override, then the user's chosen source
  year, then — under the `'nearestKviusYear'` strategy — the nearest other
  kvius-matched year that actually has a recording. A fully unresolved
  occasion comes back as `{ status: 'gap', resolvedYear: null }` rather than
  being silently guessed at.
- **Matching years** (`findMatchingYears`): every year in a range whose
  kviah matches a target year's, sorted nearest first — the candidate list
  a user picks a source year from.
- **Partial week matches** (`weekMatchesInYear`, `findPartialWeekMatches`):
  a weaker relationship than a full kvius match — whether a specific run of
  (month, day) pairs (typically "this week") translates directly into
  another year and still lands on a real, consecutive Sunday-through-
  Shabbos week there, even though that year isn't kvius-matched overall.
- **Special anniversaries** (`SPECIAL_ANNIVERSARY_YEARS`,
  `specialAnniversaryNumber`): a curated set of round year-gaps (40, 50, 60,
  70, 75, 80, 90, 100) worth calling out, independent of kvius matching.
- **Historical bounds** (`MIN_HISTORICAL_YEAR` = 5710, `MAX_HISTORICAL_YEAR`
  = 5752): the span of `packages/mafteiach-index`'s crawled catalog that
  this app is scoped to — coverage before 5710 is sparse and predates the
  current Rebbe's own Sichos Kodesh. `findMatchingYears` and
  `findPartialWeekMatches` default to, and clamp any explicit range to,
  this span; pass `allowOutOfHistoricalRange: true` to search past it for
  calendar-math testing independent of catalog coverage.

## Usage

```ts
import { buildMatchedSchedule, findMatchingYears } from '@sichos-kodesh/kvius-engine';

const targetYear = 5786; // current Hebrew year
const candidates = findMatchingYears(targetYear); // defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR]
const sourceYear = candidates[0].hebrewYear; // user picks one of these

const schedule = buildMatchedSchedule(targetYear, sourceYear, {
  il: false, // Diaspora vs Israel Sedra schedule
  gapStrategy: 'nearestKviusYear',
  matchingYearsRange: { fromYear: 5710, toYear: 5752 },
  hasRecording: (year, occasionKey) => catalog.has(year, occasionKey), // app-supplied
  fixedOccasions: [
    { key: 'yud-tes-kislev', label: 'Yud-Tes Kislev', day: 19, month: 9 },
  ],
});
```

`buildMatchedSchedule` throws if `sourceYear` isn't actually kvius-matched to
`targetYear` — only ever offer users years returned by `findMatchingYears`.

The engine knows nothing about media files, titles, or rights — the
`hasRecording` callback is its only touchpoint with the content catalog, so
the catalog schema (see `packages/catalog`) can evolve independently.

## Licensing: `@hebcal/core` is GPL-2.0

`@hebcal/core` (and its `@hebcal/hdate` dependency) is licensed GPL-2.0, not
MIT/permissive. That's a copyleft obligation on the combined work — fine for
a backend service (GPL doesn't restrict network/SaaS use under GPLv2) and
for this package's own tests/tooling, but an open question for a
closed-source app binary: this engine is currently bundled directly into
both `apps/web`'s client-side JS and `apps/mobile`'s app binary, and React
Native/browser bundling counts as distribution under GPL-2.0. Resolving
this - running the engine server-side behind an API, or a clean-room
permissively-licensed reimplementation of just the needed primitives - is
unresolved.

## Scripts

```
npm run build      # tsc -> dist/
npm test           # vitest run
npm run test:watch
npm run typecheck
npm run example    # runs examples/basicUsage.ts against today's real Hebrew date
```
