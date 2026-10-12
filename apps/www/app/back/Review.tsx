import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, Chip, Chips, Icon, SearchField } from '../ui';
import { call } from '../suggestions/api';
import { CHANGE_KINDS, FACT_WORDS, KIND_WORDS, type BatchItem, type BatchList, type BatchPlace, type BatchReview, type ChangeKind } from './batch';

/**
 * A big catalog batch checked on a phone (Flow, issue #318): how many of each
 * kind of change and where things go, then a few samples of each kind, then
 * the whole list a page at a time, searchable, each item before and after in
 * a line. Every mark is said in words, never by colour alone.
 */

/** The summary: the counts, then where things go, from where to where. */
export function Summary({ review }: { review: BatchReview }) {
  const kinds = CHANGE_KINDS.filter((kind) => review.counts[kind]);
  return (
    <div className="br-sum">
      <p className="br-total">{review.items === 1 ? 'פריט אחד' : `${review.items.toLocaleString('he')} פריטים`}</p>
      {kinds.length === 0 ? (
        <p className="faint sm">ההצעה לא משנה דבר מול מה שבספרייה עכשיו.</p>
      ) : (
        <ul className="br-counts">
          {kinds.map((kind) => (
            <li key={kind}>
              <b>{review.counts[kind]!.toLocaleString('he')}</b> {review.counts[kind] === 1 ? KIND_WORDS[kind].one : KIND_WORDS[kind].many}
            </li>
          ))}
        </ul>
      )}
      {review.machine > 0 && (
        <p className="br-machine">
          <span className="machine">{review.machine === 1 ? 'טקסט אחד נקרא במכונה ועוד לא נבדק' : `${review.machine.toLocaleString('he')} טקסטים נקראו במכונה ועוד לא נבדקו`}</span>
        </p>
      )}
      {review.flows.length > 0 && (
        <>
          <h3 className="br-h">לאן הולכים</h3>
          <ul className="br-flows">
            {review.flows.map((flow) => (
              <li key={`${flow.way} ${flow.from?.id ?? ''}>${flow.to?.id ?? ''}`}>
                {flow.way === 'moved' ? (
                  <span className="br-way">
                    <PlaceName place={flow.from} none="בלי מקום" />
                    <Icon name="chevron-left" size="s" label="אל" />
                    <PlaceName place={flow.to} none="בלי מקום" />
                  </span>
                ) : (
                  <span className="br-way">
                    {flow.way === 'merged' ? 'מאוחדים לתוך ' : 'חדשים ב'}
                    <PlaceName place={flow.to} none="—" />
                  </span>
                )}
                <b>{flow.count.toLocaleString('he')}</b>
              </li>
            ))}
          </ul>
          {review.flowsMore > 0 && <p className="faint sm">{`ועוד ${review.flowsMore.toLocaleString('he')} כיוונים קטנים יותר; כולם ברשימה למטה.`}</p>}
        </>
      )}
    </div>
  );
}

/** A few of each kind, before and after: the first, the last and the odd ones. */
export function Samples({ review }: { review: BatchReview }) {
  if (review.samples.length === 0) return null;
  return (
    <div className="br-samples">
      {review.samples.map(({ kind, items }) => (
        <section key={kind} aria-label={KIND_WORDS[kind].many}>
          <h3 className="br-h">
            {KIND_WORDS[kind].many}
            <span className="faint sm">{` · ${items.length.toLocaleString('he')} מתוך ${review.counts[kind]!.toLocaleString('he')}`}</span>
          </h3>
          <ol className="br-rows">
            {items.map((item) => (
              <Line key={item.id} item={item} marks={review.samples.length > 1} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/**
 * The whole list, a page at a time: the first page came with the summary;
 * a kind, words or another page are read in the browser, each a little after
 * the person stops typing.
 */
export function FullList({ id, review }: { id: number; review: BatchReview }) {
  const [kind, setKind] = useState<ChangeKind | null>(null);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<BatchList>(review.list);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      setBusy(true);
      const query = new URLSearchParams({
        offset: String(offset),
        limit: String(review.list.limit),
      });
      if (kind) query.set('kind', kind);
      if (q.trim()) query.set('q', q.trim());
      call<BatchReview>(`${id}/batch?${query}`)
        .then((fresh) => {
          if (!live) return;
          setList(fresh.list);
          setFailed(false);
        })
        .catch(() => live && setFailed(true))
        .finally(() => live && setBusy(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, kind, q, offset, review.list.limit]);

  const turn = (to: number) => {
    setOffset(to);
    top.current?.scrollIntoView({ block: 'start' });
  };
  const kinds = CHANGE_KINDS.filter((k) => review.counts[k]);
  const end = Math.min(list.offset + list.rows.length, list.total);
  return (
    <div className="br-list" ref={top}>
      <SearchField
        size="small"
        label="חיפוש ברשימה"
        value={q}
        onChange={(event) => {
          setQ(event.currentTarget.value);
          setOffset(0);
        }}
      />
      {kinds.length > 1 && (
        <Chips label="איזה סוג שינוי">
          <Chip on={kind === null} onClick={() => (setKind(null), setOffset(0))}>
            {`הכל ${review.items.toLocaleString('he')}`}
          </Chip>
          {kinds.map((k) => (
            <Chip key={k} on={kind === k} onClick={() => (setKind(k), setOffset(0))}>
              {`${KIND_WORDS[k].many} ${review.counts[k]!.toLocaleString('he')}`}
            </Chip>
          ))}
        </Chips>
      )}
      <p className="faint sm br-count" aria-live="polite">
        {failed
          ? 'הרשימה לא נטענה. נסו שוב בעוד רגע.'
          : list.total === 0
            ? 'לא נמצא פריט כזה.'
            : `${(list.offset + 1).toLocaleString('he')}–${end.toLocaleString('he')} מתוך ${list.total.toLocaleString('he')}`}
      </p>
      <ol className={busy ? 'br-rows br-busy' : 'br-rows'} aria-busy={busy}>
        {list.rows.map((item) => (
          <Line key={item.id} item={item} marks={kinds.length > 1} />
        ))}
      </ol>
      {list.total > list.limit && (
        <div className="br-pages">
          <Button look="outline" small icon="chevron-right" disabled={list.offset === 0 || busy} onClick={() => turn(Math.max(0, list.offset - list.limit))}>
            הקודמים
          </Button>
          <Button look="outline" small disabled={end >= list.total || busy} onClick={() => turn(list.offset + list.limit)}>
            הבאים
            <Icon name="chevron-left" size="s" />
          </Button>
        </div>
      )}
    </div>
  );
}

function PlaceName({ place, none }: { place: BatchPlace | null | undefined; none: string }) {
  if (!place) return <span className="faint">{none}</span>;
  return <bdi>{place.path ? <Link to={place.path}>{place.name}</Link> : place.name}</bdi>;
}

/**
 * One item: its name and what kinds of change it has (left out when the whole
 * batch is of one kind, said once above), and under it what happens to it,
 * before and after, in a line.
 */
function Line({ item, marks }: { item: BatchItem; marks: boolean }) {
  const gone = item.kinds.includes('deleted') || item.kinds.includes('merged');
  return (
    <li className={`br-row${gone ? ' br-gone' : ''}`}>
      <div className="br-top">
        <bdi className="br-name">{item.path && !gone ? <Link to={item.path}>{item.name}</Link> : item.name}</bdi>
        {marks &&
          item.kinds.map((kind) => (
            <span key={kind} className="bt-mark">
              {KIND_WORDS[kind].one}
            </span>
          ))}
      </div>
      {item.kinds.includes('moved') && (
        <p className="br-way">
          <PlaceName place={item.from} none="בלי מקום" />
          <Icon name="chevron-left" size="s" label="אל" />
          <PlaceName place={item.to} none="בלי מקום" />
        </p>
      )}
      {item.kinds.includes('new') && (
        <p className="br-way">
          {'נוסף אל '}
          <PlaceName place={item.to} none="בלי מקום" />
        </p>
      )}
      {item.kinds.includes('merged') && (
        <p className="br-way">
          {'מתאחד לתוך '}
          <PlaceName place={item.into} none="—" />
        </p>
      )}
      {item.kinds.includes('deleted') && (
        <p className="br-way">
          {'נמחק מתוך '}
          <PlaceName place={item.from} none="—" />
        </p>
      )}
      {item.was !== undefined && (
        <p className="br-way">
          <span className="br-old">
            <bdi>{item.was}</bdi>
          </span>
          <Icon name="chevron-left" size="s" label="יהיה" />
          <bdi>{item.name}</bdi>
        </p>
      )}
      {item.facts?.map((fact) => (
        <p key={fact.field} className="br-way">
          <span className="faint">{`${FACT_WORDS[fact.field] ?? fact.field}:`}</span>
          <span className="br-old">
            <bdi>{fact.before ?? 'אין'}</bdi>
          </span>
          <Icon name="chevron-left" size="s" label="יהיה" />
          <bdi>{fact.after ?? 'אין'}</bdi>
        </p>
      ))}
      {item.words && (
        <p className="br-words">
          <span className="faint">{`${item.words.added ? 'טקסט חדש' : 'הטקסט משתנה'} · ${item.words.paragraphs === 1 ? 'פסקה אחת' : `${item.words.paragraphs.toLocaleString('he')} פסקאות`}`}</span>
          {item.words.machine && <span className="machine">קריאת מכונה, לא נבדקה</span>}
          {item.words.first ? <q className="br-first">{item.words.first}</q> : <span className="faint">{' · המילים לא מוצגות כאן לפי תנאי המקור'}</span>}
        </p>
      )}
    </li>
  );
}
