import { Check, CircleHelp, History, MessageCircle, Pencil, ShieldQuestion, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { carryWordTimes, markUnclear, spellingHints, unclearRanges } from '@chassidushub/model';
import { t, type Lang } from '../lib/i18n.js';
import { clockOf } from '../lib/i18nNetwork.js';
import { href } from '../lib/links.js';
import { useAccount } from '../lib/useAccount.js';
import { postJson } from '../lib/post.js';
import { get, noteChecked, pendingRanges, tokensOf, trainingPath, within, type Paragraph, type Pending, type Transcript, type TranscriptCommit } from '../lib/transcript.js';
import { wordDiff } from '../lib/wordDiff.js';
import { usePlayer, type Track } from '../player/PlayerProvider.js';
import { InlineDiff } from '../ui/Diff.js';
import { ConfirmSync, DiscussUnclear, discussLabel } from './TimingTools.js';
import { Bar, MachineLabel, RelativeTime } from '../ui/primitives.js';

/**
 * Checking what the machine heard, opened from a farbrengen's or a
 * recording's transcript by "Review machine text". The words are the
 * recording: tapping one plays from it and chooses it, and a tap on another
 * chooses the words up to it (design/system, board 6). The paragraph being
 * worked on has three answers at the foot of the screen, within the
 * thumb's reach however long the paragraph: Right (it is checked, and the
 * next paragraph left to check opens), Fix (the words chosen, or the whole
 * paragraph) and Not sure (the words chosen are kept as `[words?]`); its
 * history and talk over unclear words sit under it. As
 * the recording plays, the page follows the word being said, unless the
 * listener just scrolled away; the player bar offers "hear again" and a
 * slower or faster speed here only. What waits for approval, and what
 * was fixed since the machine heard the words, shows under them on
 * History. The recording pauses while words are being fixed, and this
 * browser remembers where the listener was. A fix of
 * some words is on the site once approved but leaves the paragraph the
 * machine's (`complete: false`, core/sync.ts fixParagraph), so it stays
 * labelled and is no training clip until someone checks all of it. Every
 * change anyone made is in one changelog, and per paragraph.
 */

const W = {
  title: { he: 'בדיקת טקסט המכונה', en: 'Review machine text' },
  back: { he: 'חזרה לתצוגת ההאזנה', en: 'Back to listening' },
  how: { he: 'איך בודקים', en: 'How to review' },
  howTap: { he: 'לחיצה על מילה מנגנת ממנה ובוחרת אותה; לחיצה על מילה נוספת בוחרת עד אליה.', en: 'Tap a word to play from it and choose it; tap another word to choose up to it.' },
  howRight: { he: '„נכון”: שמעתם, וכל המילים נכונות כפי שהמחשב שמע. כך היא נבדקת, מלמדת את המודל הבא, וממשיכים לפסקה הבאה.', en: '"Right": you listened and every word is right as the machine heard it. That checks it, teaches the next model, and moves on to the next paragraph.' },
  howEdit: { he: '„תיקון”: את המילים שבחרתם, או בלי בחירה את כל הפסקה. סמנו אם בדקתם את כולה; אם לא, היא נשארת טקסט מכונה.', en: '"Fix": the words you chose, or with none chosen the whole paragraph. Say whether you checked all of it; if not, it stays machine text.' },
  howUnclear: { he: '„לא בטוח”: על המילים שבחרתם, כשלא ברור מה נאמר. הן נשמרות כך [מילים?], ולא מלמדים מהן את המודל.', en: '"Not sure": on the words you chose, when it is not clear what was said. They are kept as [words?], and the model does not learn from them.' },
  howPause: { he: 'בזמן עריכה ההקלטה נעצרת, וממשיכה מעט לפני כן כשמסיימים.', en: 'The recording pauses while you edit, and goes on from a little before when you finish.' },
  howHistory: { he: '„היסטוריה”: מה תוקן בפסקה מאז שהמחשב שמע אותה, ומה מחכה לאישור, מי ומתי.', en: '"History": what was fixed in the paragraph since the machine heard it, and what waits for approval, by whom and when.' },
  howSpeed: { he: 'בנגן למטה: לשמוע שוב חמש שניות אחורה, ולהאט או להאיץ.', en: 'In the player below: hear the last five seconds again, and slow down or speed up.' },
  progress: { he: '{n} מתוך {of} פסקאות נבדקו', en: '{n} of {of} paragraphs checked' },
  checked: { he: 'נבדק', en: 'Checked' },
  partly: { he: 'תוקן בחלקו', en: 'Partly fixed' },
  allRight: { he: 'נכון', en: 'Right' },
  edit: { he: 'תיקון', en: 'Fix' },
  unclear: { he: 'לא בטוח', en: 'Not sure' },
  markUnclear: { he: 'סימון כלא ברור', en: 'Mark as unclear' },
  fixOne: { he: 'תיקון המילה', en: 'Fix the word' },
  fixMany: { he: 'תיקון {n} המילים', en: 'Fix the {n} words' },
  hintAnswer: { he: 'הקשיבו לפסקה. כל המילים נכונות? „נכון”. מילה שגויה? לחצו עליה.', en: 'Listen to the paragraph. Every word right? "Right". A wrong word? Tap it.' },
  hintOne: { he: 'נבחרה מילה אחת. לחיצה על מילה נוספת בוחרת עד אליה.', en: 'One word chosen. Tap another word to choose up to it.' },
  hintMany: { he: 'נבחרו {n} מילים.', en: '{n} words chosen.' },
  chooseFirst: { he: 'בחרו קודם את המילים שלא ברורות, בלחיצה עליהן.', en: 'First choose the words that are not clear, by tapping them.' },
  markedUnclear: { he: 'סומן כלא ברור.', en: 'Marked as not clear.' },
  continueHere: { he: 'כאן עצרת בפעם הקודמת', en: 'You stopped here last time' },
  history: { he: 'היסטוריה', en: 'History' },
  fixWords: { he: 'תיקון המילים שסומנו', en: 'Fix the selected words' },
  save: { he: 'שמירה', en: 'Save' },
  cancel: { he: 'ביטול', en: 'Cancel' },
  wholeRight: { he: 'שמעתי ובדקתי את כל הפסקה', en: 'I listened and checked the whole paragraph' },
  sent: { he: 'נשלח. יופיע באתר אחרי אישור.', en: 'Sent. It shows on the site once approved.' },
  saved: { he: 'נשמר.', en: 'Saved.' },
  yourFix: { he: 'התיקון שלך, מחכה לאישור', en: 'Your fix, waiting for approval' },
  theirFix: { he: 'תיקון של {name}, מחכה לאישור', en: "{name}'s fix, waiting for approval" },
  waitingTitle: { he: 'מחכים לאישור', en: 'Waiting for approval' },
  reviewAll: { he: 'לעבור על כל התיקונים', en: 'Go through all the fixes' },
  waitingCount: { he: '{n} תיקונים כאן מחכים לאישור, מסומנים בקו מקווקו', en: '{n} fixes here wait for approval, marked with a dashed line' },
  allChanges: { he: 'כל השינויים בתמלול', en: 'Every change to this transcript' },
  noChanges: { he: 'עוד אין שינויים מלבד שמיעת המחשב.', en: 'No changes yet besides what the machine heard.' },
  made: { he: 'המחשב שמע {n} פסקאות', en: 'The machine heard {n} paragraphs' },
  madeOne: { he: 'המחשב שמע את הפסקה', en: 'The machine heard the paragraph' },
  wasChecked: { he: 'סימן/ה שהפסקה נכונה', en: 'marked the paragraph correct' },
  fixedAll: { he: 'תיקן/ה ובדק/ה את כל הפסקה', en: 'fixed and checked the whole paragraph' },
  fixedSome: { he: 'תיקן/ה חלק מהמילים', en: 'fixed some of the words' },
  movedSync: { he: 'הזיז/ה את הסנכרון', en: 'moved the sync' },
  para: { he: 'פסקה', en: 'Paragraph' },
  suggestion: { he: 'הצעה', en: 'Suggestion' },
  fullHistory: { he: 'דף ההיסטוריה המלא', en: 'Full history page' },
  sinceMachine: { he: 'מה שתוקן מאז שהמחשב שמע', en: 'Fixed since the machine heard it' },
  hiddenChecked: { he: '{n} פסקאות שכבר נבדקו מוסתרות', en: '{n} paragraphs already checked are hidden' },
  showChecked: { he: 'להציג את כולן', en: 'Show them all' },
  hideChecked: { he: 'להציג רק מה שנשאר לבדוק', en: 'Show only what is left to check' },
  signIn: { he: 'כדי לתקן צריך להיכנס. ההאזנה והלחיצה על מילים פתוחות לכולם.', en: 'Sign in to fix. Listening and tapping words are open to all.' },
} as const;
const w = (lang: Lang, key: keyof typeof W) => W[key][lang];

/** The house spelling (the booklets'), where the words being written differ from it: a hint, never a change. */
function SpellingHints({ text, lang }: { text: string; lang: Lang }) {
  const hints = spellingHints(text);
  return (
    <p className="note spelling-hints">
      {t(lang, 'houseSpelling')}
      {hints.length ? (
        <>
          {' '}
          {hints.map((h, i) => (
            <span key={h.written} dir="rtl">
              {i ? ', ' : ''}
              {h.written} ← <strong>{h.house}</strong>
            </span>
          ))}
        </>
      ) : null}
    </p>
  );
}

interface Goal {
  model: string;
  hours: { done: number; target: number };
  farbrengens: { done: number; target: number };
  next: Array<{ event: string; path: string | null; title: { he: string; en?: string } | null; date: string | null; paragraphs: number; checked: number; mostWanted: boolean }>;
}

/**
 * What checking teaches: the next transcription model is trained once
 * people have checked enough farbrengens (core/trainingClips.ts), so the
 * goal is shown where they check, with the farbrengens most wanted next.
 */
export function TrainingGoalBar({ lang }: { lang: Lang }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  useEffect(() => {
    let live = true;
    void get<{ goal: Goal }>(trainingPath())
      .then((r) => live && setGoal(r.goal))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!goal) return null;
  const hours = (n: number) => (Math.round(n * 10) / 10).toLocaleString(lang);
  return (
    <div className="training-goal">
      <p className="row-sub">
        {t(lang, 'trainingGoal')
          .replace('{model}', goal.model)
          .replace('{done}', goal.farbrengens.done.toLocaleString(lang))
          .replace('{target}', goal.farbrengens.target.toLocaleString(lang))
          .replace('{hours}', hours(goal.hours.done))
          .replace('{targetHours}', hours(goal.hours.target))}
      </p>
      <progress max={goal.hours.target} value={Math.min(goal.hours.done, goal.hours.target)} />
      {goal.next.length ? (
        <details>
          <summary>{t(lang, 'trainingNext')}</summary>
          <ul>
            {goal.next.map((f) => (
              <li key={f.event}>
                {f.path ? <Link to={href(f.path, lang, { tab: 'text' })}>{f.title?.[lang === 'en' ? 'en' : 'he'] ?? f.title?.he ?? f.event}</Link> : (f.title?.he ?? f.event)}{' '}
                <span className="row-sub">
                  {f.checked.toLocaleString(lang)}/{f.paragraphs.toLocaleString(lang)}
                  {f.mostWanted ? ` · ${t(lang, 'mostWanted')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

type Editing = { kind: 'words'; from: number; to: number; value: string } | { kind: 'all'; value: string; complete: boolean };
type Sent = { content: string; complete: boolean; merged: boolean };

/*
 * Where a listener was, kept in this browser: the paragraph they had open
 * (per recording) and a fix they had not sent yet (per paragraph), so a
 * reload, a lost signal or tomorrow picks up where they stopped. Storage
 * can be missing (private windows): then nothing is remembered.
 */
const PLACE = 'chassidushub.review.place.';
const DRAFT = 'chassidushub.review.draft.';
function recall<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function keep(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; the editor works the same.
  }
}

/** One commit's changes, told in words. */
function ChangeRow({ commit, lang, numberOf, only }: { commit: TranscriptCommit; lang: Lang; numberOf: (segment: string) => number; only?: string }) {
  const changes = only ? commit.changes.filter((c) => c.segment === only) : commit.changes;
  if (!changes.length) return null;
  const made = changes.filter((c) => c.kind === 'made');
  const who = commit.authorIsBot ? null : (commit.authorName ?? commit.author);
  return (
    <li className="tx-change">
      <div className="tx-change-head">
        {who ? <b>{who}</b> : <MachineLabel lang={lang} size="sm" />}
        <RelativeTime at={commit.at} lang={lang} className="row-sub" />
        {commit.suggestion ? (
          <Link className="row-sub" to={href(`/suggestions/${commit.suggestion}`, lang)}>
            {w(lang, 'suggestion')} #{commit.suggestion}
          </Link>
        ) : null}
      </div>
      {made.length ? <p className="row-sub">{made.length === 1 && only ? w(lang, 'madeOne') : w(lang, 'made').replace('{n}', made.length.toLocaleString(lang))}</p> : null}
      {changes
        .filter((c) => c.kind !== 'made')
        .map((c, i) => (
          <div key={i} className="tx-change-item">
            {!only ? (
              <a className="row-sub" href={`#p-${c.segment}`}>
                {w(lang, 'para')} {numberOf(c.segment)}
              </a>
            ) : null}{' '}
            <span className="row-sub">{c.kind === 'checked' ? w(lang, 'wasChecked') : c.kind === 'sync' ? w(lang, 'movedSync') : w(lang, c.complete ? 'fixedAll' : 'fixedSome')}</span>
            {c.kind === 'words' ? (
              <p className="tx-diff" dir="auto">
                <InlineDiff parts={wordDiff(c.before ?? '', c.after ?? '')} />
              </p>
            ) : null}
          </div>
        ))}
    </li>
  );
}

function Para({
  n,
  recording,
  paragraph,
  open,
  active,
  found,
  resumed,
  nowMs,
  playing,
  canFix,
  history,
  lang,
  onOpen,
  onPlayFrom,
  onFixed,
  onRight,
  numberOf,
  waiting,
  me,
  follow,
}: {
  n: number;
  recording: string;
  paragraph: Paragraph;
  open: boolean;
  active: boolean;
  found: boolean;
  /** Where this listener stopped last time. */
  resumed: boolean;
  nowMs: number;
  playing: boolean;
  canFix: boolean;
  history: TranscriptCommit[] | null;
  lang: Lang;
  onOpen: () => void;
  onPlayFrom: (ms: number) => void;
  onFixed: (content: string, complete: boolean, merged: boolean) => void;
  /** After "Right": the next paragraph left to check opens. */
  onRight: () => void;
  numberOf: (segment: string) => number;
  /** Fixes of this paragraph's words that wait for approval, and who is signed in, to tell theirs from others'. */
  waiting: Pending[];
  me: string | null;
  /** Whether the page may follow the word being said now: not while the listener is scrolling on their own. */
  follow: () => boolean;
}) {
  const player = usePlayer();
  const ref = useRef<HTMLLIElement>(null);
  // An unsent fix of this paragraph, from before a reload, opens again as it was left.
  const [editing, setEditingNow] = useState<Editing | null>(() => (typeof window !== 'undefined' ? recall<Editing>(DRAFT + paragraph.id) : null));
  const setEditing = (next: Editing | null) => {
    keep(DRAFT + paragraph.id, next);
    setEditingNow(next);
  };
  const [sent, setSent] = useState<Sent | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [discussing, setDiscussing] = useState<{ from: number; to: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (found) ref.current?.scrollIntoView({ block: 'center' });
  }, [found]);
  // Opened by "Right" on the one before: brought into view if it is out of it.
  useEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (open && r && (r.top < 80 || r.top > window.innerHeight * 0.6)) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [open]);
  // The words chosen by tapping: the first tap one word, a tap on another the words up to it, a tap on the one chosen lets it go.
  const [chosen, setChosen] = useState<{ from: number; to: number; one: boolean } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setChosen(null);
  }, [open]);

  // The recording waits while the words are being fixed, and goes on from a little before, so nothing is missed.
  const resume = useRef(false);
  const isEditing = editing !== null;
  useEffect(() => {
    if (isEditing && playing && player.playing) {
      player.toggle();
      resume.current = true;
    } else if (!isEditing && resume.current) {
      resume.current = false;
      if (playing && !player.playing) {
        player.seek(Math.max(0, player.now() - 2));
        player.toggle();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  async function send(content: string, complete: boolean): Promise<boolean> {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const row = await postJson<{ status?: string }>(`recordings/${recording}/transcript/fix`, { segment: paragraph.id, content, complete });
      const merged = row.status === 'merged';
      setSent({ content, complete, merged });
      setEditing(null);
      setChosen(null);
      noteChecked();
      if (merged) onFixed(content, complete, true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // A tap on a word of the open paragraph chooses it, to fix or mark; it plays from it only when it starts a new choice.
  function tapWord(word: HTMLElement): boolean {
    if (!canFix || !open || editing) return false;
    const from = Number(word.dataset.from);
    const to = Number(word.dataset.to);
    if (Number.isNaN(from)) return false;
    setNote(null);
    if (chosen?.one && chosen.from === from) {
      setChosen(null);
      return true;
    }
    if (chosen?.one) {
      setChosen({ from: Math.min(from, chosen.from), to: Math.max(to, chosen.to), one: false });
      return true;
    }
    setChosen({ from, to, one: true });
    return false;
  }


  const pending = sent && !sent.merged ? sent : null;
  // This listener's own fix that still waits: they go on from it, so it is never typed twice and a new fix never undoes their last.
  const mine = pending ?? [...waiting].reverse().find((x) => x.author === me) ?? null;
  const base = mine?.content ?? paragraph.content;
  // Your waiting fix is shown with the words you left keeping their times, so it lights up word by word too.
  const shown = base === paragraph.content ? paragraph : { ...paragraph, content: base, words: carryWordTimes(paragraph.content, paragraph.words, base) };
  const tokens = tokensOf(shown);
  const marks = unclearRanges(base);
  const chosenCount = chosen ? base.slice(chosen.from, chosen.to).split(/\s+/).filter(Boolean).length : 0;

  // The page follows the word being said: once it nears the foot of the screen (where the tools float) or has gone above, it is brought back to the middle.
  const nowWord = active ? tokens.findIndex((tk, i) => tk.ms !== null && nowMs >= tk.ms && nowMs < (tokens[i + 1]?.ms ?? paragraph.endMs ?? Infinity)) : -1;
  useEffect(() => {
    if (!active || editing || !follow()) return;
    const word = nowWord >= 0 ? ref.current?.querySelector<HTMLElement>('.w-now') : null;
    const el = word ?? ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const out = word ? r.top < 90 || r.bottom > window.innerHeight * 0.6 : r.bottom < 90 || r.top > window.innerHeight * 0.6;
    if (out) el.scrollIntoView({ block: word ? 'center' : 'start', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, editing, nowWord]);
  // Fixes already sent by others, or by this listener before, and not yet approved: their words are shown as they will be, below.
  const others = waiting.filter((x) => x.content !== sent?.content);
  const changing = mine ? pendingRanges(base, paragraph.content) : others.flatMap((x) => pendingRanges(paragraph.content, x.content));
  const text: React.ReactNode[] = [];
  let at = 0;
  for (const [i, tk] of tokens.entries()) {
    if (tk.from > at) text.push(base.slice(at, tk.from));
    const next = tokens[i + 1]?.ms ?? paragraph.endMs ?? Infinity;
    const state = active && tk.ms !== null ? (nowMs >= tk.ms && nowMs < next ? ' w-now' : nowMs >= next ? ' w-past' : '') : '';
    const pick = editing?.kind === 'words' ? editing : chosen;
    const picked = pick && tk.from < pick.to && tk.to > pick.from ? ' w-picked' : '';
    const unclear = marks.some((m) => tk.from < m.to && tk.to > m.from);
    const pendingWord = changing.some((m) => tk.from < m.to && tk.to > m.from);
    const title = [unclear ? t(lang, 'unclearWords') : '', pendingWord ? t(lang, 'pendingFix') : ''].filter(Boolean).join(' · ');
    text.push(
      <span key={i} className={`word${state}${picked}${unclear ? ' w-unclear' : ''}${pendingWord ? ' w-pending' : ''}`} data-ms={tk.ms ?? undefined} data-from={tk.from} data-to={tk.to} title={title || undefined}>
        {base.slice(tk.from, tk.to)}
      </span>,
    );
    at = tk.to;
  }
  if (at < base.length) text.push(base.slice(at));

  // The words as the machine heard them: before the first fix of them (the history is newest first).
  const firstFix = history?.flatMap((c) => c.changes.filter((x) => x.segment === paragraph.id && x.kind === 'words')).at(-1);
  const sinceMachine = firstFix?.before && firstFix.before !== paragraph.content ? firstFix.before : null;

  const status = paragraph.checked ? 'checked' : paragraph.edited ? 'partly' : 'machine';
  const classes = ['tx-para', open ? 'open' : '', active ? 'active' : '', found && !resumed ? 'found' : '', `is-${status}`].filter(Boolean).join(' ');

  return (
    <li ref={ref} id={`p-${paragraph.id}`} className={classes}>
      <div className="tx-para-head">
        <span className="tx-n">{n}</span>
        {paragraph.startMs !== null ? (
          <button type="button" className="tx-time" onClick={() => onPlayFrom(paragraph.startMs ?? 0)}>
            {clockOf(paragraph.startMs)}
          </button>
        ) : null}
        {status === 'checked' ? (
          <span className="tx-state ok">
            <Check size={12} aria-hidden />
            {w(lang, 'checked')}
          </span>
        ) : status === 'partly' ? (
          <span className="tx-state partly">{w(lang, 'partly')}</span>
        ) : null}
      </div>

      <div
        className="tx-text"
        data-para={paragraph.id}
        dir="auto"
        onClick={(e) => {
          const word = (e.target as HTMLElement).closest<HTMLElement>('[data-from]');
          if (word && tapWord(word)) return;
          onOpen();
          const ms = word?.dataset.ms;
          onPlayFrom(ms ? Number(ms) : (paragraph.startMs ?? 0));
        }}
      >
        {text}
      </div>

      {(open && showHistory ? others : []).map((x) => (
        <div key={`${x.suggestion}:${x.at}`} className="tx-pending">
          <span className="row-sub">
            {x.author === me ? w(lang, 'yourFix') : w(lang, 'theirFix').replace('{name}', x.authorName ?? x.author)}
            {x.suggestion !== null ? (
              <>
                {' · '}
                <Link to={href(`/suggestions/${x.suggestion}`, lang)}>#{x.suggestion}</Link>
              </>
            ) : null}
          </span>
          <p className="tx-diff" dir="auto">
            <InlineDiff parts={wordDiff(paragraph.content, x.content)} />
          </p>
        </div>
      ))}

      {open && showHistory && pending ? (
        <div className="tx-pending">
          <span className="row-sub">{w(lang, 'yourFix')}</span>
          <p className="tx-diff" dir="auto">
            <InlineDiff parts={wordDiff(paragraph.content, pending.content)} />
          </p>
        </div>
      ) : null}

      {open && showHistory ? (
        <div className="tx-history">
          {history === null ? (
            <p className="row-sub">…</p>
          ) : (
            <>
              {sinceMachine ? (
                <div className="tx-pending">
                  <span className="row-sub">{w(lang, 'sinceMachine')}</span>
                  <p className="tx-diff" dir="auto">
                    <InlineDiff parts={wordDiff(sinceMachine, paragraph.content)} />
                  </p>
                </div>
              ) : null}
              <ul>
                {history.map((c) => (
                  <ChangeRow key={c.commit} commit={c} lang={lang} numberOf={numberOf} only={paragraph.id} />
                ))}
              </ul>
            </>
          )}
          <Link className="row-sub" to={href(`/history/${paragraph.id}`, lang)}>
            {w(lang, 'fullHistory')}
          </Link>
        </div>
      ) : null}

      {editing?.kind === 'words' ? (
        <div className="tx-edit words">
          <label className="row-sub" htmlFor={`fix-${paragraph.id}`}>
            {w(lang, 'fixWords')}
          </label>
          <input id={`fix-${paragraph.id}`} className="input" dir="auto" autoFocus value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} />
          <SpellingHints text={editing.value} lang={lang} />
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || editing.value === base.slice(editing.from, editing.to)}
              onClick={() => send(`${base.slice(0, editing.from)}${editing.value}${base.slice(editing.to)}`, false)}
            >
              {w(lang, 'save')}
            </button>
            {!/^\[.*\?\]$/.test(editing.value.trim()) ? (
              <button type="button" className="btn" onClick={() => setEditing({ ...editing, value: markUnclear(editing.value.trim()) })}>
                <ShieldQuestion size={15} aria-hidden />
                {w(lang, 'markUnclear')}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              {w(lang, 'cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {editing?.kind === 'all' ? (
        <div className="tx-edit all">
          <textarea value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} rows={6} dir="auto" autoFocus />
          <SpellingHints text={editing.value} lang={lang} />
          <label className="tx-complete">
            <input type="checkbox" checked={editing.complete} onChange={(e) => setEditing({ ...editing, complete: e.target.checked })} />
            {w(lang, 'wholeRight')}
          </label>
          <div className="actions">
            <button type="button" className="btn primary" disabled={busy || !editing.value.trim() || (editing.value.trim() === base && !editing.complete)} onClick={() => send(editing.value, editing.complete)}>
              {w(lang, 'save')}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              {w(lang, 'cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {open && !editing ? (
        <>
          {canFix ? (
            <div className="tx-answers">
              <p className="row-sub tx-hint" role="status">
                {note ?? (chosen ? (chosen.one ? w(lang, 'hintOne') : w(lang, 'hintMany').replace('{n}', chosenCount.toLocaleString(lang))) : w(lang, 'hintAnswer'))}
              </p>
              {chosen ? (
                <div className="tx-answer-row">
                  <button type="button" className="btn primary" onClick={() => setEditing({ kind: 'words', from: chosen.from, to: chosen.to, value: base.slice(chosen.from, chosen.to) })}>
                    <Pencil size={16} aria-hidden />
                    {chosenCount === 1 ? w(lang, 'fixOne') : w(lang, 'fixMany').replace('{n}', chosenCount.toLocaleString(lang))}
                  </button>
                  {!marks.some((m) => chosen.from < m.to && chosen.to > m.from) ? (
                    <button
                      type="button"
                      className="btn unsure"
                      disabled={busy}
                      onClick={async () => {
                        if (await send(`${base.slice(0, chosen.from)}${markUnclear(base.slice(chosen.from, chosen.to))}${base.slice(chosen.to)}`, false)) setNote(w(lang, 'markedUnclear'));
                      }}
                    >
                      <ShieldQuestion size={16} aria-hidden />
                      {w(lang, 'unclear')}
                    </button>
                  ) : null}
                  <button type="button" className="btn" onClick={() => setChosen(null)}>
                    {w(lang, 'cancel')}
                  </button>
                </div>
              ) : (
                <div className="tx-answer-row">
                  {!paragraph.checked && !(pending?.complete && pending.content === base) ? (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={async () => {
                        if (await send(base, true)) onRight();
                      }}
                    >
                      <Check size={16} aria-hidden />
                      {w(lang, 'allRight')}
                    </button>
                  ) : null}
                  <button type="button" className="btn" onClick={() => setEditing({ kind: 'all', value: base, complete: true })}>
                    <Pencil size={16} aria-hidden />
                    {w(lang, 'edit')}
                  </button>
                  <button type="button" className="btn unsure" onClick={() => setNote(w(lang, 'chooseFirst'))}>
                    <ShieldQuestion size={16} aria-hidden />
                    {w(lang, 'unclear')}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          <div className="tx-tools">
            {marks.map((m) => (
              <button key={m.from} type="button" className={discussing?.from === m.from ? 'tx-tool on' : 'tx-tool'} onClick={() => setDiscussing(discussing?.from === m.from ? null : m)}>
                <MessageCircle size={16} aria-hidden />
                {discussLabel[lang]} · <span dir="auto">{base.slice(m.from, m.to)}</span>
              </button>
            ))}
            <button type="button" className={showHistory ? 'tx-tool on' : 'tx-tool'} onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
              <History size={16} aria-hidden />
              {w(lang, 'history')}
            </button>
          </div>
        </>
      ) : null}

      {open && discussing ? (
        <DiscussUnclear
          recording={recording}
          words={base.slice(discussing.from, discussing.to)}
          atMs={tokens.find((tk) => tk.to > discussing.from && tk.ms !== null)?.ms ?? paragraph.startMs}
          lang={lang}
          signedIn={canFix}
          onClose={() => setDiscussing(null)}
        />
      ) : null}

      {sent ? <p className="row-sub tx-sent">{w(lang, sent.merged ? 'saved' : 'sent')}</p> : null}
      {error ? <p role="alert">{error}</p> : null}

    </li>
  );
}

export function TranscriptEditor({
  transcripts,
  tracks,
  lang,
  nowMs,
  found,
  account,
  onBack,
  onFixed,
}: {
  transcripts: Transcript[];
  tracks: Track[];
  lang: Lang;
  nowMs: number;
  found: string | null;
  account: unknown;
  /** Back to the listening view, where there is one; on the page's Text tab its own tabs lead back. */
  onBack?: () => void;
  onFixed: (recording: string, segment: string, content: string, complete: boolean) => void;
}) {
  const player = usePlayer();
  // Where the recording is playing now, else where this listener stopped last time in these recordings, unless a link names a paragraph.
  const placeKey = PLACE + transcripts.map((tr) => tr.recording).join(',');
  const [start] = useState<string | null>(() => {
    if (found) return found;
    const heard = transcripts.find((tr) => tr.recording === player.current?.id)?.paragraphs.find((p) => within(player.time * 1000, p));
    return heard?.id ?? (typeof window !== 'undefined' ? recall<string>(placeKey) : null);
  });

  // "Hear again" and the speed, in the player bar while checking only; the speed goes back to 1 on leaving.
  useEffect(() => {
    player.offerSpeed(true);
    return () => player.offerSpeed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A listener who scrolls on their own is left there for a few seconds before the page follows the recording again.
  const scrolledAt = useRef(0);
  useEffect(() => {
    const mark = () => {
      scrolledAt.current = Date.now();
    };
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
    };
  }, []);
  const follow = () => Date.now() - scrolledAt.current > 5000;
  const [open, setOpenNow] = useState<string | null>(start);
  const setOpen = (segment: string) => {
    keep(placeKey, segment);
    setOpenNow(segment);
  };
  const [history, setHistory] = useState<Record<string, TranscriptCommit[]>>({});
  const [showAll, setShowAll] = useState(false);
  // Paragraphs checked before this visit, with no unclear words, are left out so what is left to check comes first; checked here, they stay until the next visit.
  const [done] = useState(() => new Set(transcripts.flatMap((tr) => tr.paragraphs.filter((p) => p.checked && !unclearRanges(p.content).length && !(tr.pending ?? []).some((x) => x.segment === p.id)).map((p) => p.id))));
  const [showDone, setShowDone] = useState(false);
  const canFix = Boolean(account);
  const me = useAccount()?.person.id ?? null;
  const waitingAll = transcripts.flatMap((tr) => tr.pending ?? []);

  // The changelog of every part, read once, when it is first wanted.
  const wanted = showAll || open !== null;
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    for (const tr of transcripts) {
      if (history[tr.recording]) continue;
      void get<{ history: TranscriptCommit[] }>(`recordings/${tr.recording}/transcript/history`)
        .then((r) => live && setHistory((h) => ({ ...h, [tr.recording]: r.history })))
        .catch(() => live && setHistory((h) => ({ ...h, [tr.recording]: [] })));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, transcripts.map((tr) => tr.recording).join(',')]);

  const all = transcripts.flatMap((tr) => tr.paragraphs);
  const checked = all.filter((p) => p.checked).length;
  const numbers = new Map(all.map((p, i) => [p.id, i + 1]));
  const numberOf = (segment: string) => numbers.get(segment) ?? 0;
  const commits = transcripts.flatMap((tr) => history[tr.recording] ?? []).sort((a, b) => b.commit - a.commit);
  // After "Right", the next paragraph not yet checked opens, so checking goes on without looking for it.
  const nextAfter = (segment: string) => {
    const at = all.findIndex((p) => p.id === segment);
    return [...all.slice(at + 1), ...all.slice(0, at)].find((p) => !p.checked)?.id ?? null;
  };

  return (
    <>
      <div className="review-head">
        <h2 className="section-header">{w(lang, 'title')}</h2>
        {onBack ? (
          <button type="button" className="btn" onClick={onBack}>
            <Undo2 size={16} aria-hidden />
            {w(lang, 'back')}
          </button>
        ) : null}
      </div>

      <div className="tx-top">
        <div className="tx-progress">
          <span className="row-sub">{w(lang, 'progress').replace('{n}', checked.toLocaleString(lang)).replace('{of}', all.length.toLocaleString(lang))}</span>
          <Bar value={checked} max={all.length || 1} tone="open" />
        </div>
        <p className="row-sub tx-machine-line">{t(lang, 'lyricsMachineHint')}</p>
        <details className="tx-how">
          <summary>
            <CircleHelp size={15} aria-hidden />
            {w(lang, 'how')}
          </summary>
          <ul>
            <li>{w(lang, 'howTap')}</li>
            <li>{w(lang, 'howRight')}</li>
            <li>{w(lang, 'howEdit')}</li>
            <li>{w(lang, 'howUnclear')}</li>
            <li>{w(lang, 'howPause')}</li>
            <li>{w(lang, 'howHistory')}</li>
            <li>{w(lang, 'howSpeed')}</li>
          </ul>
          {canFix && checked < all.length ? <TrainingGoalBar lang={lang} /> : null}
        </details>
        {waitingAll.length ? (
          <p className="row-sub tx-waiting-note">
            {w(lang, 'waitingCount').replace('{n}', waitingAll.length.toLocaleString(lang))}
            {' · '}
            <Link to={href('/review', lang, { view: 'transcripts' })}>{w(lang, 'reviewAll')}</Link>
          </p>
        ) : null}
        {!canFix ? (
          <p className="row-sub">
            {w(lang, 'signIn')} <Link to={href('/signin', lang)}>{t(lang, 'signIn')}</Link>
          </p>
        ) : null}
        <details className="tx-all" open={showAll} onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}>
          <summary>
            <History size={15} aria-hidden />
            {w(lang, 'allChanges')}
          </summary>
          {showAll && waitingAll.length ? (
            <div className="tx-waiting">
              <h4 className="row-sub">
                {w(lang, 'waitingTitle')} · {waitingAll.length.toLocaleString(lang)}
                {' · '}
                <Link to={href('/review', lang, { view: 'transcripts' })}>{w(lang, 'reviewAll')}</Link>
              </h4>
              <ul>
                {waitingAll.map((x) => (
                  <li key={`${x.suggestion}:${x.segment}`}>
                    <button type="button" className="tx-waiting-n" onClick={() => setOpen(x.segment)}>
                      ¶{numberOf(x.segment)}
                    </button>{' '}
                    <span className="row-sub">
                      {x.authorName ?? x.author}
                      {x.suggestion !== null ? ` · #${x.suggestion}` : ''}
                    </span>
                    <p className="tx-diff" dir="auto">
                      <InlineDiff parts={wordDiff(all.find((p) => p.id === x.segment)?.content ?? '', x.content)} />
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {showAll ? (
            transcripts.some((tr) => !history[tr.recording]) ? (
              <p className="row-sub">…</p>
            ) : commits.some((c) => c.changes.some((x) => x.kind !== 'made')) ? (
              <ul>
                {commits.map((c) => (
                  <ChangeRow key={c.commit} commit={c} lang={lang} numberOf={numberOf} />
                ))}
              </ul>
            ) : (
              <p className="row-sub">{w(lang, 'noChanges')}</p>
            )
          ) : null}
        </details>
      </div>

      {done.size && done.size < all.length ? (
        <p className="row-sub tx-done-note">
          {showDone ? null : `${w(lang, 'hiddenChecked').replace('{n}', done.size.toLocaleString(lang))} · `}
          <button type="button" className="link-button" onClick={() => setShowDone((s) => !s)}>
            {w(lang, showDone ? 'hideChecked' : 'showChecked')}
          </button>
        </p>
      ) : null}

      {transcripts.map((tr) => {
        const index = tracks.findIndex((track) => track.id === tr.recording);
        const playing = player.current?.id === tr.recording;
        const playFrom = (ms: number) => (playing ? player.seek(ms / 1000) : player.play(tracks, index, ms / 1000));
        return (
          <div key={tr.recording}>
            {transcripts.length > 1 ? <h3>{tracks[index]?.title}</h3> : null}
            <ol className="tx-list">
              {tr.paragraphs.filter((p) => showDone || done.size === all.length || !done.has(p.id) || p.id === found).map((p) => (
                <Para
                  key={p.id}
                  n={numberOf(p.id)}
                  recording={tr.recording}
                  paragraph={p}
                  open={open === p.id}
                  active={playing && within(nowMs, p)}
                  found={p.id === start}
                  resumed={p.id === start && !found}
                  nowMs={nowMs}
                  playing={playing}
                  canFix={canFix}
                  history={history[tr.recording] ?? null}
                  lang={lang}
                  onOpen={() => setOpen(p.id)}
                  onPlayFrom={(ms) => {
                    playFrom(ms);
                    if (playing && !player.playing) player.toggle();
                  }}
                  onFixed={(content, complete) => onFixed(tr.recording, p.id, content, complete)}
                  onRight={() => {
                    const next = nextAfter(p.id);
                    if (next) setOpen(next);
                  }}
                  numberOf={numberOf}
                  waiting={(tr.pending ?? []).filter((x) => x.segment === p.id)}
                  me={me}
                  follow={follow}
                />
              ))}
            </ol>
            {canFix && tr.paragraphs.some((p) => p.syncChecked === false) ? <ConfirmSync recording={tr.recording} lang={lang} /> : null}
          </div>
        );
      })}

    </>
  );
}
