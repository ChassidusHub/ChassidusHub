import { createContext, useContext } from 'react';

declare module 'react-router' {
  interface AppLoadContext {
    /** True for a whole page; false for the data of a click to another page. */
    document?: boolean;
    /** What the page draws on the server only, keyed by what draws it. */
    serverOnly?: Map<string, string>;
  }
}

/**
 * A request's part of the context: whether it is for a whole page, and a
 * fresh place for what that page draws on the server only (server/worker.ts,
 * server/node.ts), with the catalog snapshot's index when the server has it.
 * A click to another page asks for `<path>.data`.
 */
export const pageContext = (request: Request, catalogIndex?: string | null) => {
  const document = !new URL(request.url).pathname.endsWith('.data');
  const serverOnly = new Map<string, string>();
  if (document && catalogIndex) serverOnly.set(CATALOG_INDEX, catalogIndex);
  return { document, serverOnly };
};

/** Where a whole page carries the catalog snapshot's index (server/catalog.ts, `indexKeeper`; app/root.tsx). */
export const CATALOG_INDEX = 'catalog-index';

/**
 * What a page draws on the server but leaves out of its hydration data: a
 * loader puts it in the request's `serverOnly` for a whole page, and the
 * server's render reads it from here (entry.server.tsx). In the browser there
 * is nothing here, and the page keeps what the server drew.
 */
export const ServerOnly = createContext<Map<string, string> | undefined>(undefined);

export const useServerOnly = (key: string) => useContext(ServerOnly)?.get(key);
