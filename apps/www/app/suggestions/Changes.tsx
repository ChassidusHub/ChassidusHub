import { useState } from 'react';
import { Link } from 'react-router';
import { trimmed, type Piece } from '../back/words';
import { Button } from '../ui';
import { Area } from '../ui/Writing';
import type { EntryView, FieldView } from './view';

/** A comment on one field of one item, kept to go with the review (or sent at once). */
export interface FieldComment {
  entity: string;
  field: string;
  body: string;
}

/**
 * One item a Suggestion changes, as a reviewer reads it: what it is (and
 * whether it is new or taken out), each changed field's words compared word
 * by word (only around the change, until the whole is asked for), and any
 * other field before and after. With `onComment`, a comment on it: sent now,
 * or kept to go with the review.
 */
export function EntryCard({ entry, onComment, onKeep }: { entry: EntryView; onComment?: (comment: FieldComment) => Promise<boolean>; onKeep?: (comment: FieldComment) => void }) {
  const [writing, setWriting] = useState(false);
  const [words, setWords] = useState('');
  const field = entry.fields.find((f) => f.kind !== 'more' && 'path' in f) as Exclude<FieldView, { kind: 'more' }> | undefined;
  const comment = { entity: entry.id, field: field?.path ?? '', body: words.trim() };
  return (
    <article className="sg-entry">
      <h3>
        <Link to={`/${entry.id}`}>{entry.label ? <bdi>{entry.label}</bdi> : entry.kind}</Link>
        <span className="faint sm">
          {entry.label ? ` · ${entry.kind}` : ''}
          {entry.isNew ? ' · פריט חדש' : entry.removed ? ' · הפריט יימחק' : ''}
        </span>
      </h3>
      {entry.withheld ? <p className="faint sm">המילים שמורות לפי הזכויות. קוראים אותן באתר.</p> : null}
      {entry.fields.map((f, at) => (
        <Field key={at} field={f} />
      ))}
      {!entry.withheld && !entry.isNew && !entry.removed && entry.fields.length === 0 ? <p className="faint sm">רק פרטים טכניים השתנו (זמנים, סימונים).</p> : null}
      {onComment &&
        (writing ? (
          <div className="sg-compose">
            <Area label="הערה על השינוי הזה" value={words} onChange={(e) => setWords(e.currentTarget.value)} rows={3} />
            <div className="btns">
              <Button
                small
                disabled={!comment.body}
                onClick={async () => {
                  if (await onComment(comment)) (setWords(''), setWriting(false));
                }}
              >
                לשלוח עכשיו
              </Button>
              {onKeep && (
                <Button small look="outline" disabled={!comment.body} onClick={() => (onKeep(comment), setWords(''), setWriting(false))}>
                  לצרף לבדיקה
                </Button>
              )}
              <Button small look="ghost" onClick={() => setWriting(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <div className="btns">
            <Button small look="ghost" icon="pen" onClick={() => setWriting(true)}>
              הערה כאן
            </Button>
          </div>
        ))}
    </article>
  );
}

function Field({ field }: { field: FieldView }) {
  const [whole, setWhole] = useState(false);
  if (field.kind === 'more') return <p className="faint sm">{`ועוד ${field.count} שדות`}</p>;
  if (field.kind === 'fact')
    return (
      <div className="sg-field">
        <span className="faint sm">{field.name}</span>
        <p className="sg-after" dir="auto">
          {field.value}
        </p>
      </div>
    );
  if (field.kind === 'value')
    return (
      <div className="sg-field">
        <span className="faint sm">{field.name}</span>
        <p className="sg-before" dir="auto">
          <del>{field.before}</del>
        </p>
        <p className="sg-after" dir="auto">
          <ins>{field.after}</ins>
        </p>
      </div>
    );
  const shown = whole ? field.pieces : trimmed(field.pieces);
  const cut = shown.some((piece, at) => piece.text !== field.pieces[at]?.text);
  return (
    <div className="sg-field">
      <span className="faint sm">{field.name}</span>
      <Words pieces={shown} />
      {(cut || whole) && (
        <button type="button" className="sg-toggle" onClick={() => setWhole(!whole)} aria-pressed={whole}>
          {whole ? 'רק מה שהשתנה' : 'הפסקה כולה'}
        </button>
      )}
    </div>
  );
}

/** Words compared: what was taken out struck through, what was put in marked. */
export function Words({ pieces }: { pieces: Piece[] }) {
  return (
    <p className="diff torah-face" dir="auto">
      {pieces.map((piece, at) =>
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
