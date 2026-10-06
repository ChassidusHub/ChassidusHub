# @sichos-kodesh/download

The download site (`docs/offline-plan.md`, WP5). It is in Hebrew, RTL, and
uses the web app's colour tokens. It is a static Vite build over the pack
API (`services/pack-api`):

- **A store with a cart.** The shelves are the farbrengens (years and
  months: several years at once, the same months of each), the library
  (a collection, one of its browse axes, any of its groups) and the
  seforim (bundles). Anything goes into one cart, and the cart becomes
  one pack: one query to `/v1/size` and `/v1/build`, each shared file
  once, split into parts by the largest file wanted. One set of
  settings serves the cart: the farbrengens' content (the essentials,
  everything, or a custom set), the audio quality, the part size. The
  cart is kept in the browser (`cart.ts`).
- **This year's kvius** (`kvius.ts`, kvius-engine's `findMatchingYears`):
  the years whose calendar is this year's are marked on the year chips,
  this month and the next on the month chips, and a card adds this
  month, next month or the whole years of the kvius in one tap.
- **Ready-made packs** come from `/v1/packs/index.json`, one click each.
- **The phone app** downloads from the app server
  (`api.sk.chassidushub.org/v1/app/android/`), its newest release whatever it
  is - never from GitHub.
- **Putting it on the phone** is explained on the page: copy the pack into
  `import/` of the app's shared folder, or use "Import files".

```
npm run build -w @sichos-kodesh/download   # against the published Worker, https://pack-api.sk.chassidushub.org
VITE_PACK_API=https://<pack-api> npm run build -w @sichos-kodesh/download   # against another pack API
npm run dev -w @sichos-kodesh/download   # against sk-pack serve on :8787 by default
npm test -w @sichos-kodesh/download
```

To run it locally on a real archive:

1. `sk-pack publish`.
2. `sk-pack serve` (port 8787).
3. `npm run dev -w @sichos-kodesh/download`.

It deploys as a Vercel project rooted at `apps/download`, once the pack
API has a public address.
