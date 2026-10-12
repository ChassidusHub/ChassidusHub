import { Suspense, useEffect, useState } from 'react';
import { Await, Form, Link, useLocation } from 'react-router';
import { useAccount } from '../lib/account';
import { asPerson, day, kindName, labelName, nameOf, personName, titleOf, type IssueLabel, type IssueRow, type IssueTemplate, type People } from '../people/talk';
import { Button, Chips, Icon, SearchField, Say, TopBar } from '../ui';
import type { Route } from './+types/issues';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'דיווחים · ChassidusHub' }];
}

/** How many a page of the list shows; "more" asks for the next page. */
const PAGE = 30;

/** The filters a list's address carries: open or closed, one kind, one label, one person, and words. */
interface Filters {
  state: 'open' | 'closed';
  type: string | null;
  label: string | null;
  author: string | null;
  assignee: string | null;
  q: string;
}

function filtersOf(url: URL): Filters {
  const get = (name: string) => url.searchParams.get(name)?.trim().slice(0, 100) || null;
  return { state: get('state') === 'closed' ? 'closed' : 'open', type: get('type'), label: get('label'), author: get('author'), assignee: get('assignee'), q: get('q') ?? '' };
}

/** The API's own question for a list, from the page's filters. */
function queryOf(filters: Filters, cursor?: string | null): URLSearchParams {
  const query = new URLSearchParams({ state: filters.state, limit: String(PAGE) });
  for (const name of ['type', 'label', 'author', 'assignee'] as const) if (filters[name]) query.set(name, filters[name]!);
  if (filters.q) query.set('q', filters.q);
  if (cursor) query.set('cursor', cursor);
  return query;
}

interface Listing {
  items: IssueRow[];
  people: People;
  counts: { open: number; closed: number };
  next: string | null;
}

/** The API answers each report with its words; a list shows titles, so the words are dropped before the page keeps it. */
const titlesOnly = (listing: { items: (IssueRow & { body?: unknown })[]; people?: unknown; counts?: Listing['counts']; next?: string | null }): Listing => ({
  items: listing.items.map(({ body: _body, ...row }) => row),
  people: (listing.people ?? {}) as People,
  counts: listing.counts ?? { open: 0, closed: 0 },
  next: listing.next ?? null,
});

/** The public list, and the kinds and labels to filter by; each that fails to come is said so or left out. */
async function listsOf(api: Route.LoaderArgs['context']['api'], filters: Filters) {
  const mine = filters.author === '@me' || filters.assignee === '@me';
  const [listing, templates, labels] = await Promise.all([
    mine ? null : api.listIssues(Object.fromEntries(queryOf(filters)) as never).then((r) => titlesOnly(r as never), () => null),
    api.issueTemplates().then((r) => r.templates as unknown as IssueTemplate[], () => []),
    api.listLabels().then((r) => r.labels as unknown as (IssueLabel & { open?: number })[], () => []),
  ]);
  return { listing, failed: !mine && !listing, kinds: templates.map((t) => ({ type: t.type, name: t.label.he || kindName(t) })), labels: labels.map((l) => ({ name: l.name, open: l.open ?? 0 })) };
}

type Lists = Awaited<ReturnType<typeof listsOf>>;

/**
 * The public list is read here, so it works before the script loads; the
 * kinds and labels to filter by come with it. A signed-in reader's list is
 * asked again in the browser (some reports are private to those who may
 * read them, and "mine" is theirs). The page never waits for them: the box
 * and the filters come from the address and show at once.
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const filters = filtersOf(new URL(request.url));
  return { filters, data: listsOf(context.api, filters) };
}

/** Opened from inside the site, the frame is drawn at once; the list follows. */
export function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  return { filters: filtersOf(new URL(request.url)), data: serverLoader().then((loaded) => loaded.data) };
}

/** Reports are the same for everyone who is not signed in; a minute at the edge keeps a busy list quick. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=60, s-maxage=60' };
}

/** The list's address with one filter changed (null takes it away). */
function addressOf(filters: Filters, change: Partial<Filters>) {
  const next = { ...filters, ...change };
  const query = new URLSearchParams();
  if (next.state === 'closed') query.set('state', 'closed');
  for (const name of ['type', 'label', 'author', 'assignee'] as const) if (next[name]) query.set(name, next[name]!);
  if (next.q) query.set('q', next.q);
  const search = query.toString();
  return search ? `/issues?${search}` : '/issues';
}

/**
 * Reports (the plan's Report; issues, as GitHub calls them): problems people
 * found, a wrong word, a missing page, a recording cut short. Open or
 * closed, by kind, label or person, or by words; one line a report: its
 * title, who opened it and when, the item it is about, its labels, and how
 * much was said. The words of a report are read on its own page.
 */
export default function Issues({ loaderData }: Route.ComponentProps) {
  const { filters } = loaderData;
  const account = useAccount();
  const mine = filters.author === '@me' || filters.assignee === '@me';
  // Each list its own wait: going to another one shows its frame at once, not the last list until the next has come.
  const { search } = useLocation();
  return (
    <>
      <TopBar title="דיווחים" />
      <main id="content" className="view people">
        <div className="phead">
          <h1>דיווחים</h1>
          <Button small icon="flag" to={filters.type ? `/issues/new?type=${encodeURIComponent(filters.type)}` : '/issues/new'}>
            דיווח חדש
          </Button>
        </div>
        <p className="lede faint">בעיות שהלומדים מצאו: טעות בטקסט, עמוד חסר, הקלטה שנקטעת. אחראי האוסף בודקים כל דיווח.</p>
        <Form method="get" action="/issues" role="search" className="search-form">
          {filters.state === 'closed' && <input type="hidden" name="state" value="closed" />}
          {(['type', 'label', 'author', 'assignee'] as const).map((name) => filters[name] && <input key={name} type="hidden" name={name} value={filters[name]!} />)}
          <SearchField key={filters.q} name="q" label="חיפוש בדיווחים" defaultValue={filters.q} size="small" />
        </Form>
        <Suspense
          key={search}
          fallback={
            <>
              <States filters={filters} signedIn={!!account} />
              <p className="faint" aria-busy="true">
                רגע…
              </p>
            </>
          }
        >
          <Await
            resolve={loaderData.data}
            errorElement={
              <>
                <States filters={filters} signedIn={!!account} />
                <Say tone="bad">הדיווחים לא נטענו כרגע. נסו שוב בעוד רגע.</Say>
              </>
            }
          >
            {(lists) => <Listed filters={filters} lists={lists} mine={mine} />}
          </Await>
        </Suspense>
      </main>
    </>
  );
}

/** Open or closed, and for a signed-in reader their own; each with how many there are once the list has come. */
function States({ filters, signedIn, counts }: { filters: Filters; signedIn: boolean; counts?: Listing['counts'] }) {
  const to = (change: Partial<Filters>) => addressOf(filters, change);
  const count = (n: number | undefined) => (counts ? ` ${n ?? 0}` : '');
  return (
    <Chips label="מצב">
      <Link className="chip" to={to({ state: 'open' })} aria-current={filters.state === 'open' ? 'true' : undefined}>
        פתוחים{count(counts?.open)}
      </Link>
      <Link className="chip" to={to({ state: 'closed' })} aria-current={filters.state === 'closed' ? 'true' : undefined}>
        טופלו{count(counts?.closed)}
      </Link>
      {signedIn && (
        <>
          <Link className="chip" to={to({ assignee: filters.assignee === '@me' ? null : '@me' })} aria-current={filters.assignee === '@me' ? 'true' : undefined}>
            עליי
          </Link>
          <Link className="chip" to={to({ author: filters.author === '@me' ? null : '@me' })} aria-current={filters.author === '@me' ? 'true' : undefined}>
            שפתחתי
          </Link>
        </>
      )}
    </Chips>
  );
}

/** The list once it has come, asked again as the person when they are signed in, with the kinds and labels to filter by. */
function Listed({ filters, lists, mine }: { filters: Filters; lists: Lists; mine: boolean }) {
  const { kinds, labels } = lists;
  const account = useAccount();
  const [listing, setListing] = useState<Listing | null>(lists.listing);
  const [failed, setFailed] = useState(lists.failed);
  const [busy, setBusy] = useState(false);
  const key = queryOf(filters).toString();

  useEffect(() => {
    setListing(lists.listing);
    setFailed(lists.failed);
  }, [lists.listing, lists.failed]);

  // Signed in, the list is asked again as the person: their private reports, and "mine".
  useEffect(() => {
    if (!account) {
      if (account === null && mine) setListing({ items: [], people: {}, counts: { open: 0, closed: 0 }, next: null });
      return;
    }
    let live = true;
    asPerson<Parameters<typeof titlesOnly>[0]>(`issues?${key}`).then(
      (r) => live && (setListing(titlesOnly(r)), setFailed(false)),
      () => live && mine && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [account, key, mine]);

  async function more() {
    if (!listing?.next) return;
    setBusy(true);
    try {
      const next = titlesOnly(await asPerson<Parameters<typeof titlesOnly>[0]>(`issues?${queryOf(filters, listing.next)}`));
      setListing({ ...listing, items: [...listing.items, ...next.items], people: { ...listing.people, ...next.people }, next: next.next });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const filtered = filters.type || filters.label || filters.author || filters.assignee || filters.q;
  const people = listing?.people ?? {};
  const to = (change: Partial<Filters>) => addressOf(filters, change);

  return (
    <>
      <States filters={filters} signedIn={!!account} counts={listing?.counts} />
      {kinds.length > 0 && (
        <details className="pfilter" open={!!filters.type || !!filters.label}>
          <summary>
            סוג ותווית
            <Icon name="chevron-down" size="s" />
          </summary>
          <Chips label="סוג">
            {kinds.map((kind) => (
              <Link key={kind.type} className="chip" to={to({ type: filters.type === kind.type ? null : kind.type })} aria-current={filters.type === kind.type ? 'true' : undefined}>
                {kind.name}
              </Link>
            ))}
          </Chips>
          {labels.length > 0 && (
            <Chips label="תווית">
              {labels.map((label) => (
                <Link key={label.name} className="chip" to={to({ label: filters.label === label.name ? null : label.name })} aria-current={filters.label === label.name ? 'true' : undefined}>
                  {labelName(label.name)}
                  {label.open > 0 && <span className="faint">{label.open}</span>}
                </Link>
              ))}
            </Chips>
          )}
        </details>
      )}
      {(filters.author && filters.author !== '@me') || (filters.assignee && filters.assignee !== '@me') ? (
        <p className="faint sm">
          {filters.author && filters.author !== '@me' ? <>שפתח <bdi>@{filters.author}</bdi> </> : null}
          {filters.assignee && filters.assignee !== '@me' ? <>{filters.assignee === 'none' ? 'בלי אחראי' : <>על <bdi>@{filters.assignee}</bdi></>} </> : null}
        </p>
      ) : null}

      {failed ? (
        <Say tone="bad">הדיווחים לא נטענו כרגע. נסו שוב בעוד רגע.</Say>
      ) : !listing ? (
        mine && account === null ? (
          <Say>
            כדי לראות את הדיווחים שלכם צריך <Link to={`/signin?return=${encodeURIComponent(to({}))}`}>להיכנס</Link>.
          </Say>
        ) : (
          <p className="faint" aria-busy="true">
            רגע…
          </p>
        )
      ) : listing.items.length === 0 ? (
        <div className="pempty">
          <p>אין כאן דיווחים.</p>
          <div className="btns">
            {filtered && (
              <Button small look="outline" to={to({ type: null, label: null, author: null, assignee: null, q: '' })}>
                ניקוי הסינון
              </Button>
            )}
            <Button small look="outline" to="/issues/new">
              דיווח חדש
            </Button>
          </div>
        </div>
      ) : (
        <ul className="threads" aria-label="דיווחים">
          {listing.items.map((issue) => (
            <li key={issue.number}>
              <Link to={`/issues/${issue.number}`} className="thread">
                <span className="t">
                  <b dir="auto">{titleOf(issue)}</b>
                  <span>
                    #{issue.number} · {issue.state === 'closed' && issue.closedAt ? `טופל ב־${day(issue.closedAt)}` : `נפתח ב־${day(issue.createdAt)} בידי ${personName(people, issue.author)}`}
                    {issue.entity ? <> · <bdi>{nameOf(issue.entity.name) || issue.entity.id}</bdi></> : null}
                  </span>
                </span>
                <span className="r">
                  {issue.private && <span className="tag">פרטי</span>}
                  {issue.labels.map((label) => (
                    <span key={label.name} className="tag">
                      {labelName(label.name)}
                    </span>
                  ))}
                  {issue.comments ? <span aria-label={`${issue.comments} תגובות`}>{issue.comments}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {listing?.next && (
        <div className="btns">
          <Button look="outline" small onClick={() => void more()} disabled={busy}>
            {busy ? 'רגע…' : 'עוד דיווחים'}
          </Button>
        </div>
      )}
    </>
  );
}
