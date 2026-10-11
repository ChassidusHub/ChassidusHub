import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Decided, LiveChange } from './back-item';
import type { Piece } from '../back/words';
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
export async function loader({ context }: Route.LoaderArgs) {
  const [live, machine] = await Promise.all([
    context.api.listSuggestions({ postReview: 'true', limit: 30 }).catch(() => null),
    context.api.machineToCheck({ limit: 50 }).catch(() => null),
  ]);
  return {
    live: live ? { rows: (live.suggestions as LiveRow[]).map(({ id, number, title, author, submitted_at, created_at, items }) => ({ id, number, title, author, submitted_at, created_at, items })), people: (live.people ?? {}) as People } : null,
    machine,
  };
}

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
  const { live, machine } = loaderData;
  const [tab, setTab] = useState<'live' | 'machine'>('live');
  const waiting = live?.rows.length ?? 0;
  return (
    <>
      <TopBar title="החדר האחורי" />
      <main id="content" className="view">
        <h1>החדר האחורי</h1>
        <p className="lede">כאן בודקים את מה שעלה לאתר בלי לחכות, ואת מה שמכונה כתבה ועוד אף אחד לא בדק.</p>
        <Segmented
          label="מה לבדוק"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'live', label: `עלו לאתר${waiting ? ` (${waiting})` : ''}` },
            { value: 'machine', label: 'כתב מכונה' },
          ]}
        />
        {tab === 'live' ? <Live live={live} /> : <Machine machine={machine} />}
      </main>
    </>
  );
}

function Live({ live }: { live: Awaited<ReturnType<typeof loader>>['live'] }) {
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
            <Button small icon="check" onClick={() => decide('approve')} disabled={busy || (change !== null && change !== 'failed' && !change.may)}>
              להשאיר
            </Button>
            <Button small look="outline" onClick={() => decide('revert')} disabled={busy || (change !== null && change !== 'failed' && !change.may)}>
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
