import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_ID_PATTERN, driveDownloadUrl, extractConfirmToken, fetchFromDrive } from '../src/index.js';

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
