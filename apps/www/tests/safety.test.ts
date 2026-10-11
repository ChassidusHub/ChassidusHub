import { describe, expect, it } from 'vitest';
import { pageSafety } from '../app/lib/safety.js';

describe('framing', () => {
  it('lets no other site frame a page', () => {
    for (const path of ['/oauth/consent', '/account', '/']) {
      expect(pageSafety(path)).toMatchObject({ 'Content-Security-Policy': "frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN' });
    }
  });

  it('lets other sites frame an embed only', () => {
    const embed = pageSafety('/embed/rh-aaaaaab1');
    expect(embed['Content-Security-Policy']).toBe('frame-ancestors *');
    expect(embed['X-Frame-Options']).toBeUndefined();
  });

  it('lets nobody frame a showcase, and sends its address nowhere', () => {
    expect(pageSafety('/show/abc')).toMatchObject({ 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  });
});
