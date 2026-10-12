import { Suspense, useEffect, useState } from 'react';
import { Await, Link, useSearchParams } from 'react-router';
import type { Decided, LiveChange } from './back-item';
import type { Piece } from '../back/words';
import { queueOf, type QueueRow } from '../back/batch';
import { Waiting, type Stage, type WaitingRow } from '../suggestions/Waiting';
import { Button, Row, Rows, Say, SectionHead, Segmented, TopBar } from '../ui';
import type { Route } from './+types/backroom';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'החדר האחורי · ChassidusHub' }];
}

type Name = Record<string, unknown>;
const nameOf = (name: Name | null | undefined, fallback = '') => (typeof name?.he === 'string' && name.he) || (typeof name?.en === 'string' && name.en) || fallback;

interface LiveRow {
  id: number;
  number?: number | null;
  title: string;
  author: string;
  submitted_at?: string | null;
  created_at?: string;
  items?: number;
}
type People = Record<string, { name?: string; username?: string | null; bot?: boolean }>;
type ToCheck = Awaited<ReturnType<Route.LoaderArgs['context']['api']['machineToCheck']>>;

/**
 * Both lists are the same for everyone, so they are read on the server: the
 * live changes waiting to be looked at after (the newest thirty), and what
 * the machines wrote that nobody checked yet. A list that fails to come is
 * said so; the other still shows.
 */
async function lists(api: Route.LoaderArgs['context']['api']) {
  const [live, machine, open, conversations] = await Promise.all([
    api.listSuggestions({ postReview: 'true', limit: 30 }).catch(() => null),
    api.machineToCheck({ limit: 50 }).catch(() => null),
    api.listSuggestions({ status: 'open', limit: 100 }).catch(() => null),
    // The same open ones as conversations, which say what kinds of items each changes: the catalog batches among them.
    api.listSuggestions({ state: 'open', limit: 100 }).catch(() => null),
  ]);
  // What waits for a keeper (the old /review), and where each stands on its way in, read for them all at once.
  const rows: WaitingRow[] = ((open?.suggestions ?? []) as unknown as (LiveRow & { status?: string })[])
    .filter((row) => row.status === 'open')
    .map(({ id, number, title, author, submitted_at, created_at, items }) => ({ id, number: number ?? null, title, author, at: submitted_at ?? created_at ?? null, items: items ?? 0 }));
  const stages = rows.length ? await api.suggestionStages({ ids: rows.map((row) => row.id).join(',') }).then((answer) => answer.stages as Record<string, Stage>).catch(() => ({})) : {};
  return {
    waiting: open ? { rows, people: (open.people ?? {}) as People, stages } : null,
    live: live ? { rows: (live.suggestions as LiveRow[]).map(({ id, number, title, author, submitted_at, created_at, items }) => ({ id, number, title, author, submitted_at, created_at, items })), people: (live.people ?? {}) as People } : null,
    machine,
    catalog: conversations ? { rows: queueOf(conversations.suggestions as unknown as Record<string, unknown>[]), people: (conversations.people ?? {}) as People } : null,
  };
}

/** The page never waits for the lists: its frame shows at once, and they come after it. */
export function loader({ context }: Route.LoaderArgs) {
  return { lists: lists(context.api) };
}

/** Opened from inside the site, the frame is drawn at once; the lists follow. */
export function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  return { lists: serverLoader().then((data) => data.lists) };
}

type Lists = Awaited<ReturnType<typeof lists>>;

/** The titles the API gives the changes it makes itself, in the site's words. */
const TITLES: Record<string, string> = { 'A fix to the words': 'תיקון במילים' };
const titleOf = (title: string) => TITLES[title] ?? title;

const day = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * The back room (thread 6): where people who look after the texts keep or
 * undo the fixes that went live at once, and find what the machines (OCR,
 * transcription) wrote that no person has checked yet. Reading and
 * listening never come here; it is linked from the account sheet.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  // The old /review comes here as ?tab=waiting; the tab chosen stays in the address, so it can be linked.
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: Tab = asked === 'waiting' || asked === 'machine' || asked === 'catalog' ? asked : 'live';
  const setTab = (next: Tab) => setParams(next === 'live' ? {} : { tab: next }, { replace: true, preventScrollReset: true });
  return (
    <>
      <TopBar title="החדר האחורי" />
      <main id="content" className="view">
        <h1>החדר האחורי</h1>
        <p className="lede">כאן בודקים את מה שעלה לאתר בלי לחכות, הצעות שמחכות לשומרי הספר, ואת מה שמכונה כתבה ועוד אף אחד לא בדק.</p>
        <Suspense
          fallback={
            <>
              <Tabs tab={tab} setTab={setTab} />
              <p className="faint" aria-busy="true">
                רגע…
              </p>
            </>
          }
        >
          <Await resolve={loaderData.lists} errorElement={<Say tone="bad">הרשימות לא נטענו. נסו שוב בעוד רגע.</Say>}>
            {({ live, machine, waiting: queue, catalog }) => (
              <>
                <Tabs tab={tab} setTab={setTab} waiting={live?.rows.length} toReview={queue?.rows.length} batches={catalog?.rows.length} />
                {tab === 'live' ? <Live live={live} /> : tab === 'waiting' ? <Waiting waiting={queue} /> : tab === 'catalog' ? <Catalog catalog={catalog} /> : <Machine machine={machine} />}
              </>
            )}
          </Await>
        </Suspense>
      </main>
    </>
  );
}

type Tab = 'waiting' | 'live' | 'catalog' | 'machine';

/** The three lists, each with how many wait in it once the lists have come. */
function Tabs({ tab, setTab, waiting, toReview, batches }: { tab: Tab; setTab: (next: Tab) => void; waiting?: number; toReview?: number; batches?: number }) {
  return (
    <Segmented
      label="מה לבדוק"
      value={tab}
      onChange={setTab}
      options={[
        { value: 'live', label: `עלו לאתר${waiting ? ` (${waiting})` : ''}` },
        { value: 'waiting', label: `לבדיקה${toReview ? ` (${toReview})` : ''}` },
        { value: 'catalog', label: `קטלוג${batches ? ` (${batches})` : ''}` },
        { value: 'machine', label: 'כתב מכונה' },
      ]}
    />
  );
}

function Live({ live }: { live: Lists['live'] }) {
  if (!live) return <Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>;
  if (live.rows.length === 0) return <Say>אין תיקונים שעלו ומחכים לבדיקה.</Say>;
  return (
    <>
      <p className="faint sm">תיקונים קטנים עולים לאתר מיד, אחרי בדיקה אוטומטית. שומרי הספר מסתכלים עליהם אחר כך, ומשאירים או מבטלים.</p>
      {live.rows.map((row) => (
        <LiveCard key={row.id} row={row} who={live.people[row.author]} />
      ))}
    </>
  );
}

/**
 * The catalog queue: batches of changes to the tree, each sent by the
 * Catalog team with its research note, the oldest first. Each opens on its
 * own page, with the tree before and after and Approve or Send back.
 */
function Catalog({ catalog }: { catalog: { rows: QueueRow[]; people: People } | null }) {
  if (!catalog) return <Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>;
  if (catalog.rows.length === 0) return <Say>אין עכשיו שינויים בקטלוג שמחכים להחלטה.</Say>;
  const day = (at: string | null) => (at ? new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long' }).format(new Date(at)) : null);
  return (
    <>
      <p className="faint sm">שינויים בעץ הספרייה: מה זז, מה נכנס, מה מתאחד. כל אחד עם הערת המחקר שלו, הישנים קודם. פותחים, רואים את העץ לפני ואחרי, ומאשרים או מחזירים.</p>
      <Rows>
        {catalog.rows.map((row) => (
          <Row
            key={row.id}
            to={`/back/batch/${row.id}`}
            title={<bdi>{row.title}</bdi>}
            sub={[row.number ? `#${row.number}` : null, catalog.people[row.author]?.name ?? row.author, day(row.at)].filter(Boolean).join(' · ')}
          />
        ))}
      </Rows>
    </>
  );
}

const DECIDE_SAID: Record<Exclude<Decided, { ok: true }>['why'], string> = {
  signin: 'כדי להחליט צריך להיכנס.',
  refused: 'רק שומרי הספר הזה יכולים להחליט עליו.',
  done: 'מישהו כבר החליט על התיקון הזה.',
  down: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.',
};

/** One live change: who made it and when, its words before and after (read when the card is drawn), and Keep or Undo. */
function LiveCard({ row, who }: { row: LiveRow; who?: People[string] }) {
  const [change, setChange] = useState<LiveChange | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<Decided | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/_/back/${row.id}`, { headers: { accept: 'application/json' } })
      .then((r) => r.json() as Promise<LiveChange | { ok: false }>)
      .then((body) => live && setChange(body.ok ? body : 'failed'))
      .catch(() => live && setChange('failed'));
    return () => {
      live = false;
    };
  }, [row.id]);

  async function decide(verdict: 'approve' | 'revert') {
    setBusy(true);
    const answer = await fetch(`/_/back/${row.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verdict }) })
      .then((r) => r.json() as Promise<Decided>)
      .catch((): Decided => ({ ok: false, why: 'down' }));
    setDecided(answer);
    setBusy(false);
  }

  const when = row.submitted_at ?? row.created_at;
  // Pressed only once the words have come and say this person may decide; if they did not come, the API still refuses anyone who may not.
  const mayDecide = !busy && change !== null && (change === 'failed' || change.may);
  const first = change && change !== 'failed' ? change.items[0] : undefined;
  return (
    <article className="panel live" aria-busy={change === null}>
      <h2>
        {first ? <Link to={first.path ?? `/${first.id}`}>{titleOf(row.title)}</Link> : titleOf(row.title)}
        {row.number ? <span className="faint sm"> #{row.number}</span> : null}
      </h2>
      <p className="faint sm">
        {who?.name ?? row.author}
        {when ? ` · ${day.format(new Date(when))}` : ''}
        {row.items && row.items > 1 ? ` · ${row.items} פריטים` : ''}
      </p>
      {change === 'failed' && <p className="faint">לא הצלחנו להראות מה השתנה.</p>}
      {change && change !== 'failed' && change.items.map((item) => item.words.map((words, at) => <Words key={`${item.id}-${at}`} words={words} />))}
      {decided?.ok ? (
        <Say tone="good">{decided.undone ? 'התיקון בוטל, והמילים חזרו למה שהיו.' : 'התיקון נשאר.'}</Say>
      ) : (
        <>
          {decided && !decided.ok && <Say tone="bad">{DECIDE_SAID[decided.why]}</Say>}
          {change && change !== 'failed' && !change.may && !decided && <p className="faint sm">רק שומרי הספר הזה יכולים להשאיר או לבטל.</p>}
          <div className="btns">
            <Button small icon="check" onClick={() => decide('approve')} disabled={!mayDecide}>
              להשאיר
            </Button>
            <Button small look="outline" onClick={() => decide('revert')} disabled={!mayDecide}>
              לבטל
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

/** A field's words, what was taken out struck through and what was put in marked. */
function Words({ words }: { words: LiveChange['items'][number]['words'][number] }) {
  if (words.kind === 'field') return <p className="faint sm">השתנה: <bdi>{words.path}</bdi></p>;
  return (
    <p className="diff torah-face" dir="auto">
      {words.pieces.map((piece: Piece, at) =>
        piece.kind === 'same' ? (
          <span key={at}>{piece.text}</span>
        ) : piece.kind === 'gone' ? (
          <del key={at}>{piece.text}</del>
        ) : (
          <ins key={at}>{piece.text}</ins>
        ),
      )}
    </p>
  );
}

/** What the machines wrote that nobody checked yet, the newest first: each leads to where it is read and fixed. */
function Machine({ machine }: { machine: ToCheck | null }) {
  if (!machine) return <Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>;
  const { transcripts, texts, scans } = machine;
  if (transcripts.length + texts.length + scans.length === 0) return <Say>אין כרגע כתב מכונה שמחכה לבדיקה.</Say>;
  const counted = (checked: number, of: number, what: string) => `${checked.toLocaleString('he')} מתוך ${of.toLocaleString('he')} ${what} נבדקו`;
  return (
    <>
      <p className="faint sm">כל מה שכאן נקרא או נשמע בידי מכונה. קוראים, ומתקנים מה שלא נכון. כל בדיקה מתקנת את האתר ומלמדת את המכונה הבאה.</p>
      {transcripts.length > 0 && (
        <>
          <SectionHead title="תמלולים של הקלטות" />
          <Rows>
            {transcripts.map((t) => (
              <Row key={t.event} title={nameOf(t.title, t.event)} sub={counted(t.checked, t.paragraphs, 'פסקאות')} end={<span className="machine">מכונה</span>} to={t.path ?? `/${t.event}`} />
            ))}
          </Rows>
        </>
      )}
      {texts.length > 0 && (
        <>
          <SectionHead title="דפים שנקראו מסריקה" />
          <Rows>
            {texts.map((t) => (
              <Row key={t.entity} title={nameOf(t.title, nameOf(t.label, t.entity))} sub={t.segments ? counted(t.checked, t.segments, 'שורות') : 'עוד לא נבדק'} end={<span className="machine">מכונה</span>} to={t.path ?? `/${t.entity}`} />
            ))}
          </Rows>
        </>
      )}
      {scans.length > 0 && (
        <>
          <SectionHead title="סריקות שנקראו (OCR)" />
          <Rows>
            {scans.map((s) => (
              <Row key={s.scan} title={nameOf(s.title, s.scan)} sub={counted(s.checked, s.pages, 'עמודים')} end={<span className="machine">מכונה</span>} to={`/${s.publication ?? s.scan}`} />
            ))}
          </Rows>
        </>
      )}
    </>
  );
}
