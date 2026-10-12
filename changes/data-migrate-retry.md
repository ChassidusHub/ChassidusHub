- A migration that gives up waiting for a lock (its short `lock_timeout`,
  while a long read holds the table) is tried again every 3 s, for up to
  two minutes, instead of failing the deploy. Migration 0038 failed this
  way behind the catalog snapshot's read, and every API deploy after it
  failed the same way.
