import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanResponseHeaders,
  DRIVE_ID_PATTERN,
  DRIVE_RESOURCE_KEY_PATTERN,
  driveDownloadUrl,
  extractConfirmToken,
  fetchFromDrive,
  fetchFromJemAudioCdn,
  JEM_AUDIO_FILENAME_PATTERN,
  withCors,
} from '../src/index.js';

describe('driveDownloadUrl', () => {
  it('builds the plain download URL without a confirm token', () => {
    expect(driveDownloadUrl('abc123')).toBe('https://drive.google.com/uc?export=download&id=abc123');
  });

  it('includes the confirm token when provided', () => {
    expect(driveDownloadUrl('abc123', 'tok')).toBe('https://drive.google.com/uc?export=download&id=abc123&confirm=tok');
  });

  it('includes the resource key when provided - required for links shared before Google\'s 2021 resource-key change', () => {
    expect(driveDownloadUrl('abc123', undefined, '0-gm0KFPq6Fi6FXwvfD45KzA')).toBe(
      'https://drive.google.com/uc?export=download&id=abc123&resourcekey=0-gm0KFPq6Fi6FXwvfD45KzA',
    );
  });

  it('includes both confirm token and resource key together', () => {
    expect(driveDownloadUrl('abc123', 'tok', 'rk1')).toBe(
      'https://drive.google.com/uc?export=download&id=abc123&confirm=tok&resourcekey=rk1',
    );
  });
});

describe('DRIVE_RESOURCE_KEY_PATTERN', () => {
  it('accepts a realistic resource key', () => {
    expect(DRIVE_RESOURCE_KEY_PATTERN.test('0-gm0KFPq6Fi6FXwvfD45KzA')).toBe(true);
  });

  it('rejects path traversal or unrelated input', () => {
    for (const bad of ['../etc/passwd', 'http://evil.com', 'a b', '']) {
      expect(DRIVE_RESOURCE_KEY_PATTERN.test(bad)).toBe(false);
    }
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

  it('falls back to .m4a then .opus when the stored extension 404s - real "AR"-prefixed recordings are mislabeled .mp3 in mafteiach-index but only exist as .m4a/.opus on CloudFront', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('real audio bytes', { status: 200 }));
    const result = await fetchFromJemAudioCdn('AR0017467.mp3');
    expect(await result.text()).toBe('real audio bytes');
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, 'https://dtgj2yu3gmlic.cloudfront.net/AR0017467.mp3', undefined);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, 'https://dtgj2yu3gmlic.cloudfront.net/AR0017467.m4a', undefined);
  });

  it('tries .opus only after both the original extension and .m4a fail', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('real audio bytes', { status: 200 }));
    const result = await fetchFromJemAudioCdn('AR0017467.mp3');
    expect(await result.text()).toBe('real audio bytes');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, 'https://dtgj2yu3gmlic.cloudfront.net/AR0017467.opus', undefined);
  });

  it('preserves a Range header across the fallback attempts', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('partial bytes', { status: 206 }));
    await fetchFromJemAudioCdn('AR0017467.mp3', 'bytes=0-1023');
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, 'https://dtgj2yu3gmlic.cloudfront.net/AR0017467.m4a', {
      headers: { Range: 'bytes=0-1023' },
    });
  });

  it('returns the original failure when no extension works, rather than an alternate error', async () => {
    const originalFailure = new Response('not found', { status: 404 });
    globalThis.fetch = vi.fn().mockResolvedValue(originalFailure);
    const result = await fetchFromJemAudioCdn('AR0017467.mp3');
    expect(result).toBe(originalFailure);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // mp3 (original) + m4a + opus
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

  it('forwards the resource key on both the initial request and the confirm-token retry - real files shared before Google\'s 2021 resource-key change 404 without it', async () => {
    const interstitial = new Response('<a href="/uc?confirm=tok123&id=abc123">confirm</a>', {
      headers: { 'content-type': 'text/html' },
    });
    const realFile = new Response('actual bytes', { headers: { 'content-type': 'application/pdf' } });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(interstitial).mockResolvedValueOnce(realFile);

    await fetchFromDrive('abc123', 'rk1');
    const firstCallUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    const secondCallUrl = vi.mocked(globalThis.fetch).mock.calls[1]![0] as string;
    expect(firstCallUrl).toContain('resourcekey=rk1');
    expect(secondCallUrl).toContain('resourcekey=rk1');
  });

  it('returns a 502 rather than mis-serving HTML as a file when no confirm token is found', async () => {
    const unexpectedHtml = new Response('<html>Drive changed something</html>', {
      headers: { 'content-type': 'text/html' },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(unexpectedHtml);

    const result = await fetchFromDrive('abc123');
    expect(result.status).toBe(502);
  });

  it('forwards a Range header on the initial request, so a small/direct file can be served as a real partial response - Drive\'s own file-serving endpoint genuinely honors Range', async () => {
    const partial = new Response('partial bytes', { status: 206 });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(partial);

    await fetchFromDrive('abc123', undefined, 'bytes=0-1023');
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.any(String), { redirect: 'follow', headers: { Range: 'bytes=0-1023' } });
  });

  it('forwards a Range header on the confirm-token retry too, not just the initial interstitial-detection request', async () => {
    const interstitial = new Response('<a href="/uc?confirm=tok123&id=abc123">confirm</a>', {
      headers: { 'content-type': 'text/html' },
    });
    const partial = new Response('partial bytes', { status: 206 });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(interstitial).mockResolvedValueOnce(partial);

    await fetchFromDrive('abc123', undefined, 'bytes=0-1023');
    const secondCallHeaders = vi.mocked(globalThis.fetch).mock.calls[1]![1]?.headers as Headers;
    expect(secondCallHeaders.get('Range')).toBe('bytes=0-1023');
  });
});

describe('cleanResponseHeaders', () => {
  it('uses an explicit contentType override instead of trusting upstream - Drive returns application/octet-stream for every file regardless of its real type', () => {
    const upstream = new Response('bytes', { headers: { 'content-type': 'application/octet-stream' } });
    const headers = cleanResponseHeaders(upstream, null, 'application/pdf');
    expect(headers.get('Content-Type')).toBe('application/pdf');
  });

  it('falls back to upstream content-type, then application/octet-stream, when no override is given', () => {
    const withType = cleanResponseHeaders(new Response('bytes', { headers: { 'content-type': 'audio/mpeg' } }), null);
    expect(withType.get('Content-Type')).toBe('audio/mpeg');

    // A string body makes the Response constructor infer its own
    // text/plain content-type, so use a null body to simulate upstream
    // genuinely sending no Content-Type header at all.
    const withoutType = cleanResponseHeaders(new Response(null), null);
    expect(withoutType.get('Content-Type')).toBe('application/octet-stream');
  });

  it('sets Content-Disposition: inline (not attachment) with a filename, so a browser renders the PDF instead of force-downloading it', () => {
    const headers = cleanResponseHeaders(new Response('bytes'), 'example.pdf', 'application/pdf');
    const disposition = headers.get('Content-Disposition');
    expect(disposition).toContain('inline');
    expect(disposition).not.toContain('attachment');
    expect(disposition).toContain('example.pdf');
  });

  it('omits Content-Disposition entirely when no filename is given (the audio route)', () => {
    const headers = cleanResponseHeaders(new Response('bytes'), null);
    expect(headers.has('Content-Disposition')).toBe(false);
  });

  it('omits Accept-Ranges by default, regardless of what upstream itself sent - a route must not claim range support unless it actually forwards the client Range header', () => {
    const upstream = new Response('bytes', { headers: { 'accept-ranges': 'bytes' } });
    const headers = cleanResponseHeaders(upstream, null, 'application/pdf');
    expect(headers.has('Accept-Ranges')).toBe(false);
  });

  it('sets Accept-Ranges when the caller opts in with supportsRange - both /jem-audio/:filename and /drive/:fileId genuinely forward Range now', () => {
    const headers = cleanResponseHeaders(new Response('bytes'), null, undefined, true);
    expect(headers.get('Accept-Ranges')).toBe('bytes');
  });
});

describe('withCors', () => {
  it('adds Access-Control-Allow-Origin and a permissive method/header set', () => {
    const wrapped = withCors(new Response('bytes', { status: 200 }));
    expect(wrapped.headers.get('access-control-allow-origin')).toBe('*');
    expect(wrapped.headers.get('access-control-allow-methods')).toContain('GET');
    expect(wrapped.headers.get('access-control-allow-headers')).toContain('Range');
  });

  it('exposes Content-Range/Accept-Ranges/Content-Length so a service worker can slice a cached response for seeking', () => {
    const wrapped = withCors(new Response('bytes'));
    const exposed = wrapped.headers.get('access-control-expose-headers') ?? '';
    expect(exposed).toContain('Content-Range');
    expect(exposed).toContain('Accept-Ranges');
    expect(exposed).toContain('Content-Length');
  });

  it('preserves the original status and existing headers rather than discarding them', () => {
    const original = new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    const wrapped = withCors(original);
    expect(wrapped.status).toBe(404);
    expect(wrapped.headers.get('content-type')).toBe('text/plain');
  });
});
