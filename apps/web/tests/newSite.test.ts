import { describe, expect, it } from 'vitest';
import { toNewSite } from '../server/newSite.js';

const NEW_SITE = { fetch: async () => new Response('new') };
const asked = (url: string) => new Request(url);

describe('the switch-over', () => {
  it('hands the named addresses to the new site', () => {
    expect(toNewSite(asked('https://chassidushub.org/library'), { NEW_SITE, NEW_SITE_HOSTS: 'chassidushub.org' })).toBe(true);
    expect(toNewSite(asked('https://ChassidusHub.org/'), { NEW_SITE, NEW_SITE_HOSTS: ' www.chassidushub.org, chassidushub.org ' })).toBe(true);
  });

  it('keeps every other address, and everything when the setting is empty (the rollback)', () => {
    expect(toNewSite(asked('https://chassidushub-web.example.workers.dev/'), { NEW_SITE, NEW_SITE_HOSTS: 'chassidushub.org' })).toBe(false);
    expect(toNewSite(asked('https://chassidushub.org/'), { NEW_SITE, NEW_SITE_HOSTS: '' })).toBe(false);
    expect(toNewSite(asked('https://chassidushub.org/'), { NEW_SITE_HOSTS: 'chassidushub.org' })).toBe(false);
  });

  it('keeps the recordings this site plays through its media proxy', () => {
    expect(toNewSite(asked('https://chassidushub.org/_/media/jem-audio/a.mp3'), { NEW_SITE, NEW_SITE_HOSTS: 'chassidushub.org' })).toBe(false);
  });
});
