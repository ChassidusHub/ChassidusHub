# @sichos-kodesh/download

The download site (`docs/offline-plan.md`, WP5). It is in Hebrew, RTL, and
uses the web app's colour tokens. It is a static Vite build over the pack
API (`services/pack-api`):

- **Ready-made packs** come from `/v1/packs/index.json`, one click each.
- **A pack of your choice** is picked by year and month (only months
  with farbrengens), content (the essentials, everything, or a custom
  set of recordings, hanachos by edition, mugah, maamorim, hagahos and
  hosofos), audio quality (the profiles the archive holds), and the
  largest file wanted. The exact size and the parts come from
  `/v1/size`, and each part downloads from `/v1/build`, signed and
  streamed.
- **Putting it on the phone** is explained on the page: copy the pack into
  `import/` of the app's shared folder, or use "Import files".

```
VITE_PACK_API=https://<pack-api> npm run build -w @sichos-kodesh/download
npm run dev -w @sichos-kodesh/download   # against sk-pack serve on :8787 by default
npm test -w @sichos-kodesh/download
```

To run it locally on a real archive:

1. `sk-pack publish`.
2. `sk-pack serve` (port 8787).
3. `npm run dev -w @sichos-kodesh/download`.

It deploys as a Vercel project rooted at `apps/download`, once the pack
API has a public address.
