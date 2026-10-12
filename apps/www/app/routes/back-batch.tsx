import { Suspense, useEffect, useState } from 'react';
import { Await, data, Link, useNavigate } from 'react-router';
import { useAccount } from '../lib/account';
import { Button, IconButton, Say, SectionHead, Sheet, TopBar } from '../ui';
import { Area } from '../ui/Writing';
import { countsLine, placeIn, queueOf, SENT_BACK, type BatchReview, type BatchTree, type QueueRow } from '../back/batch';
import { FullList, Samples, Summary } from '../back/Review';
import { Tree } from '../back/Tree';
import { call, failed } from '../suggestions/api';
import { Said } from '../suggestions/Talk';
import { dayOf, personName, suggestionPath, suggestionView, type SuggestionView } from '../suggestions/view';
import type { Route } from './+types/back-batch';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'תור הקטלוג · החדר האחורי · ChassidusHub' }, { name: 'robots', content: 'noindex' }];
}

/**
 * What the page's head shows, read the same for everyone: the batch (its
 * title, who sent it, its research note) and the queue of open batches, for
 * Previous and Next. Each that fails to come is said so; the others still show.
 */
async function batch(api: Route.LoaderArgs['context']['api'], id: number) {
  const [raw, open] = await Promise.all([
    api.getSuggestion({ id, brief: '1', limit: 1 }).catch((error: { status?: number }) => (error?.status === 404 ? 'missing' : null)),
    api.listSuggestions({ state: 'open', limit: 100 }).catch(() => null),
  ]);
  return {
    view: raw === 'missing' || raw === null ? raw : suggestionView(raw as Record<string, unknown>),
    queue: open ? queueOf(open.suggestions as unknown as Record<string, unknown>[]) : [],
  };
}

/** Its tree before and after, folded under the list: where things land among their neighbours. */
async function treeOf(api: Route.LoaderArgs['context']['api'], id: number): Promise<BatchTree | null> {
  return (await api.suggestionTree({ id }).catch(() => null)) as BatchTree | null;
}

/** The batch counted, sampled and its list's first page: a read of its own, so the note shows without waiting for it. */
async function counted(api: Route.LoaderArgs['context']['api'], id: number): Promise<BatchReview | null> {
  return (await api.suggestionBatch({ id, limit: LIST_PAGE }).catch(() => null)) as BatchReview | null;
}

const LIST_PAGE = 30;

/** The frame shows at once; the batch, its tree and the queue come after it, and its counts and list after them or with them. */
export function loader({ params, context }: Route.LoaderArgs) {
  if (!/^\d{1,9}$/.test(params.id)) throw data(null, { status: 404 });
  const id = Number(params.id);
  return {
    id,
    batch: batch(context.api, id),
    review: counted(context.api, id),
    tree: treeOf(context.api, id),
  };
}

/** Opened from inside the site (the queue, Next), the frame is drawn at once. */
export function clientLoader({ params, serverLoader }: Route.ClientLoaderArgs) {
  const loaded = serverLoader();
  return {
    id: Number(params.id),
    batch: loaded.then((l) => l.batch),
    review: loaded.then((l) => l.review),
    tree: loaded.then((l) => l.tree),
  };
}

/** Decided ones change it, and a keeper reads it right after a batch is sent: a few seconds at the edge at most. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=0, s-maxage=10' };
}

type Loaded = Awaited<ReturnType<typeof batch>>;

type Promised = {
  review: Promise<BatchReview | null>;
  tree: Promise<BatchTree | null>;
};

/**
 * One catalog batch in the back room's review queue (Flow, the five-teams
 * plan), made to be checked on a phone however big it is (#318): the Catalog
 * team's research note, then what the batch does in counts and where things
 * go, a few samples of each kind of change, the whole list a page at a time,
 * and its tree before and after. Approve and Send back stay at the foot of
 * the screen all the while, each one tap and a sheet that says again what is
 * being decided. After a decision, Next opens the next batch in the queue.
 * The whole suggestion, field by field and with its conversation, is one
 * link away.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { id, review, tree } = loaderData;
  return (
    <>
      <TopBar title="תור הקטלוג" sub="החדר האחורי" />
      <main id="content" className="view bq">
        <Suspense key={id} fallback={<Frame />}>
          <Await resolve={loaderData.batch} errorElement={<Say tone="bad">ההצעה לא נטענה. נסו שוב בעוד רגע.</Say>}>
            {(loaded) => <Batch id={id} loaded={loaded} promised={{ review, tree }} />}
          </Await>
        </Suspense>
      </main>
    </>
  );
}

/** The outline of what is coming, the same size, so nothing jumps when it comes. */
function Frame() {
  return (
    <div aria-busy="true">
      <p className="bq-place faint sm">תור הקטלוג</p>
      <h1 className="bq-wait">&nbsp;</h1>
      <p className="faint sm">רגע…</p>
      <SectionHead title="הערת המחקר" />
      <div className="bq-wait bq-wait-note" />
      <CountsWait />
    </div>
  );
}

/** Where the counts and samples come, while they are read. */
function CountsWait() {
  return (
    <>
      <SectionHead title="מה ההצעה עושה" />
      <div className="bq-wait bq-wait-sum" />
      <SectionHead title="דוגמאות" />
      <div className="bq-wait bq-wait-tree" />
    </>
  );
}

function Batch({ id, loaded, promised }: { id: number; loaded: Loaded; promised: Promised }) {
  const { view, queue } = loaded;
  if (view === 'missing') return <Say tone="bad">אין הצעה כזאת.</Say>;
  if (view === null) return <Say tone="bad">ההצעה לא נטענה. נסו שוב בעוד רגע.</Say>;
  const place = placeIn(queue, id);
  const full = suggestionPath({ id: view.id, number: view.number });
  const notCounted = <Say tone="bad">הספירה לא נטענה. השינויים עצמם בדף ההצעה.</Say>;
  return (
    <>
      <Place place={place} />
      <h1>
        <bdi>{view.title}</bdi>
        {view.number ? <span className="faint">{` #${view.number}`}</span> : null}
      </h1>
      <p className="faint sm">
        {personName(view.author, view.people)}
        {view.via ? <span className="machine sg-agent">{`נשלחה בידי סוכן: ${view.via.name}`}</span> : null}
        {` · ${dayOf(view.submittedAt ?? view.createdAt)} · `}
        {view.total === 1 ? 'פריט אחד' : `${view.total.toLocaleString('he')} פריטים`}
        {' · '}
        <Link to={full}>כל הפרטים והשיחה</Link>
      </p>
      <SectionHead title="הערת המחקר" />
      <Note text={view.description} />
      <Suspense fallback={<CountsWait />}>
        <Await resolve={promised.review} errorElement={notCounted}>
          {(review) =>
            review ? (
              <>
                <SectionHead title="מה ההצעה עושה" />
                <Summary review={review} />
                {review.samples.length > 0 && <SectionHead title="דוגמאות" />}
                <Samples review={review} />
                <SectionHead title="כל הפריטים" />
                <FullList id={id} review={review} />
              </>
            ) : (
              notCounted
            )
          }
        </Await>
      </Suspense>
      <details className="bq-tree">
        <summary>העץ, לפני ואחרי</summary>
        <Suspense fallback={<p className="faint sm">רגע…</p>}>
          <Await resolve={promised.tree} errorElement={<Say tone="bad">העץ לא נטען.</Say>}>
            {(tree) => (tree ? <Tree tree={tree} more={`${full}?tab=changes`} /> : <Say tone="bad">העץ לא נטען. השינויים עצמם בדף ההצעה.</Say>)}
          </Await>
        </Suspense>
      </details>
      <Decide view={view} next={place.next} full={full} review={promised.review} />
    </>
  );
}

/** Where this batch is in the queue: "2 מתוך 5", and the one before and after. */
function Place({ place }: { place: ReturnType<typeof placeIn> }) {
  const navigate = useNavigate();
  return (
    <div className="bq-place">
      <Link to="/back?tab=catalog" className="faint sm">
        תור הקטלוג
      </Link>
      <span className="faint sm">{place.at >= 0 ? `${(place.at + 1).toLocaleString('he')} מתוך ${place.of.toLocaleString('he')}` : place.of ? 'לא בתור' : 'התור ריק'}</span>
      <span className="bq-step">
        <IconButton small icon="chevron-right" label="הקודמת בתור" disabled={!place.previous} onClick={() => place.previous && navigate(`/back/batch/${place.previous.id}`)} />
        <IconButton small icon="chevron-left" label="הבאה בתור" disabled={!place.next} onClick={() => place.next && navigate(`/back/batch/${place.next.id}`)} />
      </span>
    </div>
  );
}

/** The note, its first lines; the rest one tap away, so the tree is in sight on a phone. */
function Note({ text }: { text: string | null }) {
  const [whole, setWhole] = useState(false);
  if (!text) return <p className="faint">לא נכתבה הערת מחקר. שאלו את מי ששלח לפני שמאשרים.</p>;
  const long = text.length > 600 || text.split('\n').length > 8;
  return (
    <div className={`bq-note${long && !whole ? ' bq-cut' : ''}`}>
      <Said text={text} />
      {long && (
        <button type="button" className="sg-toggle" onClick={() => setWhole(!whole)} aria-expanded={whole}>
          {whole ? 'פחות' : 'להמשיך לקרוא'}
        </button>
      )}
    </div>
  );
}

type Done = { verdict: 'approve' | 'back' } | null;
type Verdict = 'approve' | 'back';

/**
 * Approve or Send back, as the person, at the foot of the screen while the
 * batch is read: one tap opens a sheet that says again what is being decided
 * (the batch's counts), with room for a note, and one more tap decides. Who
 * may decide is the API's to say, read in the browser once the page is here.
 * Sent back without a note, it says it came back from the queue. A batch the
 * person sent themselves (a Catalog agent writes them in its owner's name) is
 * closed with the note instead, since nobody sends their own suggestion back
 * to themselves; its worker sends a new one.
 */
function Decide({ view: first, next, full, review }: { view: SuggestionView; next: QueueRow | null; full: string; review: Promise<BatchReview | null> }) {
  const account = useAccount();
  const navigate = useNavigate();
  const [view, setView] = useState(first);
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [counts, setCounts] = useState<BatchReview | null>(null);
  const id = first.id;
  useEffect(() => {
    setView(first);
    setDone(null);
    setSaid(null);
    setNote('');
    setAsk(null);
  }, [first]);
  useEffect(() => {
    let live = true;
    setCounts(null);
    review.then((r) => live && setCounts(r)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [review]);
  // As the person: whether they may approve it and whether it is their own.
  useEffect(() => {
    if (!account) return;
    let live = true;
    call<Record<string, unknown>>(`${id}?brief=1&limit=1`)
      .then((fresh) => live && setView(suggestionView(fresh)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [account, id]);

  async function decide(verdict: Verdict) {
    setBusy(true);
    setSaid(null);
    const words = note.trim();
    try {
      if (verdict === 'approve')
        await call(`${id}/reviews`, {
          body: { verdict: 'approve', body: words },
        });
      else if (view.mine) {
        await call(`${id}/comments`, { body: { body: words || SENT_BACK } });
        await call(`${id}/withdraw`, { method: 'POST' });
      } else
        await call(`${id}/reviews`, {
          body: { verdict: 'request_changes', body: words || SENT_BACK },
        });
      setAsk(null);
      setDone({ verdict });
    } catch (error) {
      setSaid(failed(error));
    } finally {
      setBusy(false);
    }
  }

  const goNext = next ? (
    <Button icon="chevron-left" onClick={() => navigate(`/back/batch/${next.id}`)}>
      להצעה הבאה
    </Button>
  ) : (
    <Button look="outline" to="/back?tab=catalog">
      חזרה לתור
    </Button>
  );

  let body;
  if (done)
    body = (
      <>
        <Say tone="good">{done.verdict === 'approve' ? 'אישרתם, והשינוי נכנס לספרייה.' : view.mine ? 'ההצעה נסגרה עם ההערה, והסוכן ישלח חדשה.' : 'ההצעה הוחזרה עם ההערה.'}</Say>
        {!next && <p className="faint sm">אין עוד הצעות בתור.</p>}
        <div className="btns">{goNext}</div>
      </>
    );
  else if (view.status !== 'open')
    body = (
      <>
        <p className="faint sm">ההצעה הזאת כבר לא מחכה להחלטה.</p>
        <div className="btns">{goNext}</div>
      </>
    );
  else if (account === undefined) body = <p className="faint sm">רגע…</p>;
  else if (!account)
    body = (
      <p className="sm">
        כדי להחליט צריך <Link to={`/signin?return=${encodeURIComponent(`/back/batch/${id}`)}`}>להיכנס</Link>.
      </p>
    );
  else if (!view.mayApprove)
    body = (
      <p className="faint sm">
        רק שומרי הספר מאשרים או מחזירים. <Link to={full}>להגיב בדף ההצעה</Link>
      </p>
    );
  else
    body = (
      <>
        <div className="bq-btns">
          <Button icon="check" onClick={() => setAsk('approve')}>
            לאשר
          </Button>
          <Button look="outline" onClick={() => setAsk('back')}>
            להחזיר
          </Button>
        </div>
        <Sheet open={ask !== null} title={ask === 'back' ? 'להחזיר את ההצעה?' : 'לאשר את ההצעה?'} onClose={() => !busy && setAsk(null)}>
          <div className="bq-sure">
            <p>
              <bdi>
                <b>{view.title}</b>
              </bdi>
            </p>
            <p>
              {(counts?.items ?? view.total) === 1 ? 'פריט אחד' : `${(counts?.items ?? view.total).toLocaleString('he')} פריטים`}
              {counts ? `: ${countsLine(counts.counts)}` : ''}
            </p>
            {counts && counts.flows.some((flow) => flow.way === 'moved' && flow.from && flow.to) && (
              <p className="faint sm">
                {counts.flows
                  .filter((flow) => flow.way === 'moved' && flow.from && flow.to)
                  .slice(0, 3)
                  .map((flow) => `${flow.from?.name ?? '—'} אל ${flow.to?.name ?? '—'}: ${flow.count.toLocaleString('he')}`)
                  .join(' · ')}
              </p>
            )}
            <p className="faint sm">{ask === 'back' ? (view.mine ? 'ההצעה תיסגר עם ההערה, והסוכן ישלח חדשה.' : 'ההצעה תחזור למי ששלח אותה, עם ההערה.') : 'השינוי ייכנס לספרייה מיד.'}</p>
            <Area label={ask === 'back' ? 'מה לתקן (לא חובה)' : 'הערה (לא חובה)'} value={note} rows={2} onChange={(e) => setNote(e.currentTarget.value)} />
            {said && <Say tone="bad">{said}</Say>}
            {said && (
              <p className="faint sm">
                אם יש התנגשויות, מחליטים עליהן <Link to={full}>בדף ההצעה</Link>.
              </p>
            )}
            <div className="bq-btns">
              <Button icon={ask === 'back' ? undefined : 'check'} disabled={busy} onClick={() => ask && void decide(ask)}>
                {ask === 'back' ? 'כן, להחזיר' : 'כן, לאשר'}
              </Button>
              <Button look="outline" disabled={busy} onClick={() => setAsk(null)}>
                ביטול
              </Button>
            </div>
          </div>
        </Sheet>
      </>
    );
  return (
    <section className="bq-decide" aria-label="ההחלטה">
      {body}
    </section>
  );
}
