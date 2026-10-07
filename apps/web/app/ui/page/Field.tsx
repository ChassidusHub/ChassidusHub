import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '../../lib/i18n.js';
import { tu } from '../../lib/i18nUi.js';
import { useDraft } from '../../lib/useDraft.js';
import { Icon } from '../Icon.js';

/**
 * One of an item's facts (its name, a line about it), the same block in
 * both modes: in Read it is just its words; in Edit it is outlined, a tap
 * opens it in place, and Done puts a `set` change into the page's draft,
 * blue until it is sent. What it was (`before`) goes with the change, so
 * a fix someone made since is never overwritten. Setting it back to what
 * it was takes the change out of the draft.
 */
export function Field({
  editing,
  place,
  item,
  field,
  before,
  name,
  lang,
  dir,
  long,
  className,
  children,
}: {
  editing: boolean;
  /** The page's draft: the permanent id of the item the page is about. */
  place: string;
  /** The item this fact is on (the page's own, or one listed on it). */
  item: string;
  /** Where in its data: `title.he`. */
  field: string;
  before: string | null | undefined;
  /** What it is, for the tray and the empty box: "the Hebrew name". */
  name: string;
  lang: Lang;
  dir?: 'rtl' | 'ltr';
  /** A few lines, not one. */
  long?: boolean;
  className?: string;
  /** How it reads; left out, its words as they are. */
  children?: (value: string) => ReactNode;
}) {
  const { draft, put, remove } = useDraft(place);
  const key = `set:${item}:${field}`;
  const mine = editing ? draft.ops.find((o) => o.key === key) : undefined;
  const value = mine ? String(mine.value ?? '') : (before ?? '');
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(value);
  const box = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  const shown = children ? children(value) : value;
  if (!editing) return <>{shown}</>;

  const done = () => {
    const next = typed.trim();
    setOpen(false);
    if (next === (before ?? '').trim()) return remove(key);
    put({ key, op: 'set', says: `${tu(lang, 'fieldChanged')} ${name}: ${next.length > 40 ? `${next.slice(0, 39)}…` : next || '-'}`, item, field, value: next || null, before: before ?? null });
  };

  if (open) {
    const Box = long ? 'textarea' : 'input';
    return (
      <span className={`is-open fld${className ? ` ${className}` : ''}`}>
        <Box
          ref={box}
          className="fld-input"
          value={typed}
          dir={dir ?? 'auto'}
          aria-label={name}
          rows={long ? 4 : undefined}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            else if (e.key === 'Enter' && (!long || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              done();
            }
          }}
        />
        <span className="fld-actions">
          <button type="button" className="btn sm" onClick={() => setOpen(false)}>
            {tu(lang, 'fieldCancel')}
          </button>
          <button type="button" className="btn sm primary" onClick={done}>
            {tu(lang, 'fieldDone')}
          </button>
        </span>
      </span>
    );
  }
  return (
    <span className={`fld${mine ? ' is-mine' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="fld-show"
        dir={dir}
        aria-label={`${tu(lang, 'fieldChange')} ${name}`}
        onClick={(e) => {
          e.preventDefault();
          setTyped(value);
          setOpen(true);
        }}
      >
        {value ? shown : <span className="fld-empty">{`${tu(lang, 'fieldAdd')} ${name}`}</span>}
        <Icon name="pencil" size={14} className="fld-pen" />
      </button>
      {mine ? (
        <button type="button" className="words-undo" onClick={() => remove(key)}>
          {tu(lang, 'fieldUndo')}
        </button>
      ) : null}
    </span>
  );
}
