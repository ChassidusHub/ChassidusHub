import { useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon, useToast } from '../ui';
import type { EditAnswer, EditAsk } from './types';

/**
 * Edit: the same page, showing only its own fields. A sticky bar says so and
 * ends it; each field is saved as the person leaves it; things the page only
 * links to (the sefer it is in, a recording) are edited on their own pages.
 * Words are fixed as everywhere, by selecting them.
 */
export function EditBar({ done }: { done: string }) {
  return (
    <div className="editbar" role="region" aria-label="עריכה">
      <span>עריכה · רק התוכן של הדף הזה</span>
      <span className="sp" />
      <Link to={done} replace preventScrollReset>
        סיום
      </Link>
    </div>
  );
}

/**
 * Edit is the same page with ?edit: only its own fields. `start` opens it from the corner menu; `done` is the page
 * without it. The fields are drawn inside the tap itself, before the address changes, so the page moves while the
 * person's finger is still the cause (a layout shift after a tap counts against the page only after half a second,
 * and on a slow phone the address took longer).
 */
export function useEditMode(path: string) {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (search.has('edit')) setOpening(false);
  }, [search]);
  const without = new URLSearchParams(search);
  without.delete('edit');
  const start = () => {
    flushSync(() => setOpening(true));
    const next = new URLSearchParams(search);
    next.set('edit', '');
    navigate(`?${next}`, { replace: true, preventScrollReset: true });
  };
  return { editing: search.has('edit') || opening, done: `${path}${without.size ? `?${without}` : ''}`, start };
}

/** The box of a page's own fields, with a line on how saving works. */
export function EditFields({ children }: { children: ReactNode }) {
  return (
    <section className="editfields" aria-label="השדות של הדף">
      {children}
      <p className="faint sm">כל שדה נשמר כשיוצאים ממנו. כדי לתקן מילים, סמנו אותן בטקסט. הזזה או מחיקה ממתינות לעין שנייה.</p>
    </section>
  );
}

const why: Record<Exclude<EditAnswer, { ok: true }>['why'], string> = {
  signin: 'כדי לערוך צריך להיכנס',
  changed: 'הדף השתנה מאז שנפתח. טענו אותו מחדש',
  empty: 'לדף צריך להיות שם',
  refused: 'השינוי לא נשמר',
  down: 'אין כרגע חיבור לאתר. נסו שוב',
};

/** A page's name in one language, saved when the person leaves the box. */
export function NameField({ item, rev, language, label, value: start, onSaved }: { item: string; rev: number; language: 'he' | 'en'; label: string; value: string; onSaved: (rev?: number) => void }) {
  const toast = useToast();
  // The name as the site has it (what a save says it replaces), and the last name sent: one waiting for a second look leaves the site's as it was.
  const [saved, setSaved] = useState(start);
  const [sent, setSent] = useState(start);
  const [value, setValue] = useState(start);
  const [busy, setBusy] = useState(false);
  const id = `f-name-${language}`;

  const save = async () => {
    const typed = value.replace(/\s+/g, ' ').trim();
    if (typed === sent || busy) return;
    setBusy(true);
    const ask: EditAsk = { item, rev, field: 'label', language, before: saved, value: typed };
    const answer = await fetch('/_/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ask) })
      .then((r) => r.json() as Promise<EditAnswer>)
      .catch((): EditAnswer => ({ ok: false, why: 'down' }));
    setBusy(false);
    if (!answer.ok) {
      toast(why[answer.why]);
      return;
    }
    if (answer.live) setSaved(typed);
    setSent(typed);
    setValue(typed);
    onSaved(answer.rev);
    toast(answer.live ? 'נשמר' : 'נשמר. עין שנייה תבדוק לפני שזה עולה');
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        dir={language === 'he' ? 'rtl' : 'ltr'}
        lang={language}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          if (event.key === 'Escape') setValue(sent);
        }}
      />
    </div>
  );
}

/** A page's names, Hebrew and English, each saved as the person leaves it; a saved name moves the page's revision on. */
export function Names({ item, rev: start, names, label = 'שם' }: { item: string; rev: number; names: { he: string; en: string }; label?: string }) {
  const [rev, setRev] = useState(start);
  const saved = (next?: number) => next && setRev(next);
  return (
    <>
      <NameField item={item} rev={rev} language="he" label={label} value={names.he} onSaved={saved} />
      <NameField item={item} rev={rev} language="en" label={`${label} באנגלית`} value={names.en} onSaved={saved} />
    </>
  );
}

/** Something the page links to, edited on its own page. */
export function Linked({ children, to, action }: { children: ReactNode; to?: string; action: string }) {
  return (
    <div className="linked">
      <span className="t">{children}</span>
      {to ? (
        <Link to={to} className="muted sm">
          {action}
          <Icon name="chevron-left" size="s" />
        </Link>
      ) : (
        <span className="faint sm">{action}</span>
      )}
    </div>
  );
}
