import { data, Link } from 'react-router';
import { drawDoc } from '../developers/docs.server';
import { DocsFrame } from '../developers/Frame';
import { API, DOC_PAGES, docAddress } from '../developers/pages';
import { Icon, Row, Rows, SectionHead, ServerHtml } from '../ui';
import type { Route } from './+types/developers';

/**
 * One page of the docs, drawn from its file on the server. On a whole page
 * its HTML goes to the request's `serverOnly` and is left out of the
 * hydration data, so it is sent once; after a click it comes with the data.
 */
export function loader({ params, context }: Route.LoaderArgs) {
  const slug = params.page ?? '';
  const doc = slug === 'reference' ? null : drawDoc(slug);
  if (!doc) throw data('not found', { status: 404 });
  const key = `doc:${slug}`;
  let html: string | null = doc.html;
  if (context.document && context.serverOnly) {
    context.serverOnly.set(key, doc.html);
    html = null;
  }
  return { slug, key, html, title: doc.title, summary: doc.page.summary, label: doc.page.label, file: doc.page.file, headings: doc.headings };
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=600, s-maxage=3600' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: 'למפתחים · ChassidusHub' }];
  return [{ title: loaderData.slug ? `${loaderData.title} · למפתחים · ChassidusHub` : 'למפתחים · ChassidusHub' }, { name: 'description', content: loaderData.summary }];
}

/**
 * The developer docs (thread 6, rebuilt from the old site): the repository's
 * docs, one page each, in their own English inside the site's Hebrew frame.
 * The overview adds every page as a list, and where agents read.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { slug, key, html, title, summary, file, headings } = loaderData;
  return (
    <DocsFrame slug={slug} contents={headings} file={file}>
      <h1>{title}</h1>
      {slug && <p className="lede">{summary}.</p>}
      <ServerHtml id={key} html={html} className="prose" />
      {slug === '' && <Overview />}
    </DocsFrame>
  );
}

/** The overview's map of the docs, and where AI agents and programs read; said in the site's Hebrew. */
function Overview() {
  return (
    <div lang="he" dir="rtl">
      <SectionHead title="דפי התיעוד" />
      <Rows>
        {DOC_PAGES.filter((page) => page.slug).map((page) => (
          <Row key={page.slug} to={docAddress(page.slug)} title={page.label} sub={<bdi lang="en" dir="ltr">{page.summary}</bdi>} end={page.group} />
        ))}
      </Rows>
      <SectionHead title="לסוכני AI ולתוכנות" />
      <p className="muted">
        תנו לסוכן את <a href="/llms.txt">llms.txt</a> (איפה הכל) או את <a href="/llms-full.txt">llms-full.txt</a> (כל דפי התיעוד וכל הנתיבים בקובץ אחד), או חברו אותו לשרת ה-MCP. לא מפתחים? <Link to="/connect">חיבור Claude או ChatGPT בדקה</Link>.
      </p>
      <ul className="links">
        {[
          { href: '/llms.txt', label: 'llms.txt' },
          { href: '/llms-full.txt', label: 'llms-full.txt' },
          { href: `${API}/openapi.json`, label: 'openapi.json' },
          { href: `${API}/mcp`, label: 'MCP' },
        ].map((link) => (
          <li key={link.href}>
            <a href={link.href}>
              <Icon name={link.label === 'MCP' ? 'link' : 'code'} />
              <span>
                <bdi dir="ltr">{link.label}</bdi>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
