import { describe, expect, it } from 'vitest';
import { jsTwinUrl, sectionHtml, slugFromHref } from '../../src/sections/document.js';
import { SECTIONS_SCHEMA_SQL } from '../../src/sections/schema.js';

describe('sectionHtml', () => {
  const markup = '<div class="a">שבט \'תשי"א\' </div>';

  it('reads a `let html = "..."` JSON-string response (farbrengens, maamorim, /all)', () => {
    const escaped = markup.replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/<\//g, '<\\/');
    const raw = `let html = "${escaped}"\n    window.setOuterHTMLWithScripts(document.getElementsByTagName('main')[0], html)`;
    expect(sectionHtml(raw)).toBe(markup);
  });

  it('reads a template-literal response (Likkutei Sichos, hadranim, michtavim), including escaped backticks', () => {
    const inner = `${markup}\n<span>\`x\`</span>`;
    const escaped = inner.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/<\//g, '<\\/').replace(/\n/g, '\\n');
    const raw = `setOuterHTMLWithScripts(\n  document.getElementsByTagName('main')[0],\n  \`${escaped}\`\n);\nmakeCollapsible();`;
    expect(sectionHtml(raw)).toBe(inner);
  });

  it('passes plain HTML (yomanim) through', () => {
    expect(sectionHtml(markup)).toBe(markup);
  });
});

describe('urls and slugs', () => {
  it('builds the .js twin, keeping the query and optionally dropping the side-nav', () => {
    expect(jsTwinUrl('/likkutei_sichos/by_volume/1')).toBe('https://www.mafteiach.app/likkutei_sichos/by_volume/1.js');
    expect(jsTwinUrl('/maamorim?order=by_year&year=5711')).toBe('https://www.mafteiach.app/maamorim.js?order=by_year&year=5711');
    expect(jsTwinUrl('/all/moadim/22_shevat%20', { rightNav: false })).toBe('https://www.mafteiach.app/all/moadim/22_shevat%20.js?include_right_nav=false');
  });

  it('keeps a slug exactly as the site links it', () => {
    expect(slugFromHref('/all/moadim/11_nissan%20')).toBe('11_nissan%20');
    expect(slugFromHref('/hadranim/by_masechta/bava-kamma?x=1#y')).toBe('bava-kamma');
  });
});

describe('the sections schema', () => {
  it('has no text column: mafteiach\'s editorial writing is never stored, only whether it exists', () => {
    expect(SECTIONS_SCHEMA_SQL).not.toMatch(/\w+_text\s/);
    expect(SECTIONS_SCHEMA_SQL).not.toMatch(/\b(teaser|kitzur_text|tochen_text|summary)\b/);
  });
});
