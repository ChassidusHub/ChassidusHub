import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { ReviewRow } from './ReviewCard.js';
import type { Lang } from '../lib/i18n.js';
import { num } from '../lib/i18nUi.js';
import { href } from '../lib/links.js';
import { mergeApi, stageWords } from '../lib/merge.js';
import { Icon } from '../ui/Icon.js';
import '../styles/pages/merge.css';

/**
 * Merge all on the review queue, for a keeper or steward with many
 * suggestions waiting: oldest first (so a shelf is made before the books
 * moved onto it), each checked against the site as it is that moment and
 * merged only when it would go through as it stands, with no clash to
 * decide and no check failing. The rest are left for a person, each with
 * why. How it goes shows as it goes (merged so far, left, the one being
 * merged now), and every merged row turns merged in the queue at once,
 * without reloading. It can be stopped between two suggestions.
 */

const W = {
  title: { he: 'למזג את כל המוכנות', en: 'Merge all that are ready' },
  why: {
    he: 'מהישנה לחדשה. כל אחת נבדקת מול האתר רגע לפני, וממוזגת רק אם היא עוברת כמו שהיא. מה שצריך החלטה נשאר לכם, עם הסיבה.',
    en: 'Oldest first. Each is checked against the site the moment before, and merged only if it goes through as it is. What needs a decision is left for you, with why.',
  },
  start: { he: 'למזג', en: 'Merge' },
  stop: { he: 'לעצור', en: 'Stop' },
  stopping: { he: 'עוצר אחרי הנוכחית…', en: 'Stopping after this one…' },
  now: { he: 'עכשיו', en: 'Now' },
  merged: { he: 'מוזגו', en: 'Merged' },
  left: { he: 'נשארו להחלטה', en: 'Left for you' },
  failed: { he: 'נכשלו', en: 'Failed' },
  of: { he: 'מתוך', en: 'of' },
  done: { he: 'הסתיים', en: 'Done' },
  notYours: { he: 'לא שלך לאשר', en: 'Not yours to approve' },
  commit: { he: 'שינוי', en: 'commit' },
  waiting: { he: 'ממתינות', en: 'waiting' },
} as const;

interface Outcome {
  id: number;
  number: number | null | undefined;
  title: string;
  outcome: 'merged' | 'skipped' | 'failed';
  why?: string;
  commit?: number | null;
}

export function MergeAll({ rows, lang, onMerged, onFinished }: { rows: ReviewRow[]; lang: Lang; onMerged: (id: number) => void; onFinished: () => void }) {
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [current, setCurrent] = useState<ReviewRow | null>(null);
  const [log, setLog] = useState<Outcome[]>([]);
  const [total, setTotal] = useState(0);
  const stop = useRef(false);
  const open = rows.filter((r) => r.status === 'open' && r.post_review !== 'pending');
  if (!open.length && !log.length) return null;

  const run = async () => {
    const queue = [...open].sort((a, b) => a.id - b.id);
    stop.current = false;
    setStopping(false);
    setRunning(true);
    setLog([]);
    setTotal(queue.length);
    for (const row of queue) {
      if (stop.current) break;
      setCurrent(row);
      const at = { id: row.id, number: row.number, title: row.title };
      try {
        const check = await mergeApi.check(row.id);
        // Merged in the meantime (by someone else, or in another tab): it counts as merged here too.
        if (check.stage === 'merged') {
          setLog((l) => [{ ...at, outcome: 'merged', commit: check.merged?.commit ?? null }, ...l]);
          onMerged(row.id);
          continue;
        }
        if (check.mayApprove === false) {
          setLog((l) => [{ ...at, outcome: 'skipped', why: check.reason ?? W.notYours[lang] }, ...l]);
          continue;
        }
        if (!check.ready) {
          const undecided = check.clashes.filter((c) => c.decided === null).length;
          const why = check.stage === 'clashes' ? `${stageWords('clashes', lang)} (${num(undecided, lang)})` : check.stage === 'blocked' ? [stageWords('blocked', lang), check.blocking[0]?.message ?? check.problems[0]?.message].filter(Boolean).join(': ') : stageWords(check.stage, lang);
          setLog((l) => [{ ...at, outcome: 'skipped', why }, ...l]);
          continue;
        }
        const done = await mergeApi.approve(row.id, {});
        setLog((l) => [{ ...at, outcome: 'merged', commit: done.commit }, ...l]);
        onMerged(row.id);
      } catch (e) {
        setLog((l) => [{ ...at, outcome: 'failed', why: e instanceof Error ? e.message : String(e) }, ...l]);
      }
    }
    setCurrent(null);
    setRunning(false);
    setStopping(false);
    onFinished();
  };

  const merged = log.filter((o) => o.outcome === 'merged').length;
  const skipped = log.filter((o) => o.outcome === 'skipped').length;
  const failed = log.filter((o) => o.outcome === 'failed').length;
  const link = (o: Outcome) => (o.number ? href(`/suggestions/${o.number}`, lang) : href('/review', lang, { s: String(o.id) }));

  return (
    <section className="ma" aria-label={W.title[lang]}>
      <div className="ma-head">
        <b>{W.title[lang]}</b>
        <span className="subtle num">
          ({num(open.length, lang)} {W.waiting[lang]})
        </span>
        {running ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              stop.current = true;
              setStopping(true);
            }}
            disabled={stopping}
          >
            <Icon name="x" size={14} /> {stopping ? W.stopping[lang] : W.stop[lang]}
          </button>
        ) : (
          <button type="button" className="btn approve sm" onClick={() => void run()} disabled={!open.length}>
            <Icon name="check" size={14} /> {W.start[lang]}
          </button>
        )}
      </div>
      {!running && !log.length ? <p className="subtle small">{W.why[lang]}</p> : null}
      {running || log.length ? (
        <>
          <progress max={Math.max(total, 1)} value={log.length} />
          <p className="ma-counts" role="status" aria-live="polite">
            <span>
              <span className="num">{num(log.length, lang)}</span> {W.of[lang]} <span className="num">{num(total, lang)}</span>
            </span>
            <span className="st-approved">
              <Icon name="check" size={12} /> {W.merged[lang]} <span className="num">{num(merged, lang)}</span>
            </span>
            <span className="attention">
              {W.left[lang]} <span className="num">{num(skipped, lang)}</span>
            </span>
            {failed ? (
              <span className="st-closed">
                {W.failed[lang]} <span className="num">{num(failed, lang)}</span>
              </span>
            ) : null}
            {!running ? <b>{W.done[lang]}</b> : null}
          </p>
          {current ? (
            <p className="small">
              <Icon name="loader" className="spin" size={14} /> {W.now[lang]}: <span dir="auto">{current.title}</span>
              {current.number ? <span className="num subtle"> #{current.number}</span> : null}
            </p>
          ) : null}
          <ol className="ma-log">
            {log.map((o) => (
              <li key={o.id} className={o.outcome}>
                <Icon name={o.outcome === 'merged' ? 'check' : o.outcome === 'skipped' ? 'minus' : 'x'} size={12} /> <Link to={link(o)}>{o.title}</Link>
                {o.number ? <span className="num"> #{o.number}</span> : null}
                {o.outcome === 'merged' && o.commit != null ? (
                  <span className="subtle">
                    {' '}
                    · {W.commit[lang]} <span className="num">{num(o.commit, lang)}</span>
                  </span>
                ) : null}
                {o.why ? <span className="subtle"> · {o.why}</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
