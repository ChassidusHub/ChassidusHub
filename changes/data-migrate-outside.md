- A migration can run outside a transaction, a statement at a time, so an
  index on a big table is built with `CREATE INDEX CONCURRENTLY` while the
  site goes on writing to it. The search indexes of #214 come next, one per
  migration, built this way.
