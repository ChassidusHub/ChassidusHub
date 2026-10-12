import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Await, Form, Link, useFetcher } from 'react-router';
import { Button, Chips, Row, Rows, SearchField, TopAnswer, TopBar } from '../ui';
import { findNames, loadNames, type NameIndex } from '../search/instant';
import { markWords, placesIn, type Hit, type SearchPage, type WordHit } from '../search/names';
import { searchPage } from '../search/search.server';
import type { Route } from './+types/search';

export const handle = { section: 'search' };

/** What to try, when nothing is typed yet: one of each kind of question the search answers. */
const TRY = ['באתי לגני תשי״א', 'שמיני א', 'י״ט כסלו תשמ״ז', '"ותצא אש"'];

const asked = (request: Request) => new URL(request.url).searchParams.get('q')?.trim().slice(0, 200) ?? '';

/**
 * The page never waits for the search: its frame (the box, what was asked)
 * shows at once, and the answers stream in after it (studio/briefs/www/COMMON.md,
 * "pages load instantly").
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const query = asked(request);
  return { query, page: query ? searchPage(context.api, query) : null };
}

/**
 * A search asked from inside the site is drawn at once, with the names the
 * browser already holds; the server's answers are not waited for.
 */
export function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  const query = asked(request);
  return { query, page: query ? serverLoader().then((data) => data.page) : null };
}

/** A search's answers change only when the catalog does; a minute at the edge keeps a popular one quick. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=60, s-maxage=300' };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.query ? `${data.query} · חיפוש · ChassidusHub` : 'חיפוש · ChassidusHub' }];
}

/** The catalog's names, once the browser has them (search/instant.ts); null until then, or when there is no snapshot. */
function useNames(): NameIndex | null {
  const [names, setNames] = useState<NameIndex | null>(null);
  useEffect(() => {
    let alive = true;
    loadNames().then((index) => alive && setNames(index));
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

/**
 * Search: one box. While typing, the first answers appear under it; Enter
 * (or a suggestion) opens the results: one top answer, then sefarim and
 * maamarim, farbrengens, and the words inside the texts with what matched
 * marked. The box is a plain form, so it works before the script loads.
 */
export default function Search({ loaderData }: Route.ComponentProps) {
  const { query, page } = loaderData;
  const [typed, setTyped] = useState(query);
  const names = useNames();
  // Without the catalog's names, the rows while typing are the server's (GET /search/suggest).
  const suggest = useFetcher<Hit[]>();
  // With them, the names are found here as each letter is typed, and only the words inside the texts are asked of the server.
  const words = useFetcher<typeof clientLoader>();
  const form = useRef<HTMLFormElement>(null);

  // The box is left to the browser (uncontrolled), so words typed before the
  // script has loaded are kept: on a slow phone they would otherwise be
  // wiped when the page comes alive. Here the page picks them up; a new
  // search (an example, Back) starts the box afresh with its own words.
  useEffect(() => {
    const box = form.current?.elements.namedItem('q');
    setTyped(box instanceof HTMLInputElement ? box.value : query);
  }, [query]);
  const q = typed.trim();
  const typing = q.length >= 2 && q !== query;
  // The server is asked a moment after the typing pauses: names without the snapshot, the words inside the texts with it.
  useEffect(() => {
    if (!typing || (names && q.length < 3)) return;
    const wait = setTimeout(() => (names ? words.load(`/search?q=${encodeURIComponent(q)}`) : suggest.load(`/search/suggest?q=${encodeURIComponent(q)}`)), names ? 450 : 180);
    return () => clearTimeout(wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, typing, names]);
  const typedNames = useMemo(() => (names && typing ? findNames(names, q) : null), [names, typing, q]);
  const askedNames = useMemo(() => (names && query ? findNames(names, query) : []), [names, query]);

  return (
    <>
      <TopBar title="חיפוש" />
      <main id="content" className="view">
        <h1 className="sr-only">חיפוש</h1>
        <Form ref={form} method="get" action="/search" role="search" className="search-form">
          <SearchField
            key={query}
            name="q"
            autoFocus={!query}
            label="ד״ה, ספר וחלק, פרשה, תאריך, או מילים במרכאות"
            defaultValue={query}
            onChange={(event) => setTyped(event.currentTarget.value)}
          />
        </Form>
        {typing ? (
          typedNames ? (
            <>
              <Suggestions hits={typedNames} />
              {words.data?.query === q && words.data.page && (
                <Suspense fallback={null}>
                  <Await resolve={words.data.page} errorElement={null}>
                    {(found) => <TypedWords page={found} />}
                  </Await>
                </Suspense>
              )}
            </>
          ) : (
            <Suggestions hits={suggest.data ?? []} />
          )
        ) : page ? (
          <Suspense key={query} fallback={<Waiting names={askedNames} />}>
            <Await resolve={page} errorElement={<p className="faint">החיפוש לא ענה כרגע. נסו שוב בעוד רגע.</p>}>
              {(found) => <Results page={found} />}
            </Await>
          </Suspense>
        ) : (
          <>
            <h2 className="try">
              נסו
            </h2>
            <Chips label="דוגמאות לחיפוש">
              {TRY.map((example) => (
                // Links in a chip's look, so an example works before the script has loaded.
                <Link key={example} className="chip" to={`/search?q=${encodeURIComponent(example)}`}>
                  {example}
                </Link>
              ))}
            </Chips>
          </>
        )}
      </main>
    </>
  );
}

/**
 * While the server searches: the names the browser found at once, then a
 * quiet line where the rest will come, so the page is never empty.
 */
function Waiting({ names }: { names: Hit[] }) {
  return (
    <div aria-busy="true">
      {names.length > 0 && (
        <>
          <h2>ספרים ומאמרים</h2>
          <Rows>
            {names.map((hit) => (
              <Row key={hit.to} title={hit.title} sub={hit.sub} to={hit.to} />
            ))}
          </Rows>
        </>
      )}
      <p className="faint">מחפשים בתוך הטקסטים…</p>
    </div>
  );
}

/** Under the names while typing: the first places in the texts with those words, and a way to all of them. */
function TypedWords({ page }: { page: SearchPage | null }) {
  if (!page || page.failed || page.words.length === 0) return null;
  return (
    <div className="sugg">
      <h2>בתוך הטקסטים</h2>
      <Rows>
        {page.words.slice(0, 3).map((hit, at) => (
          <Row key={`${hit.to}-${at}`} title={<Snippet hit={hit} />} sub={hit.sub} to={hit.to} end={hit.machine ? <span className="machine">במכונה</span> : undefined} />
        ))}
      </Rows>
    </div>
  );
}

function Suggestions({ hits }: { hits: Hit[] }) {
  if (hits.length === 0) return null;
  return (
    <div className="sugg">
      <Rows>
        {hits.map((hit) => (
          <Row key={hit.to} title={hit.title} sub={hit.sub} to={hit.to} />
        ))}
      </Rows>
    </div>
  );
}

function Results({ page }: { page: SearchPage | null }) {
  if (!page || page.failed) return <p className="faint">החיפוש לא ענה כרגע. נסו שוב בעוד רגע.</p>;
  const { top, subjects, works, events, words } = page;
  if (!top && subjects.length + works.length + events.length + words.length === 0)
    return (
      <p className="faint">
        לא נמצא דבר עבור „{page.query}”. נסו מילה אחת פחות, או את שם הספר והחלק (ליקוטי שיחות יב).
      </p>
    );
  return (
    <>
      {page.topic && (
        <p className="faint">
          תוצאות עבור <bdi>{page.topic}</bdi>
        </p>
      )}
      {top && (
        <TopAnswer kind={top.kind} title={top.title} sub={top.sub}>
          {top.listen ? (
            <Button small icon="listen" to={top.listen}>
              שמיעה
            </Button>
          ) : (
            <Button small to={top.to}>
              קריאה
            </Button>
          )}
        </TopAnswer>
      )}
      {subjects.length > 0 && (
        <>
          <h2>במפתח הענינים</h2>
          <Rows>
            {subjects.map((subject) => (
              <Row
                key={subject.to}
                title={subject.topic}
                sub={[placesIn(subject.places, subject.volumes), subject.index].filter(Boolean).join(' · ')}
                to={subject.to}
                end={subject.machine ? <span className="machine">במכונה</span> : undefined}
              />
            ))}
          </Rows>
        </>
      )}
      {works.length > 0 && (
        <>
          <h2>ספרים ומאמרים</h2>
          <Rows>
            {works.map((hit) => (
              <Row key={hit.to} title={hit.title} sub={hit.sub} to={hit.to} />
            ))}
          </Rows>
        </>
      )}
      {events.length > 0 && (
        <>
          <h2>התוועדויות</h2>
          <Rows>
            {events.map((hit) => (
              <Row key={hit.to} title={hit.title} sub={hit.sub} to={hit.to} />
            ))}
          </Rows>
        </>
      )}
      {words.length > 0 && (
        <>
          <h2>בתוך הטקסטים</h2>
          <Rows>
            {words.map((hit, at) => (
              <Row key={`${hit.to}-${at}`} title={<Snippet hit={hit} />} sub={hit.sub} to={hit.to} end={hit.machine ? <span className="machine">במכונה</span> : undefined} />
            ))}
          </Rows>
        </>
      )}
    </>
  );
}

/** The words around a match, the matching ones marked. */
function Snippet({ hit }: { hit: WordHit }) {
  return (
    <bdi className="snip">
      {markWords(hit.snippet, hit.marks).map((run, at) => (run.marked ? <mark key={at}>{run.text}</mark> : run.text))}
    </bdi>
  );
}
