import http from 'node:http';
import worker from './index.js';

const PORT = 3000;
const HOST = '0.0.0.0';

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || '/', `http://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, value);
      }
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    init.body = Buffer.concat(chunks);
  }

  try {
    const webReq = new Request(url, init);
    const webRes = await worker.fetch(webReq, {}, {
      waitUntil: (p: Promise<unknown>) => {
        p.catch((err) => console.error('Background task error:', err));
      },
      passThroughOnException: () => {},
    });

    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    if (webRes.body) {
      const reader = webRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.end(`Internal Server Error: ${message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Sichos Kodesh media proxy & scheduler running on http://${HOST}:${PORT}`);
});
