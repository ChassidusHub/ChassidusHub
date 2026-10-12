import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Button, Icon, Sheet, useToast } from '../ui';
import { placeAgain, placeOf, type Place } from './place';
import { LIVE_WORDS, wordsDiffering } from './replace';
import type { FixAnswer, FixAsk, UndoAnswer } from './types';

/** How far under the selected words the bar sits on a touch screen: below the selection handles (about 24 px on Android, less on iOS). */
const HANDLES = 34;

/** A fix kept while the person signs in, so their words are there when they come back. */
const KEPT = 'ch_fix';

type Sending = null | 'sending' | Exclude<FixAnswer, { ok: true }>['why'];

/**
 * Selecting words on a page: a small bar over them (Fix, Copy with source,
 * Share), and the fix sheet. Fix opens the selected words in a box; the
 * person types the right ones and saves. A few words go live at once, after
 * the API's AI check, and the toast offers Undo; anything else waits for a
 * reviewer, and the toast says so. Signed out, the sheet asks them to sign in
 * and keeps what they typed for when they come back.
 *
 * `root` is the part of the page whose words may be selected; the words that
 * can be fixed are inside it, in a box saying their item (fix/place.ts).
 */
export function Fixing({
  root,
  path,
  citation,
  url,
  title,
  onLive,
}: {
  root: RefObject<HTMLElement | null>;
  path: string;
  citation: string;
  url: string;
  title: string;
  /**
   * A page whose words React draws (a transcript) shows a live fix itself, and
   * gives back how to take it away again on Undo. Without it, the new words
   * are put in place in the page as it was drawn on the server.
   */
  onLive?: (place: Place, words: string) => () => void;
}) {
  const toast = useToast();
  const [bar, setBar] = useState<{ x: number; y: number; place: Place | null; text: string } | null>(null);
  const [fixing, setFixing] = useState<Place | null>(null);
  const [words, setWords] = useState('');
  const [sending, setSending] = useState<Sending>(null);
  const range = useRef<Range | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // The input holding a phone's keyboard up for a Fix tapped before the page came to life (EARLY_TAPS).
  const holder = useRef<HTMLInputElement | null>(null);

  // The bar follows the selection: shown over words selected inside `root`; on a phone, under them, clear of the
  // phone's own menu (over the words) and of the handles it hangs under their ends for dragging the selection.
  const place = useCallback(() => {
    const selection = getSelection();
    const inside = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!inside || inside.collapsed || !root.current?.contains(inside.commonAncestorContainer)) {
      range.current = null;
      setBar(null);
      return;
    }
    const text = inside.toString().trim();
    if (!text) return setBar(null);
    range.current = inside.cloneRange();
    const rect = inside.getBoundingClientRect();
    const width = pop.current?.offsetWidth || 260;
    const height = pop.current?.offsetHeight || 42;
    const x = Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
    const coarse = matchMedia('(pointer: coarse)').matches;
    const under = coarse || rect.top - height - 10 < 60;
    const y = under ? Math.min(rect.bottom + (coarse ? HANDLES : 10), innerHeight - height - 8) : rect.top - height - 10;
    setBar({ x, y, place: placeOf(inside), text });
  }, [root]);

  useEffect(() => {
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const keys = (event: KeyboardEvent) => {
      // The keyboard's way to the bar: the menu key, or Shift+F10, while words are selected.
      if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && range.current) {
        event.preventDefault();
        pop.current?.querySelector('button')?.focus();
      } else if (event.key === 'Escape') setBar(null);
    };
    document.addEventListener('selectionchange', later);
    addEventListener('scroll', later, { passive: true });
    // Words already selected before the page's scripts came (a long press on a slow phone) get their bar now.
    later();
    addEventListener('resize', later);
    document.addEventListener('keydown', keys);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', later);
      removeEventListener('scroll', later);
      removeEventListener('resize', later);
      document.removeEventListener('keydown', keys);
    };
  }, [place]);

  // The bar's real width is known only once it is drawn: kept inside the window from then on.
  useLayoutEffect(() => {
    const el = pop.current;
    if (!el || !bar) return;
    const width = el.offsetWidth;
    const x = Math.max(8, Math.min(innerWidth - width - 8, bar.x));
    if (x !== bar.x) el.style.left = `${x}px`;
  }, [bar]);

  const show = (at: Place, typed: string) => {
    setFixing(at);
    setWords(typed);
    setSending(null);
    setBar(null);
  };
  const ready = () => {
    box.current?.focus({ preventScroll: true });
    box.current?.select();
  };
  // From the Fix button: drawn at once, so the box takes focus inside the tap itself. A phone (iOS Safari above all)
  // raises its keyboard only for a focus given during a tap, not for one given later, after the sheet has slid up.
  const open = (at: Place, typed: string) => {
    flushSync(() => show(at, typed));
    ready();
  };

  // Back from signing in: the fix they started, with what they typed.
  useEffect(() => {
    let kept: { path: string; ask: FixAsk } | null = null;
    try {
      kept = JSON.parse(sessionStorage.getItem(KEPT) ?? 'null');
      sessionStorage.removeItem(KEPT);
    } catch {
      // Nothing kept, or storage refused: nothing to bring back.
    }
    if (!kept || kept.path !== path) return;
    const { words: typed, ...ask } = kept.ask;
    const again = placeAgain(ask);
    // Not from a tap: no keyboard comes up for it anyway, so the box is made ready once the sheet is drawn.
    if (again) {
      show(again, typed);
      setTimeout(ready);
    }
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Fix tapped on the page's own bar before its scripts came (root.tsx, EARLY_TAPS): the box opens for those words
  // now, and takes the focus from the input that held it, so a phone's keyboard stays up and what was typed is kept.
  useEffect(() => {
    const early = (window as { __earlyFix?: { range: Range | null; input: HTMLInputElement } }).__earlyFix;
    if (!early) return;
    delete (window as { __earlyFix?: unknown }).__earlyFix;
    const at = early.range && root.current?.contains(early.range.commonAncestorContainer) ? placeOf(early.range) : null;
    if (!at) return early.input.remove();
    range.current = early.range;
    holder.current = early.input;
    show(at, early.input.value || at.selected);
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Once the sheet is drawn (its own focus comes first, as a child's): the box takes the focus, and only then does
  // the input let go, so the keyboard never drops between them.
  useEffect(() => {
    if (!fixing || !holder.current) return;
    ready();
    holder.current.remove();
    holder.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixing]);

  const close = useCallback(() => setFixing(null), []);

  // The page's address, whole: a page may give only its path.
  const href = () => new URL(url, location.href).href;

  const copy = async () => {
    const text = bar?.text ?? '';
    setBar(null);
    try {
      await navigator.clipboard.writeText(`${text}\n(${citation})\n${href()}`);
      toast('הועתק עם המקור');
    } catch {
      toast('ההעתקה לא הצליחה בדפדפן הזה');
    }
  };
  const share = async () => {
    const text = bar?.text ?? '';
    setBar(null);
    // The link opens the page at these very words, where the browser can (a text fragment).
    // A dash would be read as the directive's own separator, so it is escaped too.
    const to = text.length <= 120 ? `${href()}#:~:text=${encodeURIComponent(text).replace(/-/g, '%2D')}` : href();
    try {
      if (navigator.share) return await navigator.share({ title, text: `„${text}” (${citation})`, url: to });
      await navigator.clipboard.writeText(to);
      toast('הקישור הועתק');
    } catch {
      // Closing the share sheet is not a failure.
    }
  };

  const save = async () => {
    if (!fixing) return;
    const typed = words.replace(/\s+/g, ' ').trim();
    if (!typed || typed === fixing.selected) return close();
    const { range: where, ...at } = fixing;
    const ask: FixAsk = { ...at, words: typed };
    setSending('sending');
    let answer: FixAnswer;
    try {
      const response = await fetch('/_/fix', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ask) });
      answer = (await response.json()) as FixAnswer;
    } catch {
      answer = { ok: false, why: 'down' };
    }
    if (!answer.ok) {
      if (answer.why === 'signin') {
        try {
          sessionStorage.setItem(KEPT, JSON.stringify({ path, ask }));
        } catch {
          // A private window may refuse: they type it again after signing in.
        }
      }
      return setSending(answer.why);
    }
    close();
    getSelection()?.removeAllRanges();
    if (!answer.live) return toast('נשלח. עין שנייה תבדוק לפני שזה עולה');
    // Live: the new words in place, lightly marked, until the page is next opened.
    let restore: () => void;
    if (onLive) restore = onLive(fixing, typed);
    else {
      const was = where.extractContents();
      const fixed = document.createElement('span');
      fixed.className = 'fixed';
      fixed.textContent = typed;
      where.insertNode(fixed);
      restore = () => fixed.replaceWith(was);
    }
    const changeset = answer.changeset;
    toast('תוקן. תודה', {
      label: 'בטל',
      run: async () => {
        const undone = await fetch(`/_/fix/${changeset}/undo`, { method: 'POST' })
          .then((r) => r.json() as Promise<UndoAnswer>)
          .catch((): UndoAnswer => ({ ok: false, why: 'down' }));
        if (undone.ok) {
          restore();
          toast('בוטל');
        } else toast(undone.why === 'late' ? 'כבר אי אפשר לבטל מכאן; עין שנייה תחליט' : 'הביטול לא הצליח. נסו שוב');
      },
    });
  };

  const changed = fixing ? wordsDiffering(fixing.selected, words) : 0;

  return (
    <>
      {bar &&
        createPortal(
          <div
            ref={pop}
            className="pop"
            role="toolbar"
            aria-label="המילים שסומנו"
            style={{ left: bar.x, top: bar.y }}
            // Pressing a button must not clear the selection it is about.
            onPointerDown={(event) => event.preventDefault()}
          >
            {bar.place && (
              <button type="button" onClick={() => open(bar.place!, bar.place!.selected)}>
                <Icon name="pen" size="s" />
                תקן
              </button>
            )}
            <button type="button" onClick={copy}>
              <Icon name="copy" size="s" />
              העתק עם מקור
            </button>
            <button type="button" onClick={share}>
              <Icon name="share" size="s" />
              שתף
            </button>
          </div>,
          document.body,
        )}

      <Sheet open={!!fixing} title="תיקון" onClose={close}>
        {fixing && (
          <div className="fixbox">
            {/* What is being changed, so the person sees before and after while they type. */}
            <p className="was sm">
              <span className="faint">במקום: </span>
              <q>{fixing.selected}</q>
            </p>
            <label htmlFor="fix-words" className="sm faint">
              המילים הנכונות
            </label>
            <textarea id="fix-words" ref={box} dir="rtl" value={words} onChange={(event) => setWords(event.target.value)} disabled={sending === 'sending'} />
            <FixNote sending={sending} changed={changed} />
            <div className="acts">
              {sending === 'changed' ? (
                <Button onClick={() => location.reload()}>טעינה מחדש</Button>
              ) : sending === 'signin' ? (
                <Button to={`/signin?return=${encodeURIComponent(path)}`}>כניסה</Button>
              ) : (
                <Button onClick={save} disabled={sending === 'sending' || !words.trim() || words.trim() === fixing.selected}>
                  {sending === 'sending' ? 'בודק…' : 'שמירה'}
                </Button>
              )}
              <Button look="ghost" onClick={close}>
                ביטול
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** The line under the box: how a fix goes live, or why this one was not sent. */
function FixNote({ sending, changed }: { sending: Sending; changed: number }) {
  const say: Record<Exclude<Sending, null | 'sending'>, string> = {
    signin: 'כדי לתקן צריך להיכנס. המילים שכתבת נשמרות עד שתחזרו.',
    changed: 'המילים כאן השתנו מאז שהדף נפתח. טענו את הדף מחדש ונסו שוב.',
    'not-words': 'אפשר לתקן כאן רק מילים. סמנו את המילים בלי סימן ההערה.',
    busy: 'הרבה תיקונים בזמן קצר. נסו שוב בעוד מעט.',
    empty: 'כתבו את המילים הנכונות.',
    refused: 'התיקון לא נשלח. נסו שוב.',
    down: 'אין כרגע חיבור לאתר. נסו שוב בעוד רגע.',
  };
  if (sending && sending !== 'sending') {
    return (
      <p className="sm note" role="alert">
        {say[sending]}
      </p>
    );
  }
  return <p className="sm faint note">{changed > LIVE_WORDS ? 'יותר מחמש מילים: עין שנייה תבדוק לפני שזה עולה.' : 'עד כחמש מילים. בדיקה קטנה רצה לפני שהתיקון עולה.'}</p>;
}
