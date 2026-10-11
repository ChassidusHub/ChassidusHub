/**
 * The database plans its queries without compiling them (`jit = off`).
 *
 * Postgres compiles a query it costs as large to machine code before it
 * runs it (JIT). On the live database, one shared vCPU, that compiling
 * took six to eleven seconds every time a search for words found
 * anything: the same search for a word nobody wrote answered in a tenth of
 * a second, and the same three sichos found again and again never got
 * quicker, as they would if they were being read from disk. The queries
 * this site asks are each over in milliseconds once planned, so compiling
 * them is never worth it.
 *
 * Set on the database, so every new connection has it, and a rebuild of
 * the catalog (which replaces `public`) keeps it. A database this cannot
 * set (not its owner) says so and goes on as it was.
 */
export const up = `
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET jit = off', current_database());
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'jit stays as it is: this role may not change the database';
END $$;
`;
