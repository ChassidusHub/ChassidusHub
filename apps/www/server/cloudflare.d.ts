/**
 * The little of the Workers runtime's own module the site uses: a named
 * entrypoint class (worker.ts) and its cache's purge. Declared here rather
 * than taking all of @cloudflare/workers-types, whose globals would clash
 * with the DOM's.
 */
declare module 'cloudflare:workers' {
  /** What a purge answered (developers.cloudflare.com/workers/cache/purge). */
  export interface PurgeResult {
    success: boolean;
    errors?: Array<{ code: number; message: string }>;
  }
  export interface WorkerCache {
    purge(options: { tags?: string[]; pathPrefixes?: string[] } | { purgeEverything: true }): Promise<PurgeResult>;
  }
  export abstract class WorkerEntrypoint<Env = unknown> {
    protected ctx: { waitUntil(promise: Promise<unknown>): void; cache?: WorkerCache };
    protected env: Env;
    constructor(ctx: unknown, env: Env);
  }
}
