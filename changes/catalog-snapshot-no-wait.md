- `/v1/catalog/manifest.json` never builds the snapshot while someone waits:
  with none built yet it answers `503` with `Retry-After: 30` and builds it
  behind the answer (a first build on live ran past 30 s and answered 502).
