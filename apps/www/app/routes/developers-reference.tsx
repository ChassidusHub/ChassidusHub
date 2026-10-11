import { data, Link } from 'react-router';
import { DocsFrame } from '../developers/Frame';
import { baseOf, groupHtml, groupsOf, indexHtml, operationsOf, type OpenApiDocument } from '../developers/reference.server';
import { ServerHtml } from '../reader/Words';
import type { Route } from './+types/developers-reference';

/**
 * The API reference from the API's own OpenAPI document: on
 * /developers/reference every route as a line, a group at a time; on
 * /developers/reference/<group> that group's routes in full. Both are drawn
 * here as HTML (left out of the hydration data on a whole page), so the
 * browser is never sent the document itself, and no page holds all 200
 * routes' examples at once.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const doc = (await context.api.openapi().catch(() => null)) as OpenApiDocument | null;
  if (!doc?.paths) throw data('the API did not answer', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const ops = operationsOf(doc);
  const groups = groupsOf(doc, ops).map(({ name, slug, count }) => ({ name, slug, count }));
  let drawn: { name: string; description: string; html: string; ops: Array<{ id: string; text: string }> } | null = null;
  if (params.group) {
    drawn = groupHtml(doc, params.group);
    if (!drawn) throw data('not found', { status: 404 });
  }
  const key = `reference:${params.group ?? ''}`;
  let html: string | null = drawn ? drawn.html : indexHtml(doc);
  if (context.document && context.serverOnly) {
    context.serverOnly.set(key, html);
    html = null;
  }
  return {
    key,
    html,
    group: drawn ? { name: drawn.name, slug: params.group!, description: drawn.description, ops: drawn.ops } : null,
    groups,
    info: { title: doc.info.title, version: doc.info.version, routes: ops.length },
    base: baseOf(doc),
  };
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=600, s-maxage=3600' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const group = loaderData?.group;
  return [
    { title: group ? `${group.name} · מדריך ה-API · ChassidusHub` : 'מדריך ה-API · למפתחים · ChassidusHub' },
    { name: 'description', content: group ? group.description || `The ${group.name} routes of the ChassidusHub API.` : 'Every route of the ChassidusHub API, with examples in curl and TypeScript.' },
  ];
}

/**
 * The API reference (thread 6, rebuilt from the old site), in the docs'
 * frame and their English. A route that anyone may read can be opened from
 * the page; what needs a person goes with a token (see the auth page).
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { key, html, group, groups, info, base } = loaderData;
  const menu = group ? { label: group.name, items: groups.map((g) => ({ key: g.slug, label: g.name, end: String(g.count), to: `/developers/reference/${g.slug}`, current: g.slug === group.slug })) } : undefined;
  return (
    <DocsFrame slug="reference" group={menu} contents={group ? group.ops.map((op) => ({ id: op.id, text: op.text, depth: 2 })) : undefined}>
      {group ? (
        <>
          <p className="faint sm">
            <Link to="/developers/reference">API reference</Link>
          </p>
          <h1>{group.name}</h1>
          {group.description && <p className="lede">{group.description}.</p>}
        </>
      ) : (
        <>
          <h1>API reference</h1>
          <p className="lede">
            {info.title} {info.version}: {info.routes} routes in {groups.length} groups, read from the API&apos;s own <a href={`${base}/openapi.json`}>OpenAPI document</a>.
          </p>
          <dl className="terms">
            <div>
              <dt>Base URL</dt>
              <dd>
                <code>{base}</code>
              </dd>
            </div>
            <div>
              <dt>Reading</dt>
              <dd>Needs nothing: no account, no key.</dd>
            </div>
            <div>
              <dt>Writing</dt>
              <dd>
                A <Link to="/developers/auth">personal token</Link>, or the site&apos;s own session.
              </dd>
            </div>
          </dl>
        </>
      )}
      <ServerHtml id={key} html={html} className="prose" />
    </DocsFrame>
  );
}
