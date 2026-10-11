
/**
 * The developer docs (/developers): the repository's own docs/*.md, one page
 * each, beside the API reference made from the OpenAPI document. The words
 * are the files' own, in English; only the frame around them (this list's
 * `label`, the path bar, the page's few words) is Hebrew, as the rest of
 * the site. A page here is a file there; the rest of docs/ opens on GitHub.
 */

export const REPOSITORY = 'https://github.com/ChassidusHub/ChassidusHub';
export const API = 'https://api.chassidushub.org';

export interface DocPage {
  slug: string;
  /** The file, from the repository's root; none for the reference, which is made from the API. */
  file: string | null;
  /** The page's own (English) title. */
  title: string;
  /** Its name in the site's frame. */
  label: string;
  /** One line, for the list of pages and llms.txt. */
  summary: string;
  group: string;
}

/** The pages in reading order, in their groups. */
export const DOC_PAGES: readonly DocPage[] = [
  { slug: '', file: 'docs/developers/index.md', title: 'Overview', label: 'סקירה', summary: 'What the API, the dumps and the agent tools offer, and the promises they keep', group: 'התחלה' },
  { slug: 'getting-started', file: 'docs/developers/getting-started.md', title: 'Getting started', label: 'איך מתחילים', summary: 'Your first requests, in curl and TypeScript', group: 'התחלה' },
  { slug: 'auth', file: 'docs/developers/auth.md', title: 'Tokens and signing in', label: 'מפתחות וכניסה', summary: 'Personal API tokens, their scopes, and what a token may never do', group: 'התחלה' },
  { slug: 'api', file: 'docs/developers/api.md', title: 'Conventions', label: 'מוסכמות', summary: 'Stability, errors, pages and cursors, caching, CORS', group: 'התחלה' },
  { slug: 'endpoints', file: 'docs/api.md', title: 'The endpoints', label: 'הנתיבים', summary: 'A guide to the routes, by what they are for', group: 'שימוש ב-API' },
  { slug: 'reference', file: null, title: 'API reference', label: 'מדריך ה-API', summary: 'Every route, with examples in curl and TypeScript', group: 'שימוש ב-API' },
  { slug: 'suggestions', file: 'docs/developers/suggestions.md', title: 'Sending suggestions', label: 'שליחת הצעות', summary: 'How a change is made through the API, checked and reviewed', group: 'שימוש ב-API' },
  { slug: 'rate-limits', file: 'docs/developers/rate-limits.md', title: 'Rate limits', label: 'מגבלות קצב', summary: 'How much, per address and per token, and being a good citizen', group: 'שימוש ב-API' },
  { slug: 'webhooks', file: 'docs/developers/webhooks.md', title: 'Webhooks', label: 'Webhooks', summary: 'Every approved change posted to you, signed', group: 'שימוש ב-API' },
  { slug: 'data-model', file: 'docs/data-model.md', title: 'The data model', label: 'מבנה הנתונים', summary: 'Every kind of item, ids and paths, Hebrew dates, order', group: 'הקטלוג' },
  { slug: 'rights', file: 'docs/rights.md', title: 'Rights', label: 'זכויות', summary: 'What may be served and copied, and what is only listed', group: 'הקטלוג' },
  { slug: 'dumps', file: 'docs/mirrors.md', title: 'Dumps and mirrors', label: 'הורדות ואתרי מראה', summary: 'The whole catalog: signed editions, the git mirror, running a mirror', group: 'הקטלוג' },
  { slug: 'oai-pmh', file: 'docs/developers/oai-pmh.md', title: 'OAI-PMH and IIIF', label: 'OAI-PMH ו-IIIF', summary: 'For libraries: Dublin Core records, and IIIF manifests of scans', group: 'הקטלוג' },
  { slug: 'client', file: 'docs/developers/client.md', title: 'TypeScript client', label: 'ספריית TypeScript', summary: '@chassidushub/client, generated from the OpenAPI document', group: 'כלים' },
  { slug: 'agents', file: 'docs/developers/agents.md', title: 'AI agents', label: 'סוכני AI', summary: 'llms.txt and the MCP server: search, read and suggest', group: 'כלים' },
];

export const docAddress = (slug: string) => `/developers${slug ? `/${slug}` : ''}`;

export const docOf = (slug: string) => DOC_PAGES.find((p) => p.slug === slug);

/** Previous and next in reading order, for a page's foot. */
export function neighbours(slug: string): { previous?: DocPage; next?: DocPage } {
  const at = DOC_PAGES.findIndex((p) => p.slug === slug);
  return { previous: at > 0 ? DOC_PAGES[at - 1] : undefined, next: at >= 0 ? DOC_PAGES[at + 1] : undefined };
}

/**
 * One level of the path bar and one choice in its menu, as ui/PathBar.tsx
 * takes them. Written out here rather than imported so this file stays plain
 * TypeScript the server and the unit tests can read without the UI kit.
 */
export type DocChoice = { key: string; label: string; end?: string; to?: string; current?: boolean };
export type DocLevel = { key: string; label: string; icon?: 'code'; title: string; items: DocChoice[] };

/**
 * The path bar of a docs page: "למפתחים", whose menu is every page, then the
 * page, whose menu is the others in its group, and on the reference a group
 * of routes, whose menu is the other groups.
 */
export function docsPath(slug: string, group?: { label: string; items: DocChoice[] }): DocLevel[] {
  const page = docOf(slug);
  const levels: DocLevel[] = [
    {
      key: 'developers',
      label: 'למפתחים',
      icon: 'code',
      title: 'התיעוד למפתחים',
      items: DOC_PAGES.map((p) => ({ key: p.slug || 'overview', label: p.label, end: p.group, to: docAddress(p.slug), current: p.slug === slug })),
    },
  ];
  if (page && page.slug) {
    levels.push({
      key: 'page',
      label: page.label,
      title: page.group,
      items: DOC_PAGES.filter((p) => p.group === page.group).map((p) => ({ key: p.slug, label: p.label, to: docAddress(p.slug), current: p.slug === slug })),
    });
  }
  if (group) levels.push({ key: 'group', label: group.label, title: 'קבוצות הנתיבים', items: group.items });
  return levels;
}
