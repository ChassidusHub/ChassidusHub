import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { PackKeyPair } from '@chassidushub-reader/pack-format';
import type { PackStore } from '@chassidushub-reader/pack-api';
import { createHandler } from '@chassidushub-reader/pack-api';

/**
 * `sk-pack serve`: the pack API's own handler over a published directory,
 * on a local port - for developing the download site against a real
 * archive, and for a station or a yeshiva's own server with no cloud.
 */

/** A PackStore over a `sk-pack publish` directory. Keys never leave it. */
export function directoryStore(root: string): PackStore {
  const base = path.resolve(root);
  return {
    async get(key) {
      const file = path.resolve(base, key);
      if (!file.startsWith(`${base}${path.sep}`)) return null;
      try {
        const info = await stat(file);
        if (!info.isFile()) return null;
        return { size: info.size, body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array> };
      } catch {
        return null;
      }
    },
  };
}

export function servePublished(root: string, options: { port: number; host?: string; signingKey: PackKeyPair | null; corsOrigin?: string }): Promise<Server> {
  const handler = createHandler(directoryStore(root), { signingKey: options.signingKey, corsOrigin: options.corsOrigin ?? '*' });
  const server = createServer((req, res) => {
    const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
    handler(new Request(url, { method: req.method ?? 'GET' }))
      .then(async (response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        if (!response.body) {
          res.end();
          return;
        }
        const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
        body.on('error', () => res.destroy());
        body.pipe(res);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });
  return new Promise((resolve) => server.listen(options.port, options.host ?? '127.0.0.1', () => resolve(server)));
}
