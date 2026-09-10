# Sichos Kodesh

An offline-first app for the Rebbe's recorded Sichos Kodesh and Farbrengens,
with kvius-matched auto-download: follow along with a chosen historical
Hebrew year, and the app keeps your device stocked with that year's
recording for the matching week/date of the current Hebrew year.

- **[docs/PLANNING.md](docs/PLANNING.md)** — architecture, content & rights
  strategy, data model, phased roadmap, open questions.
- **[packages/kvius-engine](packages/kvius-engine)** — the kvius-matching
  and gap-resolution engine. Built, tested, and runnable:

  ```
  cd packages/kvius-engine
  npm install
  npm test
  npm run example   # prints a real schedule for today's Hebrew date
  ```
