# ChassidusHub reader app

ChassidusHub's app for readers and listeners, for Android and the web
(formerly Sichos Kodesh; see docs/plans/reader-app.md at the repository
root). An offline-first app for the Rebbe's recorded sichos and farbrengens,
with kvius-matched auto-download: follow along with a chosen historical
Hebrew year, and the app keeps your device stocked with that year's
recordings and hanachos for the matching week/date of the current Hebrew
year.

On Android as `org.chassidushub.app`, downloaded from app.chassidushub.org/get
(no Play Store); on the web at app.chassidushub.org.

## Repository layout

| Path | Package | What it is |
| --- | --- | --- |
| `apps/web` | `@chassidushub-reader/web` | The web app: an installable PWA (React + Vite), served with the download site by the `apps/site` Worker at app.chassidushub.org. |
| `apps/mobile` | `@chassidushub-reader/mobile` | The Android app (bare React Native), `org.chassidushub.app`. |
| `packages/catalog` | `@chassidushub-reader/catalog` | Builds the app's bundled per-year catalog data and exposes the shared lookup/scheduling helpers both apps use. |
| `packages/kvius-engine` | `@chassidushub-reader/kvius-engine` | The kvius (recurring-year) matching and gap-resolution engine. |
| `packages/jem-index` | `@chassidushub-reader/jem-index` | Indexes JEM's own audio catalog. |
| `packages/mafteiach-index` | `@chassidushub-reader/mafteiach-index` | Crawls [mafteiach.app](https://www.mafteiach.app/) for per-occasion PDF/mugah/bilti-mugah ground truth. |
| `services/media-proxy` | `@chassidushub-reader/media-proxy` | A Cloudflare Worker that proxies Google Drive PDFs and JEM audio so the apps never talk to either origin directly. |

Each package/app has its own README with setup, development, and
deployment details.

## Getting started

```
npm install
```

installs every workspace from the repo root. From there, see the README in
the package you're working on - `apps/web`'s is the most relevant starting
point for day-to-day feature work.
