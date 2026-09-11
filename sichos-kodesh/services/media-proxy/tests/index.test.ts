import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, {
  cleanResponseHeaders,
  createSamplePdf,
  DRIVE_ID_PATTERN,
  driveDownloadUrl,
  extractConfirmToken,
  fetchFromDrive,
  fetchFromJemAudioCdn,
  handleDrive,
  JEM_AUDIO_FILENAME_PATTERN,
} from '../src/index.js';

describe('driveDownloadUrl', () => {
  it('builds the plain download URL without a confirm token', () => {
    expect(driveDownloadUrl('abc123')).toBe('https://drive.google.com/uc?export=download&id=abc123');
  });

  it('includes the confirm token when provided', () => {
    expect(driveDownloadUrl('abc123', 'tok')).toBe('https://drive.google.com/uc?export=download&id=abc123&confirm=tok');
  });
});

describe('DRIVE_ID_PATTERN', () => {
  it('accepts realistic Drive file ids', () => {
    expect(DRIVE_ID_PATTERN.test('1CPwdr0swmUsn6YZszwru438SbXQ9y5b8')).toBe(true);
  });

  it('rejects path traversal or unrelated input', () => {
    for (const bad of ['../etc/passwd', 'http://evil.com', 'a b', '', 'short']) {
      expect(DRIVE_ID_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe('extractConfirmToken', () => {
  it('extracts the token from a realistic virus-scan interstitial', () => {
    const html = `<a href="/uc?export=download&amp;confirm=t7Xz&amp;id=abc123">Download anyway</a>`;
    expect(extractConfirmToken(html)).toBe('t7Xz');
  });

  it('returns null when the page has no confirm token', () => {
    expect(extractConfirmToken('<html>not a Drive page</html>')).toBeNull();
  });
});

describe('JEM_AUDIO_FILENAME_PATTERN', () => {
  it('accepts realistic JEM CDN filenames across all three formats', () => {
    for (const name of ['JEMSK0001.mp3', 'AR0017467.m4a', 'AR0016451.opus']) {
      expect(JEM_AUDIO_FILENAME_PATTERN.test(name)).toBe(true);
    }
  });

  it('rejects path traversal, unrelated hosts, or unexpected extensions', () => {
    for (const bad of ['../etc/passwd', 'http://evil.com/x.mp3', 'file.exe', 'file', '']) {
      expect(JEM_AUDIO_FILENAME_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe('fetchFromJemAudioCdn', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches from the CloudFront distribution by filename, not an arbitrary host', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('audio bytes'));
    await fetchFromJemAudioCdn('JEMSK0001.mp3');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://dtgj2yu3gmlic.cloudfront.net/JEMSK0001.mp3', undefined);
  });

  it('forwards a Range header when the caller wants to seek within the track', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('partial bytes', { status: 206 }));
    await fetchFromJemAudioCdn('JEMSK0001.mp3', 'bytes=0-1023');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://dtgj2yu3gmlic.cloudfront.net/JEMSK0001.mp3', {
      headers: { Range: 'bytes=0-1023' },
    });
  });
});

describe('fetchFromDrive', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the first response directly for a small file (non-HTML response)', async () => {
    const fileResponse = new Response('%PDF-1.4 fake bytes', { headers: { 'content-type': 'application/pdf' } });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(fileResponse);

    const result = await fetchFromDrive('abc123');
    expect(result).toBe(fileResponse);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows the confirm-token interstitial for a large file and returns the second response', async () => {
    const interstitial = new Response('<a href="/uc?confirm=tok123&id=abc123">confirm</a>', {
      headers: { 'content-type': 'text/html' },
    });
    const realFile = new Response('actual bytes', { headers: { 'content-type': 'application/pdf' } });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(interstitial).mockResolvedValueOnce(realFile);

    const result = await fetchFromDrive('abc123');
    expect(result).toBe(realFile);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const secondCallUrl = vi.mocked(globalThis.fetch).mock.calls[1]![0] as string;
    expect(secondCallUrl).toContain('confirm=tok123');
  });

  it('returns a 502 rather than mis-serving HTML as a file when no confirm token is found', async () => {
    const unexpectedHtml = new Response('<html>Drive changed something</html>', {
      headers: { 'content-type': 'text/html' },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(unexpectedHtml);

    const result = await fetchFromDrive('abc123');
    expect(result.status).toBe(502);
  });
});

describe('createSamplePdf (View PDF generator)', () => {
  it('generates a valid, standards-compliant PDF document', () => {
    const pdf = createSamplePdf('Test Hanacha Sicha 5742');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/Type /Pages');
    expect(pdf).toContain('/Type /Page');
    expect(pdf).toContain('Test Hanacha Sicha 5742');
    expect(pdf).toContain('xref');
    expect(pdf).toContain('trailer');
  });
});

describe('cleanResponseHeaders for PDF viewing', () => {
  it('sets inline Content-Disposition for browser PDF rendering when isInline is true', () => {
    const upstream = new Response('fake pdf', { headers: { 'content-type': 'application/pdf', 'content-length': '8' } });
    const headers = cleanResponseHeaders(upstream, 'sicha.pdf', true);
    expect(headers.get('Content-Disposition')).toBe('inline; filename="sicha.pdf"');
    expect(headers.get('Content-Type')).toBe('application/pdf');
    expect(headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('sets attachment Content-Disposition when downloading a PDF', () => {
    const upstream = new Response('fake pdf', { headers: { 'content-type': 'application/pdf' } });
    const headers = cleanResponseHeaders(upstream, 'sicha.pdf', false);
    expect(headers.get('Content-Disposition')).toBe('attachment; filename="sicha.pdf"');
  });
});

describe('handleDrive (View PDF test handler)', () => {
  it('serves the test sample PDF with status 200, application/pdf, and inline disposition', async () => {
    const res = await handleDrive('test', 'test-hanacha.pdf', true);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline');
    const text = await res.text();
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('Sichos Kodesh');
  });

  it('serves attachment disposition for sample PDF when downloading', async () => {
    const res = await handleDrive('test', 'test-hanacha.pdf', false);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="test-hanacha.pdf"');
  });

  it('accepts sample identifiers like test-sample-pdf', async () => {
    const res = await handleDrive('test-sample-pdf', null, true);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('rejects invalid drive IDs', async () => {
    const res = await handleDrive('../evil/path', null, true);
    expect(res.status).toBe(400);
  });
});

describe('Worker fetch PDF endpoints (View PDF Test)', () => {
  const dummyCtx = { waitUntil: () => {} };

  it('GET /drive/test serves inline viewable PDF', async () => {
    const req = new Request('http://localhost/drive/test');
    const res = await worker.fetch(req, {}, dummyCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline');
    const body = await res.text();
    expect(body.startsWith('%PDF-1.4')).toBe(true);
  });

  it('GET /test-pdf serves the test PDF', async () => {
    const req = new Request('http://localhost/test-pdf');
    const res = await worker.fetch(req, {}, dummyCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline');
  });

  it('GET /drive/test?download=1 sets attachment header for file saving', async () => {
    const req = new Request('http://localhost/drive/test?download=1&filename=sicha-test.pdf');
    const res = await worker.fetch(req, {}, dummyCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
  });

  it('GET / renders the View PDF Test button and embedded PDF viewer card in the UI', async () => {
    const req = new Request('http://localhost/');
    const res = await worker.fetch(req, {}, dummyCtx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('View PDF Test');
    expect(html).toContain('pdf-viewer-card');
    expect(html).toContain('pdf-frame');
    expect(html).toContain('player-pdf-canvas');
    expect(html).toContain('player-pdf-viewport');
    expect(html).toContain('btn-pdf-prev');
    expect(html).toContain('btn-pdf-next');
    expect(html).toContain('Drive Hanacha PDF ID');
  });

  it('GET /manifest.webmanifest returns valid PWA manifest for standalone app installation', async () => {
    const req = new Request('http://localhost/manifest.webmanifest');
    const res = await worker.fetch(req, {}, dummyCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/manifest+json; charset=utf-8');
    const manifest = await res.json() as { display?: string; name?: string; icons?: Array<{ src: string }> };
    expect(manifest.name).toContain('Sichos Kodesh');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons?.length).toBeGreaterThanOrEqual(3);
  });

  it('GET /sw.js serves the service worker script with proper JS headers', async () => {
    const req = new Request('http://localhost/sw.js');
    const res = await worker.fetch(req, {}, dummyCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    const sw = await res.text();
    expect(sw).toContain('self.addEventListener');
    expect(sw).toContain('sichos-kodesh');
  });

  it('GET /icon-192.png and /icon.svg return valid icon assets', async () => {
    const resPng = await worker.fetch(new Request('http://localhost/icon-192.png'), {}, dummyCtx);
    expect(resPng.status).toBe(200);
    expect(resPng.headers.get('content-type')).toBe('image/png');
    const buf = await resPng.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(100);

    const resSvg = await worker.fetch(new Request('http://localhost/icon.svg'), {}, dummyCtx);
    expect(resSvg.status).toBe(200);
    expect(resSvg.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('GET /api/kvius/today strictly enforces matching years starting only at 5710', async () => {
    const req = new Request('http://localhost/api/kvius/today');
    const res = await worker.fetch(req, {}, dummyCtx);
    expect(res.status).toBe(200);
    const data = await res.json() as {
      minHistoricalYear?: number;
      matchingYears?: Array<{ hebrewYear: number }>;
    };
    expect(data.minHistoricalYear).toBe(5710);
    if (data.matchingYears && data.matchingYears.length > 0) {
      for (const m of data.matchingYears) {
        expect(m.hebrewYear).toBeGreaterThanOrEqual(5710);
        expect(m.hebrewYear).toBeLessThanOrEqual(5752);
      }
    }
  });

  it('GET /api/kvius/schedule strictly enforces 5710 boundary', async () => {
    const req = new Request('http://localhost/api/kvius/schedule?target=5786');
    const res = await worker.fetch(req, {}, dummyCtx);
    expect(res.status).toBe(200);
    const data = await res.json() as {
      sourceYear?: number;
      matchingYears?: Array<{ hebrewYear: number }>;
      schedule?: { sourceYear?: number; targetYear?: number };
    };
    expect(data.sourceYear).toBeGreaterThanOrEqual(5710);
    expect(data.schedule?.sourceYear).toBeGreaterThanOrEqual(5710);
    if (data.matchingYears) {
      for (const m of data.matchingYears) {
        expect(m.hebrewYear).toBeGreaterThanOrEqual(5710);
        expect(m.hebrewYear).toBeLessThanOrEqual(5752);
      }
    }
  });
});

