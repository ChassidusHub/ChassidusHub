import { describe, expect, it } from 'vitest';
import { siteOf } from '../app/lib/site.js';
import { robotsTxt } from '../app/routes/robots.js';

describe('where the site answers from', () => {
  it('indexes only chassidushub.org itself', () => {
    expect(siteOf(new Request('https://chassidushub.org/library')).indexed).toBe(true);
    expect(siteOf(new Request('https://new.chassidushub.org/library')).indexed).toBe(false);
    expect(siteOf(new Request('http://localhost:3001/')).indexed).toBe(false);
  });

  it('opens the site to crawlers there, all but the private parts, with its sitemap', () => {
    const robots = robotsTxt('https://chassidushub.org', true);
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Disallow: /account');
    expect(robots).toContain('Sitemap: https://chassidushub.org/sitemap.xml');
    expect(robotsTxt('https://new.chassidushub.org', false)).toContain('Disallow: /\n');
  });
});
