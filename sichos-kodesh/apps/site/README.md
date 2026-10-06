# @sichos-kodesh/site

`https://app.chassidushub.org` - one Cloudflare Worker, static files only:

| Path | What |
| --- | --- |
| `/` and every app route | the web app (`apps/web`), a PWA that routes in the browser |
| `/get/` | the download site (`apps/download`, built with base `/get/`): the phone app's APK and the packs |

`npm run build -w @sichos-kodesh/site` builds both and puts them together
in `dist/` (`scripts/assemble.mjs`); `npm run deploy -w @sichos-kodesh/site`
deploys to the chassidushub.org account (`wrangler.toml`, with the custom
domain). A path that is not a file gets the web app's `index.html`, and
the web app's service worker leaves `/get` alone
(`navigateFallbackDenylist` in `apps/web/vite.config.ts`), so the download
site is always reached from the network.

`dist/` is build output and git-ignored.
