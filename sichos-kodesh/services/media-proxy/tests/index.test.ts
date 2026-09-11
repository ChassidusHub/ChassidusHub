import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRIVE_ID_PATTERN,
  driveDownloadUrl,
  extractConfirmToken,
  fetchFromDrive,
  fetchFromJemAudioCdn,
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
