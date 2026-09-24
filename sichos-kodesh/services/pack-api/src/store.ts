/**
 * What the pack API reads from: R2 in production (r2.ts), a local
 * directory for `sk-pack serve` and the tests. Keys are the published
 * layout's (layout.ts).
 */

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size: number;
}

export interface PackStore {
  get(key: string): Promise<StoredObject | null>;
}

export async function readBytes(object: StoredObject): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = object.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export async function readJson(store: PackStore, key: string): Promise<unknown> {
  const object = await store.get(key);
  if (!object) return null;
  try {
    return JSON.parse(new TextDecoder().decode(await readBytes(object)));
  } catch {
    return null;
  }
}

/** A store over a plain map, for tests. */
export function memoryStore(files: Map<string, Uint8Array>): PackStore {
  return {
    async get(key) {
      const bytes = files.get(key);
      if (!bytes) return null;
      return {
        size: bytes.length,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            // Chunked, like a real body, so the streaming path is exercised.
            for (let i = 0; i < bytes.length; i += 4096) controller.enqueue(bytes.subarray(i, Math.min(i + 4096, bytes.length)));
            controller.close();
          },
        }),
      };
    },
  };
}
