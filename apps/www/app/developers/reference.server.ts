import { API } from './pages.js';
import { COPY } from './docs.server.js';
import { escapeHtml } from './markdown.server.js';

/**
 * The API reference, read from the API's own OpenAPI document (GET
 * /openapi.json), with an example of each route in curl and in TypeScript
 * (@chassidushub/client). Drawn on the server, for /developers/reference
 * and /llms-full.txt, so both say what the API says and the browser is sent
 * HTML, never the document.
 */

type Schema = Record<string, any>;

export interface OpenApiDocument {
  info: { title: string; version: string };
  servers?: Array<{ url: string }>;
  tags?: Array<{ name: string; description?: string }>;
  components?: { schemas?: Record<string, Schema> };
  paths: Record<string, Record<string, any>>;
}

export interface Operation {
  id: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  description: string | null;
  access: 'public' | 'optional' | 'read' | 'write' | 'site';
  paged: boolean;
  params: Array<{ name: string; in: 'path' | 'query' | 'header'; required?: boolean; description?: string; schema: Schema }>;
  body: { type: string; schema: Schema; required: boolean } | null;
  deprecated: boolean;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Every operation, in the order of the document's tags, then its paths. */
export function operationsOf(doc: OpenApiDocument): Operation[] {
  const order = new Map((doc.tags ?? []).map((tag, at) => [tag.name, at]));
  const ops: Operation[] = [];
  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!METHODS.includes(method)) continue;
      const [type, media] = Object.entries((op.requestBody?.content ?? {}) as Record<string, { schema: Schema }>)[0] ?? [];
      ops.push({
        id: op.operationId ?? `${method}${path}`,
        method: method.toUpperCase(),
        path,
        tag: op.tags?.[0] ?? 'Other',
        summary: op.summary ?? '',
        description: op.description ?? null,
        access: op['x-access'] ?? 'public',
        paged: Boolean(op['x-paged']),
        params: op.parameters ?? [],
        body: type ? { type, schema: media!.schema, required: Boolean(op.requestBody.required) } : null,
        deprecated: Boolean(op.deprecated),
      });
    }
  }
  return ops.sort((a, b) => (order.get(a.tag) ?? 99) - (order.get(b.tag) ?? 99));
}

/** The groups that have routes, each with its page's address piece. */
export function groupsOf(doc: OpenApiDocument, ops = operationsOf(doc)): Array<{ name: string; slug: string; description: string; count: number }> {
  const named = (doc.tags ?? []).map((tag) => tag.name);
  const names = [...named, ...[...new Set(ops.map((op) => op.tag))].filter((name) => !named.includes(name))];
  return names
    .map((name) => ({ name, slug: groupSlug(name), description: doc.tags?.find((tag) => tag.name === name)?.description ?? '', count: ops.filter((op) => op.tag === name).length }))
    .filter((group) => group.count > 0);
}

export const groupSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** What a value of a schema may look like, for an example. */
export function exampleOf(schema: Schema | undefined, name = '', doc?: OpenApiDocument, depth = 0): unknown {
  if (!schema || depth > 4) return null;
  if (schema.$ref) return exampleOf(doc?.components?.schemas?.[String(schema.$ref).split('/').pop()!], name, doc, depth + 1);
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if ('const' in schema) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.oneOf || schema.anyOf) return exampleOf((schema.oneOf ?? schema.anyOf)[0], name, doc, depth + 1);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'string') {
    if (schema.pattern?.includes('rh-') || schema.pattern?.includes('[hH]-')) return 'rh-7k2m9q4d';
    if (schema.pattern === '^[0-9a-f]{64}$') return '<sha256>';
    if (name === 'q' || name === 'query') return 'יו"ד שבט';
    if (name === 'title') return 'Fix the date';
    if (name === 'note') return 'As printed in Sichos Kodesh';
    return `<${name || 'text'}>`;
  }
  if (type === 'integer' || type === 'number') return schema.minimum ?? 1;
  if (type === 'boolean') return true;
  if (type === 'array') return [exampleOf(schema.items, name, doc, depth + 1)];
  if (type === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of (schema.required ?? []) as string[]) out[key] = exampleOf(schema.properties?.[key], key, doc, depth + 1);
    return out;
  }
  return null;
}

/** The route's path with example values in it, and its required query. */
export function examplePath(op: Operation, doc?: OpenApiDocument): string {
  let path = op.path;
  for (const p of op.params.filter((p) => p.in === 'path')) path = path.replace(`{${p.name}}`, String(exampleOf(p.schema, p.name, doc)));
  const query = op.params.filter((p) => p.in === 'query' && p.required).map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(exampleOf(p.schema, p.name, doc)))}`);
  return query.length ? `${path}?${query.join('&')}` : path;
}

const needsToken = (op: Operation) => op.access === 'read' || op.access === 'write';

export function curlExample(op: Operation, base: string, doc?: OpenApiDocument): string {
  const parts = [`curl${op.method === 'GET' ? '' : ` -X ${op.method}`} '${base}${examplePath(op, doc)}'`];
  if (needsToken(op)) parts.push(`-H "Authorization: Bearer $CHASSIDUSHUB_TOKEN"`);
  if (op.body?.type.includes('json')) {
    parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`-d '${JSON.stringify(exampleOf(op.body.schema, '', doc)).replace(/'/g, "'\\''")}'`);
  } else if (op.body) parts.push(`-H 'Content-Type: ${op.body.type === 'application/octet-stream' ? 'application/pdf' : op.body.type}' --data-binary @file`);
  return parts.join(' \\\n  ');
}

export function typescriptExample(op: Operation, doc?: OpenApiDocument): string {
  const input: Record<string, unknown> = {};
  for (const p of op.params.filter((p) => p.required)) input[p.name] = exampleOf(p.schema, p.name, doc);
  if (op.body?.type.includes('json')) input.body = exampleOf(op.body.schema, '', doc);
  else if (op.body) Object.assign(input, { body: '<the file>', contentType: 'application/pdf' });
  const args = Object.keys(input).length ? JSON.stringify(input, null, 2).replace(/"([A-Za-z_$][\w$]*)":/g, '$1:').replace('"<the file>"', 'file') : '';
  const setup = `import { ChassidusHub } from '@chassidushub/client';\n\nconst rh = new ChassidusHub(${needsToken(op) ? '{ token: process.env.CHASSIDUSHUB_TOKEN }' : ''});\n`;
  if (op.paged) return `${setup}for await (const item of rh.all('${op.id}', ${args || '{}'})) {\n  console.log(item);\n}`;
  return `${setup}const answer = await rh.${op.id}(${args});`;
}

/** Who may call it, in words. */
export function accessLabel(op: Pick<Operation, 'access'>): string {
  switch (op.access) {
    case 'public':
      return 'No account needed';
    case 'optional':
      return 'No account needed; signed in, a little more';
    case 'read':
      return 'A token (read scope) or the site session';
    case 'write':
      return 'A token with the write scope, or the site session';
    case 'site':
      return "The site's own pages only; not for tokens";
  }
}

/** The address examples are written with: the document's own server, else the public API. */
export const baseOf = (doc: OpenApiDocument) => (doc.servers?.[0]?.url ?? API).replace(/\/+$/, '');

const code = (text: string, lang: string) => `<div class="codebox"><span class="lang">${lang}</span>${COPY}<pre tabindex="0"><code>${escapeHtml(text)}</code></pre></div>`;

const method = (m: string) => `<span class="method ${m.toLowerCase()}">${m}</span>`;

/** The index of every route, a group at a time, each route a line leading to its group's page. */
export function indexHtml(doc: OpenApiDocument): string {
  const ops = operationsOf(doc);
  return groupsOf(doc, ops)
    .map(
      (group) =>
        `<h2 id="${group.slug}"><a href="/developers/reference/${group.slug}">${escapeHtml(group.name)}</a> <span class="count">${group.count}</span></h2>${group.description ? `<p>${escapeHtml(group.description)}</p>` : ''}<ul class="routes">${ops
          .filter((op) => op.tag === group.name)
          .map((op) => `<li><a href="/developers/reference/${group.slug}#${escapeHtml(op.id)}">${method(op.method)}<code>${escapeHtml(op.path)}</code><span>${escapeHtml(op.summary)}</span></a></li>`)
          .join('')}</ul>`,
    )
    .join('\n');
}

/**
 * One group's routes in full: each with its method and path, who may call
 * it, its parameters and body, and its example in curl and TypeScript. A
 * route anyone may read without a body also has its example as a link, to
 * open its answer from the page.
 */
export function groupHtml(doc: OpenApiDocument, slug: string): { name: string; description: string; html: string; ops: Array<{ id: string; text: string }> } | null {
  const ops = operationsOf(doc);
  const group = groupsOf(doc, ops).find((g) => g.slug === slug);
  if (!group) return null;
  const base = baseOf(doc);
  const mine = ops.filter((op) => op.tag === group.name);
  const html = mine
    .map((op) => {
      const params = op.params.length
        ? `<h3>Parameters</h3><ul class="params">${op.params
            .map((p) => {
              const type = p.schema?.enum ? (p.schema.enum as unknown[]).join(' | ') : String(p.schema?.type ?? '');
              const about = p.description ?? p.schema?.description;
              return `<li><code>${escapeHtml(p.name)}</code> <span class="faint">${escapeHtml(type)} · ${p.in}${p.required ? ' · required' : ''}</span>${about ? `<br>${escapeHtml(String(about))}` : ''}</li>`;
            })
            .join('')}</ul>`
        : '';
      const body = op.body ? `<details class="fold"><summary><span>Body: ${escapeHtml(op.body.type)}${op.body.required ? ', required' : ''}</span></summary><pre tabindex="0"><code>${escapeHtml(JSON.stringify(op.body.schema, null, 2))}</code></pre></details>` : '';
      const typescript = op.access !== 'site' && op.path !== '/';
      const tryIt = op.method === 'GET' && (op.access === 'public' || op.access === 'optional') ? `<p><a href="${escapeHtml(`${base}${examplePath(op, doc)}`)}" rel="noopener">Open this example's answer</a></p>` : '';
      return `<section class="op" id="${escapeHtml(op.id)}"><h2>${escapeHtml(op.summary)}${op.deprecated ? ' <span class="tag">Deprecated</span>' : ''}</h2><p class="route">${method(op.method)}<code>${escapeHtml(op.path)}</code></p><p class="faint">${escapeHtml(accessLabel(op))}${op.paged ? ' · Paged: pass <code>next</code> back as <code>cursor</code>' : ''} · <code>${escapeHtml(op.id)}</code></p>${op.description ? `<p>${escapeHtml(op.description)}</p>` : ''}${params}${body}${code(curlExample(op, base, doc), 'curl')}${typescript ? code(typescriptExample(op, doc), 'TypeScript') : ''}${tryIt}</section>`;
    })
    .join('\n');
  return { name: group.name, description: group.description, html, ops: mine.map((op) => ({ id: op.id, text: op.summary })) };
}

/** Every route as a line, for /llms-full.txt. */
export function routeLines(doc: OpenApiDocument): string[] {
  return operationsOf(doc)
    .filter((op) => op.access !== 'site')
    .map((op) => {
      const params = op.params.map((p) => `${p.name}${p.required ? '' : '?'} (${p.in})`).join(', ');
      return `- \`${op.method} ${op.path}\` ${op.id}: ${op.summary}. ${accessLabel(op)}.${params ? ` Parameters: ${params}.` : ''}${op.body ? ' Takes a JSON body.' : ''}${op.paged ? ' Paged (cursor).' : ''}`;
    });
}
