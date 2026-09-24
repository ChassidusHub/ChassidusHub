# Catalog changelog

The version of the *data* the apps ship and fetch - separate from the apps'
own versions (`apps/web`, `apps/mobile` each have their own changelog) and
from this package's npm version. `src/changelog.ts` is the machine-readable
copy the apps and the release manifest carry; keep the two in step. Each
release is tagged `catalog-v<version>` - see README.md's "Catalog releases".

Since schema 2 (the phone app's library, served under `/v2/`), a release
is published in both schemas under one version: the farbrengens are the
same bytes in both, and schema 2 adds Likkutei Sichos, maamorim, yomanim,
hadranim, michtavim klolim, reshimos, JEM events, and mafteiach's moadim
and parshiyos.

## 1.2.0 - 2026-09-24

- The library's 101 moadim and 53 parshiyos now have their English names
  too (e.g. "Rosh Chodesh Kislev", "Tzivos Hashem rally - Purim"), for the
  phone's English interface.
- Data shape (schema 2 only): `OccasionGroup` gained an optional `nameEn`,
  filled by the catalog build (`src/translate/groupNameEn.ts`): the
  occasion-label rules, plus a table for the 30 headings they do not read.
  The farbrengens (schema 1) are byte-for-byte those of 1.1.0.

## 1.1.0 - 2026-09-24

- Every occasion now has its name in English too (e.g. "Rosh Hashanah,
  day 2", "Motzei 13 Tishrei") - 1,438 of the 1,454 distinct names
  (3,314 of the 3,330 occasions); the rest keep their Hebrew.
- Every recording's chapter name now has its Hebrew too (e.g. "שיחה א׳",
  "מאמר", "שני ניגונים") - 783 of the 785 distinct names.
- Data shape (still schema 1): `CatalogEntry` gained an optional
  `occasionLabelEn` and `CatalogAudio` an optional `chapterNameHe`, both
  filled by the catalog build (`src/translate/`). Apps from before this
  release ignore them; `occasionLabel` and `chapterName` are unchanged.

## 1.0.0 - 2026-09-23

- First catalog release: every farbrengen indexed by mafteiach.app from
  5710 to 5752, with its recordings (JEM) and PDF links.
- Catalog releases are now separate from app releases - the apps fetch a
  newer catalog on their own from api.sk.shmuky.dev, no app update needed.
- Data shape (schema 1): `CatalogAudio` gained an optional `kind`
  (`shiur` | `chazara`) for recordings that are not the Rebbe's own voice;
  absent everywhere in this release.
