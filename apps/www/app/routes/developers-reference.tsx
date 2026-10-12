import { Suspense } from 'react';
import { Await, data, Link } from 'react-router';
import { DocsFrame } from '../developers/Frame';
import { baseOf, groupHtml, groupsOf, indexHtml, operationsOf, type OpenApiDocument } from '../developers/reference.server';
import { ServerHtml } from '../ui';
import type { Route } from './+types/developers-reference';

/**
 * The API reference from the API's own OpenAPI document: on
 * /developers/reference every route as a line, a group at a time; on
 * /developers/reference/<group> that group's routes in full. Both are drawn
 * here as HTML (left out of the hydration data on a whole page), so the
 * browser is never sent the document itself, and no page holds all 200
 * routes' examples at once.
 *
 * A whole page waits for the document, since without it the page is a 503
 * and an unknown group a 404; opened from inside the site, the frame is
 * drawn at once and the routes follow.
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
  const shown = {
    key,
    html,
    group: drawn ? { name: drawn.name, slug: params.group!, description: drawn.description, ops: drawn.ops } : null,
    groups,
    info: { title: doc.info.title, version: doc.info.version, routes: ops.length },
    base: baseOf(doc),
  };
  return { slug: params.group ?? null, named: drawn ? ({ name: drawn.name, description: drawn.description } as Named | null) : null, data: Promise.resolve(shown) };
}

/** Opened from inside the site, the frame is drawn at once; the routes follow. */
export function clientLoader({ params, serverLoader }: Route.ClientLoaderArgs) {
  return { slug: params.group ?? null, named: null as Named | null, data: serverLoader().then((d) => d.data) };
}

/** A group's name and what it holds, for the page's title: known on a whole page, not yet after a click. */
type Named = { name: string; description: string };

/** The reference as the page receives it. */
type Shown = Awaited<Route.ComponentProps['loaderData']['data']>;

export function headers() {
  return { 'Cache-Control': 'public, max-age=600, s-maxage=3600' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const group = loaderData?.named;
  if (loaderData?.slug && !group) return [{ title: 'מדריך ה-API · ChassidusHub' }];
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
export default function Screen({ loaderData: { slug, data } }: Route.ComponentProps) {
  // No errorElement: a group that is not there, or an API that does not answer (after a click), goes to the route's error page, as on a whole page.
  return (
    <Suspense key={slug ?? ''} fallback={<Waiting group={!!slug} />}>
      <Await resolve={data}>{(shown) => <Reference shown={shown} />}</Await>
    </Suspense>
  );
}

/** The docs' frame while the routes come. */
function Waiting({ group }: { group: boolean }) {
  return (
    <DocsFrame slug="reference">
      {group ? (
        <p className="faint sm">
          <Link to="/developers/reference">API reference</Link>
        </p>
      ) : (
        <h1>API reference</h1>
      )}
      <p className="faint" aria-busy="true" lang="he" dir="rtl">
        רגע…
      </p>
    </DocsFrame>
  );
}

function Reference({ shown }: { shown: Shown }) {
  // `key` is a name React keeps for itself, so the reference is passed whole.
  const { key, html, group, groups, info, base } = shown;
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
