- The catalog snapshot is built only by the API's every-minute run, never
  behind a request: built behind every write (a draft edit too), builds were
  cut off 30 s after the answer 527 times in a day, keeping the database busy.
  A merge reaches `/v1/catalog/manifest.json` within about a minute; with none
  built yet it answers `503` with `Retry-After: 60`.
