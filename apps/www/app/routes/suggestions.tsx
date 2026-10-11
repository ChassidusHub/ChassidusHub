import { Form, Link, useNavigate } from 'react-router';
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

/**
 * Suggestions as pull requests are listed (the plan, section 7): open
 * (waiting for review, or sent back to their author) or closed (approved or
 * closed), newest first, each with its #number, who sent it and when, and
 * where it stands. Filtered by words or #number, by who sent it and by who is
 * asked to review it, all in the address, so the same address is the same
 * list for everyone and may be kept at the edge; "mine" is only a link the
 * browser makes with the person's handle.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';
  const q = url.searchParams.get('q')?.trim().slice(0, 200) || undefined;
  const author = handleOf(url.searchParams.get('author'));
  const reviewer = handleOf(url.searchParams.get('reviewer'));
  const cursor = url.searchParams.get('cursor') || undefined;
  const list = await context.api.listSuggestions({ state, q, author: author ?? undefined, reviewer: reviewer ?? undefined, cursor, limit: 30 }).catch(() => null);
  return {
    state,
    q: q ?? '',
    author,
    reviewer,
    cursor: cursor ?? null,
    rows: list
      ? (list.suggestions as unknown as ListRow[]).map(({ id, number, title, status, author, createdAt, submittedAt, comments, approvals, fixes, via }) => ({ id, number, title, status, author, at: submittedAt ?? createdAt ?? null, comments: comments ?? 0, approvals: approvals ?? 0, fixes: fixes ?? [], agent: via ? via.name : null }))
      : null,
    people: (list?.people ?? {}) as People,
    counts: { open: list?.counts?.open ?? null, closed: list?.counts?.closed ?? null },
    next: list?.next ?? null,
  };
}

type Loaded = Awaited<ReturnType<typeof loader>>;

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
  const count = (n: number | null) => (n === null ? '' : ` (${n.toLocaleString('he')})`);
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
          <Segmented
            label="פתוחות או סגורות"
            value={page.state}
            onChange={(state) => navigate(addressOf(page, { state }))}
            options={[
              { value: 'open', label: `פתוחות${count(page.counts.open)}` },
              { value: 'closed', label: `סגורות${count(page.counts.closed)}` },
            ]}
          />
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
        <List page={page} />
      </main>
    </>
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
