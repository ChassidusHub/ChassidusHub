- A sefer's page and a volume's on the new site are one read of the API,
  never two rounds: `/v1/view` brings a sefer's `outline` (its volumes) and
  `additions`, and answers a volume's path (/likkutei-sichos/12) as the
  sefer with `volume`, its units in order; a volume of a sefer that moved
  answers with `movedTo`. Every new-site page says in `Server-Timing` how
  long it took and how many API calls in how many rounds it waited on. The
  API and the old site run in Ashburn, next to the database, instead of
  where Smart Placement put them (Atlanta, Toronto): a few ms a statement
  instead of about 25.
