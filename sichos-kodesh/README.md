# Sichos Kodesh

An offline-first app for the Rebbe's recorded Sichos Kodesh and Farbrengens,
with kvius-matched auto-download: follow along with a chosen historical
Hebrew year, and the app keeps your device stocked with that year's
recordings and hanachos for the matching week/date of the current Hebrew
year.

Private, pre-launch. Not yet publicly distributed.

## Repository layout

| Path | Package | What it is |
| --- | --- | --- |
| `apps/web` | `@sichos-kodesh/web` | The product: an installable PWA (React + Vite), deployed to Vercel. |
| `apps/mobile` | `@sichos-kodesh/mobile` | An early bare React Native build of the same feature slice. Not under active development - `apps/web` is where new work lands. |
| `packages/catalog` | `@sichos-kodesh/catalog` | Builds the app's bundled per-year catalog data and exposes the shared lookup/scheduling helpers both apps use. |
| `packages/kvius-engine` | `@sichos-kodesh/kvius-engine` | The kvius (recurring-year) matching and gap-resolution engine. |
| `packages/jem-index` | `@sichos-kodesh/jem-index` | Indexes JEM's own audio catalog. |
| `packages/mafteiach-index` | `@sichos-kodesh/mafteiach-index` | Crawls [mafteiach.app](https://www.mafteiach.app/) for per-occasion PDF/mugah/bilti-mugah ground truth. |
| `services/media-proxy` | `@sichos-kodesh/media-proxy` | A Cloudflare Worker that proxies Google Drive PDFs and JEM audio so the apps never talk to either origin directly. |

Each package/app has its own README with setup, development, and
deployment details.

## Getting started

```
npm install
```

installs every workspace from the repo root. From there, see the README in
the package you're working on - `apps/web`'s is the most relevant starting
point for day-to-day feature work.
