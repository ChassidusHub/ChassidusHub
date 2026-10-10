import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AI_ON, Sidebar } from '../app/ui/Sidebar.js';
import { THEME_SCRIPT } from '../app/ui/theme.js';

/**
 * The new look's frame (studio/design-target): the sidebar holds My study,
 * the Library and Search, the rest of the site's sections under a line,
 * and settings, feedback and the language at its foot. Chats with a model
 * stay off until Shmuly says yes to sending text to an outside service.
 */

const draw = (lang: 'en' | 'he', section: string, path = '/') =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Sidebar, { lang, section })));

describe('the sidebar', () => {
  it('has the new look’s places and the site’s sections', () => {
    const html = draw('en', '/sets', '/sets');
    for (const words of ['My study', 'Library', 'Search', 'Daily learning', 'Listen', 'Contribute', 'Suggestions', 'Reports', 'Projects', 'Settings', 'Feedback'])
      expect(html).toContain(`>${words}<`);
    expect(html).toContain('href="/issues/new"');
    expect(html).toMatch(/aria-current="page" href="\/sets"/);
  });

  it('leaves the chats out while AI is off', () => {
    expect(AI_ON).toBe(false);
    expect(draw('en', '/')).not.toContain('My chats');
  });

  it('offers the other language, keeping the page', () => {
    expect(draw('en', '/sets', '/sets')).toContain('href="/sets?lang=he"');
    expect(draw('he', '/sets', '/sets?lang=he')).toContain('href="/sets"');
  });

  it('is a drawer the page can open by its address, without script', () => {
    expect(draw('en', '/')).toContain('id="nav"');
  });
});

describe('the sidebar folded', () => {
  it('is set before the page is drawn, as the theme is', () => {
    expect(THEME_SCRIPT).toContain("d.setAttribute('data-side','folded')");
  });
});
