import { describe, expect, it } from 'vitest';
import { capped, focusText, itemName, percent } from '../app/community/data.js';
import { MODEL_FAMILIES } from '../app/community/models.js';
import { drawDoc, linkFor } from '../app/developers/docs.server.js';
import { renderMarkdown } from '../app/developers/markdown.server.js';
import { DOC_PAGES, docsPath, neighbours } from '../app/developers/pages.js';
import { curlExample, groupHtml, groupSlug, groupsOf, indexHtml, operationsOf, routeLines, type OpenApiDocument } from '../app/developers/reference.server.js';
import { llmsFullTxt, llmsTxt } from '../app/developers/llms.server.js';

describe('the developer docs', () => {
  it('draws every page from its file in the repository', () => {
    for (const page of DOC_PAGES.filter((p) => p.file)) {
      const doc = drawDoc(page.slug);
      expect(doc, page.file!).not.toBeNull();
      expect(doc!.html.length).toBeGreaterThan(100);
      expect(doc!.html).not.toMatch(/^<h1/);
    }
    expect(drawDoc('reference')).toBeNull();
    expect(drawDoc('nothing')).toBeNull();
  });

  it('escapes everything, so a file holds only what the rules make', () => {
    const { html } = renderMarkdown('A <script>alert(1)</script> and [a link](javascript:alert(1)) and `<b>`');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="#"');
    expect(html).toContain('<code>&lt;b&gt;</code>');
  });

  it('reads headings, lists, tables and code as GitHub does', () => {
    const { html, headings, title } = renderMarkdown('# The title\n\n## A section\n\n- one\n  - nested\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```sh\ncurl x\n```\n\n## A section');
    expect(title).toBe('The title');
    expect(headings.map((h) => h.id)).toEqual(['the-title', 'a-section', 'a-section-1']);
    expect(html).toContain('<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<pre><code data-lang="sh">curl x</code></pre>');
  });

  it('opens a doc that is a page of the site there, and any other file on GitHub', () => {
    expect(linkFor('docs/developers/index.md', 'auth.md#scopes')).toBe('/developers/auth#scopes');
    expect(linkFor('docs/developers/index.md', '../mirrors.md')).toBe('/developers/dumps');
    expect(linkFor('docs/developers/index.md', '../plans/chassidushub.md')).toBe('https://github.com/ChassidusHub/ChassidusHub/blob/main/docs/plans/chassidushub.md');
    expect(linkFor('docs/api.md', 'https://example.org')).toBe('https://example.org');
  });

  it('puts every page in the path bar, and its group after it', () => {
    const [docs, page] = docsPath('auth');
    expect(docs!.items).toHaveLength(DOC_PAGES.length);
    expect(page!.label).toBe('מפתחות וכניסה');
    expect(docsPath('')).toHaveLength(1);
    expect(neighbours('').previous).toBeUndefined();
    expect(neighbours('getting-started').next?.slug).toBe('auth');
  });
});

const doc: OpenApiDocument = {
  info: { title: 'ChassidusHub API', version: '1' },
  servers: [{ url: 'https://api.chassidushub.org' }],
  tags: [{ name: 'Search', description: 'Finding things' }, { name: 'Sign-in' }],
  paths: {
    '/v1/search': { get: { operationId: 'search', tags: ['Search'], summary: 'Search the catalog', 'x-access': 'public', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }] } },
    '/v1/fix': { post: { operationId: 'fix', tags: ['Search'], summary: 'Fix <words>', 'x-access': 'write', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['item'], properties: { item: { type: 'string', pattern: '^rh-' } } } } } } } },
    '/v1/auth/me': { get: { operationId: 'me', tags: ['Sign-in'], summary: 'Who is signed in', 'x-access': 'site' } },
  },
};

describe('the API reference', () => {
  it('groups the routes as the document does', () => {
    expect(operationsOf(doc).map((op) => op.id)).toEqual(['search', 'fix', 'me']);
    expect(groupsOf(doc).map((g) => [g.slug, g.count])).toEqual([
      ['search', 2],
      ['sign-in', 1],
    ]);
    expect(groupSlug('Sign-in')).toBe('sign-in');
  });

  it('draws the index and a group, escaped, with examples', () => {
    expect(indexHtml(doc)).toContain('href="/developers/reference/search#fix"');
    const group = groupHtml(doc, 'search')!;
    expect(group.html).toContain('Fix &lt;words&gt;');
    expect(group.html).toContain('Authorization: Bearer $CHASSIDUSHUB_TOKEN');
    expect(group.html).toContain("const answer = await rh.fix(");
    expect(group.html).toContain('href="https://api.chassidushub.org/v1/search?q=');
    expect(groupHtml(doc, 'nothing')).toBeNull();
    expect(curlExample(operationsOf(doc)[1]!, 'https://api.chassidushub.org', doc)).toContain(`-d '{"item":"rh-7k2m9q4d"}'`);
  });

  it('lists every route but the site’s own for agents', () => {
    expect(routeLines(doc)).toEqual(['- `GET /v1/search` search: Search the catalog. No account needed. Parameters: q (query).', '- `POST /v1/fix` fix: Fix <words>. A token with the write scope, or the site session. Takes a JSON body.']);
  });
});

describe('llms.txt', () => {
  it('lists every page of the developer docs, and llms-full.txt holds each one’s words', () => {
    const short = llmsTxt('https://chassidushub.org');
    for (const page of DOC_PAGES) expect(short).toContain(`(https://chassidushub.org/developers${page.slug ? `/${page.slug}` : ''})`);
    const full = llmsFullTxt('https://chassidushub.org', doc);
    expect(full).toContain('<!-- https://chassidushub.org/developers/auth (docs/developers/auth.md) -->');
    expect(full).toContain('- `GET /v1/search` search: Search the catalog');
    expect(full.length).toBeGreaterThan(50_000);
  });
});

describe('the catalog pages’ words', () => {
  it('says a project’s gap, a share and a capped count in Hebrew', () => {
    expect(focusText({ focus: { missing: 'recordings', within: '5745' } })).toBe('התוועדויות תשמ״ה בלי הקלטה');
    expect(focusText({ focus: { missing: 'proofreading', level: 2 } })).toBe('הגהת סריקה, הגהה שניה');
    expect(percent(1, 3)).toBe('33%');
    expect(percent(1, 0)).toBe('–');
    expect(capped(2000)).toBe('2,000+');
    expect(itemName({ id: 'rh-1', data: { date: '5742-05-10' } })).toContain('שבט');
  });

  it('keeps the models’ scores without any link to the models themselves', () => {
    const text = JSON.stringify(MODEL_FAMILIES);
    expect(text).not.toMatch(/https?:|huggingface|\.pt\b|weights/i);
    expect(MODEL_FAMILIES.flatMap((f) => f.models).filter((m) => m.state === 'inUse').length).toBeGreaterThan(0);
  });
});
