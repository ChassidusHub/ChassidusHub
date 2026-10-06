import type { PackStore } from './store.js';

/** The slice of Cloudflare's R2Bucket the pack API uses, so this compiles without the Workers types. */
export interface R2BucketLike {
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
}

export function r2Store(bucket: R2BucketLike): PackStore {
  return {
    async get(key) {
      const object = await bucket.get(key);
      return object ? { body: object.body, size: object.size } : null;
    },
  };
}
