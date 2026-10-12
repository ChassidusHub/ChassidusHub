import type { ChassidusHub } from '@chassidushub/client';
import { localApi } from './localApi';
import { snapshotFrom, type Snapshot } from './snapshot';

declare module 'react-router' {
  interface AppLoadContext {
    /**
     * The API's catalog reads, answered on the server from the catalog
     * snapshot (app/catalog/localApi.ts), for the pages drawn from it there:
     * the Listen year page (#321). Anything it cannot answer throws NotLocal,
     * and the page reads `api` instead.
     */
    catalog?: ChassidusHub;
    /**
     * Notes the items a page drawn from the snapshot shows, for its edge tags
     * (server/edge.ts): the API's reads note theirs themselves.
     */
    shows?: (ids: Iterable<string>) => void;
  }
}

/** Where the server reads the snapshot's files (server/catalog.ts, `SnapshotFiles`). */
interface Files {
  manifest(): Promise<Response>;
  index?(): Promise<Response>;
  file(name: string): Promise<Response>;
}

/**
 * The snapshot's reads on the server for one request, its one read of the
 * API (which recordings can be followed) made with that request's `api`. The
 * snapshot is made once per isolate, so its files are read once and kept.
 */
export function serverCatalog(files: Files): (api: ChassidusHub) => ChassidusHub {
  const snapshot: Snapshot = snapshotFrom({ manifest: () => files.manifest(), ...(files.index ? { index: () => files.index!() } : {}), file: (name) => files.file(name) });
  return (api) => localApi(snapshot, api);
}
