import { useEffect, useRef, useState } from 'react';
import { Form, Link, useFetcher, useNavigation } from 'react-router';
import { Button, Chips, Row, Rows, SearchField, TopAnswer, TopBar } from '../ui';
import { markWords, type Hit, type SearchPage, type WordHit } from '../search/names';
import { searchPage } from '../search/search.server';
import type { Route } from './+types/search';

export const handle = { section: 'search' };

/** What to try, when nothing is typed yet: one of each kind of question the search answers. */
const TRY = ['באתי לגני תשי״א', 'שמיני א', 'י״ט כסלו תשמ״ז', '"ותצא אש"'];

export async function loader({ request, context }: Route.LoaderArgs): Promise<SearchPage | null> {
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 200) ?? '';
  return query ? searchPage(context.api, query) : null;
}

/** A search's answers change only when the catalog does; a minute at the edge keeps a popular one quick. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=60, s-maxage=300' };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.query} · חיפוש · ChassidusHub` : 'חיפוש · ChassidusHub' }];
}

/**
 * Search: one box. While typing, the first answers appear under it; Enter
 * (or a suggestion) opens the results: one top answer, then sefarim and
 * maamarim, farbrengens, and the words inside the texts with what matched
 * marked. The box is a plain form, so it works before the script loads.
 */
export default function Search({ loaderData: page }: Route.ComponentProps) {
  const [typed, setTyped] = useState(page?.query ?? '');
  const suggest = useFetcher<Hit[]>();
  const navigation = useNavigation();
  const form = useRef<HTMLFormElement>(null);

  // The box is left to the browser (uncontrolled), so words typed before the
  // script has loaded are kept: on a slow phone they would otherwise be
  // wiped when the page comes alive. Here the page picks them up; a new
  // search (an example, Back) starts the box afresh with its own words.
  useEffect(() => {
    const box = form.current?.elements.namedItem('q');
    setTyped(box instanceof HTMLInputElement ? box.value : (page?.query ?? ''));
  }, [page?.query]);
  // Suggestions follow the typing, a moment after it pauses.
  useEffect(() => {
    const q = typed.trim();
    if (q.length < 2 || q === page?.query) return;
    const wait = setTimeout(() => suggest.load(`/search/suggest?q=${encodeURIComponent(q)}`), 180);
    return () => clearTimeout(wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, page?.query]);

  const typing = typed.trim().length >= 2 && typed.trim() !== page?.query;
  const searching = navigation.state === 'loading' && navigation.location.pathname === '/search';

  return (
    <>
      <TopBar title="חיפוש" />
      <main id="content" className="view" aria-busy={searching}>
        <h1 className="sr-only">חיפוש</h1>
        <Form ref={form} method="get" action="/search" role="search" className="search-form">
          <SearchField
            key={page?.query ?? ''}
            name="q"
            autoFocus={!page}
            label="ד״ה, ספר וחלק, פרשה, תאריך, או מילים במרכאות"
            defaultValue={page?.query ?? ''}
            onChange={(event) => setTyped(event.currentTarget.value)}
          />
        </Form>
        {typing ? (
          <Suggestions hits={suggest.data ?? []} />
        ) : page ? (
          <Results page={page} />
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

function Results({ page }: { page: SearchPage }) {
  if (page.failed) return <p className="faint">החיפוש לא ענה כרגע. נסו שוב בעוד רגע.</p>;
  const { top, works, events, words } = page;
  if (!top && works.length + events.length + words.length === 0)
    return (
      <p className="faint">
        לא נמצא דבר עבור „{page.query}”. נסו מילה אחת פחות, או את שם הספר והחלק (ליקוטי שיחות יב).
      </p>
    );
  return (
    <>
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
