import { Suspense } from 'react';
import { Await, Form, Link, useLocation, useNavigate } from 'react-router';
import { useAccount } from '../lib/account';
import { Chip, Chips, Row, Rows, Say, SearchField, Segmented, TopBar } from '../ui';
import { dayOf, personName, statusWords, suggestionPath, type People, type Status } from '../suggestions/view';
import type { Route } from './+types/suggestions';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'הצעות · ChassidusHub' }];
}

/** The list is the same for everyone who asks the same address: a minute at the edge. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=30, s-maxage=60' };
}

interface ListRow {
  id: number;
  number: number;
  title: string;
  status: Status;
  author: string;
  createdAt?: string;
  submittedAt?: string | null;
  comments?: number;
  approvals?: number;
  fixes?: number[];
  via?: { name: string } | null;
}

/** A handle as the URL may carry it (`@name` or `name`): letters, digits and dashes only. */
const handleOf = (value: string | null) => (value && /^@?[A-Za-z0-9-]{1,39}$/.test(value) ? value.replace(/^@/, '') : null);

/** What the list shows, as the address asks for it: the page's frame, worked out without waiting for anything. */
function askedOf(request: Request) {
  const url = new URL(request.url);
  const state: 'open' | 'closed' = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';
  const q = url.searchParams.get('q')?.trim().slice(0, 200) ?? '';
  const author = handleOf(url.searchParams.get('author'));
  const reviewer = handleOf(url.searchParams.get('reviewer'));
  const cursor = url.searchParams.get('cursor') || null;
  return { state, q, author, reviewer, cursor };
}

type Asked = ReturnType<typeof askedOf>;

/** One page of the list, with how many are open and closed; null rows when the list did not come. */
async function listOf(api: Route.LoaderArgs['context']['api'], { state, q, author, reviewer, cursor }: Asked) {
  const list = await api.listSuggestions({ state, q: q || undefined, author: author ?? undefined, reviewer: reviewer ?? undefined, cursor: cursor ?? undefined, limit: 30 }).catch(() => null);
  return {
    rows: list
      ? (list.suggestions as unknown as ListRow[]).map(({ id, number, title, status, author, createdAt, submittedAt, comments, approvals, fixes, via }) => ({ id, number, title, status, author, at: submittedAt ?? createdAt ?? null, comments: comments ?? 0, approvals: approvals ?? 0, fixes: fixes ?? [], agent: via ? via.name : null }))
      : null,
    people: (list?.people ?? {}) as People,
    counts: { open: list?.counts?.open ?? null, closed: list?.counts?.closed ?? null },
    next: list?.next ?? null,
  };
}

/**
 * Suggestions as pull requests are listed (the plan, section 7): open
 * (waiting for review, or sent back to their author) or closed (approved or
 * closed), newest first, each with its #number, who sent it and when, and
 * where it stands. Filtered by words or #number, by who sent it and by who is
 * asked to review it, all in the address, so the same address is the same
 * list for everyone and may be kept at the edge; "mine" is only a link the
 * browser makes with the person's handle. The page never waits for the
 * list: the box and the filters come from the address and show at once.
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const asked = askedOf(request);
  return { ...asked, data: listOf(context.api, asked) };
}

/** Opened from inside the site, the frame is drawn at once; the list follows. */
export function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  return { ...askedOf(request), data: serverLoader().then((loaded) => loaded.data) };
}

type Listed = Awaited<ReturnType<typeof listOf>>;
type Loaded = Asked & Listed;

/** The list's address with one thing changed (and the page back to its start). */
function addressOf(now: Pick<Loaded, 'state' | 'q' | 'author' | 'reviewer'>, change: Partial<Record<'state' | 'q' | 'author' | 'reviewer' | 'cursor', string | null>>): string {
  const next = new URLSearchParams();
  const all = { state: now.state === 'open' ? null : now.state, q: now.q || null, author: now.author, reviewer: now.reviewer, cursor: null, ...change };
  for (const [key, value] of Object.entries(all)) if (value && !(key === 'state' && value === 'open')) next.set(key, value);
  const query = next.toString();
  return `/suggestions${query ? `?${query}` : ''}`;
}

export default function Screen({ loaderData: page }: Route.ComponentProps) {
  const navigate = useNavigate();
  const account = useAccount();
  const me = account?.person.username ?? null;
  const filtered = Boolean(page.q || page.author || page.reviewer);
  // Each list its own wait: going to another one shows its frame at once, not the last list until the next has come.
  const { search } = useLocation();
  return (
    <>
      <TopBar title="הצעות" />
      <main id="content" className="view">
        <h1>הצעות</h1>
        <p className="lede muted">תיקונים ותוספות שאנשים הציעו. שומרי הספר בודקים כל הצעה, ורק אחרי שאישרו אותה היא נכנסת לספרייה.</p>
        <Form method="get" action="/suggestions" role="search">
          {page.state === 'closed' && <input type="hidden" name="state" value="closed" />}
          {page.author && <input type="hidden" name="author" value={page.author} />}
          {page.reviewer && <input type="hidden" name="reviewer" value={page.reviewer} />}
          <SearchField key={page.q} name="q" label="חיפוש בהצעות: מילים מהכותרת, או #מספר" defaultValue={page.q} />
        </Form>
        <div className="sg-bar">
          {/* The counts come with the list; until then the tabs show without them. */}
          <Suspense key={search} fallback={<States page={page} />}>
            <Await resolve={page.data} errorElement={<States page={page} />}>
              {(listed) => <States page={page} counts={listed.counts} />}
            </Await>
          </Suspense>
          <Link to="/back?tab=waiting" className="sg-link">
            מה מחכה לבדיקה
          </Link>
        </div>
        {me || filtered ? (
          <Chips label="של מי">
            <Chip on={!page.author && !page.reviewer} onClick={() => navigate(addressOf(page, { author: null, reviewer: null }))}>
              כולן
            </Chip>
            {me && (
              <Chip on={page.reviewer === me} onClick={() => navigate(addressOf(page, { author: null, reviewer: me }))}>
                מחכות לבדיקה שלי
              </Chip>
            )}
            {me && (
              <Chip on={page.author === me} onClick={() => navigate(addressOf(page, { author: me, reviewer: null }))}>
                ששלחתי
              </Chip>
            )}
            {page.author && page.author !== me && <Chip on>{`ששלח @${page.author}`}</Chip>}
            {page.reviewer && page.reviewer !== me && <Chip on>{`לבדיקה של @${page.reviewer}`}</Chip>}
          </Chips>
        ) : null}
        <Suspense
          key={search}
          fallback={
            <p className="faint" aria-busy="true">
              רגע…
            </p>
          }
        >
          <Await resolve={page.data} errorElement={<Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>}>
            {(listed) => <List page={{ ...page, ...listed }} />}
          </Await>
        </Suspense>
      </main>
    </>
  );
}

/** Open or closed, each with how many there are once the list has come. */
function States({ page, counts }: { page: Asked; counts?: Listed['counts'] }) {
  const navigate = useNavigate();
  const count = (n: number | null | undefined) => (n == null ? '' : ` (${n.toLocaleString('he')})`);
  return (
    <Segmented
      label="פתוחות או סגורות"
      value={page.state}
      onChange={(state) => navigate(addressOf(page, { state }))}
      options={[
        { value: 'open', label: `פתוחות${count(counts?.open)}` },
        { value: 'closed', label: `סגורות${count(counts?.closed)}` },
      ]}
    />
  );
}

function List({ page }: { page: Loaded }) {
  if (!page.rows) return <Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>;
  if (page.rows.length === 0)
    return (
      <Say>
        {page.q || page.author || page.reviewer ? (
          <>
            אין הצעות כאן. <Link to={addressOf(page, { q: null, author: null, reviewer: null })}>לכל ההצעות</Link>
          </>
        ) : page.state === 'open' ? (
          'אין עכשיו הצעות פתוחות. אפשר להציע תיקון מכל עמוד באתר.'
        ) : (
          'עוד אין הצעות סגורות.'
        )}
      </Say>
    );
  return (
    <>
      <Rows>
        {page.rows.map((row) => (
          <Row
            key={row.id}
            to={suggestionPath(row)}
            title={<bdi>{row.title}</bdi>}
            sub={
              <>
                {`#${row.number} · ${statusWords(row.status)} · ${personName(row.author, page.people)}`}
                {row.agent && <span className="machine sg-agent">סוכן</span>}
                {row.at ? ` · ${dayOf(row.at)}` : ''}
                {row.approvals ? ` · ${row.approvals === 1 ? 'אישור אחד' : `${row.approvals} אישורים`}` : ''}
                {row.fixes.length ? ` · מתקנת ${row.fixes.map((n) => `#${n}`).join(' ')}` : ''}
              </>
            }
            end={row.comments ? `${row.comments} תגובות` : undefined}
          />
        ))}
      </Rows>
      {page.next && (
        <p className="sg-more">
          <Link to={addressOf(page, { cursor: page.next })}>עוד הצעות</Link>
        </p>
      )}
    </>
  );
}
