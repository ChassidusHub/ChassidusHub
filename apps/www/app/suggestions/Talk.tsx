import { useState } from 'react';
import { Link } from 'react-router';
import { Area, Button } from '../ui';
import { eventWords, linkParts, momentOf, personName, verdictWords, type EntryView, type People, type TimelineItem } from './view';

type Comment = Extract<TimelineItem, { type: 'comment' }>;

/** Words as people wrote them: lines kept, #numbers and @handles as links. */
export function Said({ text }: { text: string }) {
  return (
    <div className="sg-said" dir="auto">
      {linkParts(text).map((part, at) => ('to' in part ? <Link key={at} to={part.to}>{part.text}</Link> : <span key={at}>{part.text}</span>))}
    </div>
  );
}

/** Who said it, with a word when an agent sent it for them (an agent's work until a person reviews it). */
function Who({ id, people, agent }: { id: string | null; people: People; agent?: boolean }) {
  const handle = id ? people[id]?.username : null;
  return (
    <>
      {handle ? <Link to={`/u/${handle}`}>{personName(id, people)}</Link> : <b>{personName(id, people)}</b>}
      {agent || (id && people[id]?.bot) ? <span className="machine sg-agent">סוכן</span> : null}
    </>
  );
}

/**
 * A Suggestion's conversation, oldest first, as a pull request's is: each
 * comment (with the answers to it under it, and the item it is about), each
 * review and what it decided (with the comments made in it), and what
 * happened in between, in a quiet line. With `reply`, a signed-in person
 * answers a comment where it is.
 */
export function Timeline({ items, people, entries, reply }: { items: TimelineItem[]; people: People; entries: EntryView[]; reply?: (body: string, parent: number) => Promise<boolean> }) {
  const comments = items.filter((i): i is Comment => i.type === 'comment');
  const answers = (id: number) => comments.filter((c) => c.parent === id);
  const ofReview = (id: number) => comments.filter((c) => c.review === id && c.parent === null);
  const about = (anchor: Comment['anchor']) => {
    if (!anchor) return null;
    const entry = entries.find((e) => e.id === anchor.entity);
    return entry ? (entry.label ?? entry.kind) : 'פריט';
  };
  const shown = items.filter((i) => (i.type === 'comment' ? i.parent === null && i.review === null : i.type === 'review' || eventWords(i.kind, i.detail, people) !== null));
  if (shown.length === 0) return <p className="faint">עוד אין כאן תגובות.</p>;
  const one = (c: Comment) => (
    <div key={c.id} className="sg-c">
      <p className="sg-by sm">
        <Who id={c.author} people={people} agent={Boolean(c.via)} />
        <span className="faint">{` · ${momentOf(c.at)}`}</span>
        {c.anchor ? <span className="faint">{` · על ${about(c.anchor)}`}</span> : null}
        {c.resolved ? <span className="faint"> · נפתר</span> : null}
      </p>
      {c.hidden || c.body === null ? <p className="faint sm">התגובה הוסתרה.</p> : <Said text={c.body} />}
      {answers(c.id).length > 0 && <div className="sg-answers">{answers(c.id).map(one)}</div>}
      {reply && c.parent === null && <Reply onSend={(body) => reply(body, c.id)} />}
    </div>
  );
  return (
    <ol className="sg-timeline">
      {shown.map((item) =>
        item.type === 'event' ? (
          <li key={item.id} className="sg-event faint sm">
            {eventWords(item.kind, item.detail, people)}
            {item.actor ? (
              <>
                {' · '}
                <Who id={item.actor} people={people} />
              </>
            ) : null}
            {` · ${momentOf(item.at)}`}
          </li>
        ) : item.type === 'review' ? (
          <li key={`r${item.id}`} className={`sg-item sg-review-${item.verdict}`}>
            <p className="sg-by sm">
              <Who id={item.author} people={people} agent={Boolean(item.via)} />
              <span>{` · ${verdictWords[item.verdict]}`}</span>
              <span className="faint">{` · ${momentOf(item.at)}`}</span>
            </p>
            {item.body ? <Said text={item.body} /> : null}
            {ofReview(item.id).length > 0 && <div className="sg-answers">{ofReview(item.id).map(one)}</div>}
          </li>
        ) : (
          <li key={`c${item.id}`} className="sg-item">
            {one(item)}
          </li>
        ),
      )}
    </ol>
  );
}

function Reply({ onSend }: { onSend: (body: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState('');
  if (!open)
    return (
      <button type="button" className="sg-toggle" onClick={() => setOpen(true)}>
        תשובה
      </button>
    );
  return (
    <div className="sg-compose">
      <Area label="תשובה" value={words} rows={2} onChange={(e) => setWords(e.currentTarget.value)} />
      <div className="btns">
        <Button small disabled={!words.trim()} onClick={async () => (await onSend(words.trim())) && (setWords(''), setOpen(false))}>
          לשלוח
        </Button>
        <Button small look="ghost" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
    </div>
  );
}
