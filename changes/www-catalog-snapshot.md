- The catalog snapshot (#228, docs/catalog-snapshot.md): `GET /v1/catalog/manifest.json`
  names a few files that hold the whole tree (every shelf and sefer, each
  sefer's units by volume, each year's events, and every name for search
  as you type), each at `/v1/catalog/files/<file>`, named by its sha256
  and kept for good. Built from main behind the answers after a change and
  every minute, so a page can draw the catalog from memory with no read of
  the database.
