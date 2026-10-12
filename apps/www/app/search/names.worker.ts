import { findNames, readNames, type FromNames, type ToNames } from './instant';

/**
 * The catalog's names, read and searched off the page (#272): the names file
 * is about 8 MB of JSON, and on a phone reading it where the page runs would
 * hold up every tap and key for a second or more. The page asks with a
 * query; this answers with the names found (search/instant.ts).
 */
const scope = self as unknown as { postMessage(message: FromNames): void; onmessage: ((event: MessageEvent<ToNames>) => void) | null };

const index = readNames();
index.then((names) => scope.postMessage({ ready: names?.version ?? null }));
scope.onmessage = async ({ data }) => {
  const names = await index;
  scope.postMessage({ found: data.find, hits: names ? findNames(names, data.query, data.limit) : [] });
};
