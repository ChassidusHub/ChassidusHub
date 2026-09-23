# Catalog changelog

The version of the *data* the apps ship and fetch - separate from the apps'
own versions (`apps/web`, `apps/mobile` each have their own changelog) and
from this package's npm version. `src/changelog.ts` is the machine-readable
copy the apps and the release manifest carry; keep the two in step. Each
release is tagged `catalog-v<version>` - see README.md's "Catalog releases".

## 1.0.0 - 2026-09-23

- First catalog release: every farbrengen indexed by mafteiach.app from
  5710 to 5752, with its recordings (JEM) and PDF links.
- Catalog releases are now separate from app releases - the apps fetch a
  newer catalog on their own from api.sk.shmuky.dev, no app update needed.
- Data shape (schema 1): `CatalogAudio` gained an optional `kind`
  (`shiur` | `chazara`) for recordings that are not the Rebbe's own voice;
  absent everywhere in this release.
