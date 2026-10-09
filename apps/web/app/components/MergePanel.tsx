import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Lang } from '../lib/i18n.js';
import { num } from '../lib/i18nUi.js';
import { href } from '../lib/links.js';
import { clashKey, editable, mergeApi, readTyped, resolutionsOf, sideOf, stageSteps, stageWords, type ClashProposal, type MergeCheckView, type MergeClashView, type Resolution } from '../lib/merge.js';
import { fieldName } from './ChangeTable.js';
import { Icon } from '../ui/Icon.js';
import { MachineLabel, RelativeTime, cx } from '../ui/primitives.js';
import '../styles/pages/merge.css';

/**
 * A suggestion's way into the library, and what stands in it, on its
 * review (the suggestion's page, and its card on /review): the stages it
 * passed and the one it is at; what would stop a merge; each field that
 * clashes with what the site changed since, with the site's version and
 * the suggestion's side by side and a choice for each (keep the site's,
 * take the suggestion's, or write it by hand), or for all at once; a
 * machine's proposals for them, labelled as such, for a person to accept;
 * the other suggestions changing the same items, so they are settled in
 * turn; and, for its author, Bring up to date. Each choice is checked
 * against the site at once (the API's merge check, which changes
 * nothing), so Approve is known to go through before it is pressed; and
 * the check is asked again every so often while the page is open, so a
 * merge someone else makes shows here without reloading. With `merge`,
 * the panel has its own Merge button, and says how the merge went as it
 * goes: checking, merging, merged and its commit.
 */

const W = {
  title: { he: 'מיזוג', en: 'Merging' },
  checking: { he: 'בודק מול האתר…', en: 'Checking against the site…' },
  checkedAt: { he: 'נבדק', en: 'Checked' },
  again: { he: 'לבדוק שוב', en: 'Check again' },
  behind: { he: 'פריטים שהשתנו באתר מאז שנכתבה; מתמזגים שדה אחר שדה', en: 'items changed on the site since it was written; they merge field by field' },
  stopTitle: { he: 'מה עוצר את המיזוג', en: 'What stops the merge' },
  dangling: { he: 'פריטים באתר שיצביעו על פריט שנמחק כאן', en: 'Items on the site that would point at an item this deletes' },
  clashTitle: { he: 'התנגשויות: האתר והההצעה שינו אותו שדה', en: 'Clashes: the site and the suggestion changed the same field' },
  clashWhy: {
    he: 'מאז שההצעה נכתבה, השדות האלה השתנו באתר אחרת. בוחרים לכל אחד מה נשאר, או לכולם בבת אחת.',
    en: 'Since this was suggested, these fields changed on the site another way. Choose what stays for each, or for all at once.',
  },
  was: { he: 'היה', en: 'Was' },
  site: { he: 'באתר עכשיו', en: 'On the site now' },
  suggestion: { he: 'בהצעה', en: 'In the suggestion' },
  keepSite: { he: 'להשאיר את מה שבאתר', en: "Keep the site's" },
  takeSuggestion: { he: 'לקחת את ההצעה', en: "Take the suggestion's" },
  own: { he: 'לכתוב בעצמי', en: 'Write it myself' },
  ownBad: { he: 'זה לא באותה צורה כמו השדה (JSON)', en: 'That is not the same kind as the field (JSON)' },
  allSite: { he: 'בכולן: מה שבאתר', en: "All: the site's" },
  allSuggestion: { he: 'בכולן: ההצעה', en: "All: the suggestion's" },
  clear: { he: 'לנקות בחירות', en: 'Clear choices' },
  cut: { he: 'ארוך מדי להצגה מלאה: רואים את תחילתו, ובוחרים צד', en: 'Too long to show whole: its start is shown; choose a side' },
  withheld: { he: 'המילים שמורות לפי הזכויות; קוראים אותן באתר', en: 'Its words are withheld for rights; read them on the site' },
  ai: { he: 'להציע פתרון ב-AI', en: 'Settle with AI' },
  aiWorking: { he: 'ה-AI קורא את ההתנגשויות…', en: 'The AI is reading the clashes…' },
  aiDone: { he: 'הצעות ה-AI מולאו למטה. בודקים ומאשרים: שום דבר לא ממוזג בלי אישור.', en: "The AI's proposals are filled in below. Check them, then approve: nothing merges until a person does." },
  aiLeft: { he: 'עוד התנגשויות; לבקש שוב', en: 'more clashes; ask again' },
  aiNone: { he: 'ל-AI אין הצעה ברורה לאלה; מחליטים בעצמכם.', en: 'The AI had no clear proposal for these; decide them yourself.' },
  aiWhy: { he: 'הצעת ה-AI', en: "The AI's proposal" },
  overlaps: { he: 'הצעות אחרות שמשנות את אותם פריטים', en: 'Other suggestions changing the same items' },
  overlapsWhy: {
    he: 'ממזגים אחת, ואז השנייה מראה רק מה שבאמת מתנגש. כדאי להתחיל בישנה.',
    en: 'Merge one, and the other then shows only what really clashes. Start with the older.',
  },
  shared: { he: 'משותפים', en: 'shared' },
  update: { he: 'לעדכן מול האתר', en: 'Bring up to date' },
  updateWhy: {
    he: 'מכניס לתוך ההצעה את מה שהשתנה באתר מאז (לפי הבחירות כאן), כך שהיא מראה רק את מה שהיא עדיין משנה.',
    en: "Takes the site's later changes into the suggestion (by the choices here), so it shows only what it still changes.",
  },
  updating: { he: 'מעדכן…', en: 'Bringing up to date…' },
  updated: { he: 'עודכנה מול האתר', en: 'Brought up to date' },
  merge: { he: 'למזג', en: 'Merge' },
  mergeChoices: { he: 'למזג לפי הבחירות', en: 'Merge with these choices' },
  merging: { he: 'ממזג…', en: 'Merging…' },
  verifying: { he: 'בודק לפני מיזוג…', en: 'Checking before merging…' },
  merged: { he: 'מוזגה', en: 'Merged' },
  commit: { he: 'שינוי', en: 'commit' },
  live: { he: 'כבר באתר', en: 'live on the site' },
  notYours: { he: 'רק אחראי האוסף מאשרים', en: 'Only the keepers approve' },
  approvals: { he: 'אישורים', en: 'approvals' },
  item: { he: 'פריט', en: 'item' },
  wholeItem: { he: 'הפריט כולו', en: 'The whole item' },
  deleted: { he: '(נמחק)', en: '(deleted)' },
  absent: { he: '(ריק)', en: '(empty)' },
} as const;

const show = (value: unknown, lang: Lang) => (value === undefined ? W.absent[lang] : value === null ? W.deleted[lang] : typeof value === 'string' ? value : JSON.stringify(value, null, 1));

type Phase = 'idle' | 'verifying' | 'merging' | 'merged' | 'updating' | 'ai';

export function MergePanel({
  id,
  lang,
  mine = false,
  steward = false,
  merge = false,
  onChoices,
  onMerged,
  onChanged,
}: {
  /** The suggestion's id. */
  id: number;
  lang: Lang;
  /** The person looking wrote it (they may bring it up to date). */
  mine?: boolean;
  steward?: boolean;
  /** Draw a Merge button of its own (the queue's card); the suggestion's page approves through its review box instead. */
  merge?: boolean;
  /** The choices as Approve takes them, each time they change, for a review box elsewhere to send. */
  onChoices?: (resolutions: Record<string, Record<string, Resolution>>, ready: boolean) => void;
  onMerged?: (commit: number | null) => void;
  /** Something about it changed here (brought up to date): the page reads it again. */
  onChanged?: () => void;
}) {
  const [check, setCheck] = useState<MergeCheckView | null>(null);
  const [choices, setChoices] = useState<Map<string, Resolution>>(new Map());
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [proposals, setProposals] = useState<Map<string, ClashProposal>>(new Map());
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [commit, setCommit] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const asking = useRef(0);

  const resolutions = resolutionsOf(choices);
  const resolutionsKey = JSON.stringify(resolutions);

  // The check, with the choices made so far: the newest answer wins, an older one arriving late is dropped.
  const recheck = useCallback(async () => {
    const ask = ++asking.current;
    try {
      const fresh = await mergeApi.check(id, Object.keys(resolutions).length ? resolutions : undefined);
      if (ask !== asking.current) return;
      setCheck(fresh);
      setError(null);
    } catch (e) {
      if (ask === asking.current) setError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, resolutionsKey]);

  useEffect(() => {
    const t = setTimeout(() => void recheck(), check ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recheck]);

  // While the page is open and it is not settled, asked again now and then: a merge made elsewhere shows without a reload.
  useEffect(() => {
    if (!check || check.stage === 'merged' || check.stage === 'withdrawn') return;
    const every = setInterval(() => {
      if (document.visibilityState === 'visible' && phase === 'idle') void recheck();
    }, 45_000);
    return () => clearInterval(every);
  }, [check, phase, recheck]);

  useEffect(() => {
    onChoices?.(resolutions, Boolean(check?.ready));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolutionsKey, check?.ready]);

  const choose = (clash: MergeClashView, resolution: Resolution | null) =>
    setChoices((m) => {
      const next = new Map(m);
      if (resolution) next.set(clashKey(clash), resolution);
      else next.delete(clashKey(clash));
      return next;
    });
  const chooseAll = (take: 'ours' | 'theirs') => setChoices(new Map((check?.clashes ?? []).map((c) => [clashKey(c), { take }] as const)));

  const askAi = async () => {
    setPhase('ai');
    setError(null);
    setAiNote(null);
    try {
      const answer = await mergeApi.ai(id, resolutions);
      const found = new Map(answer.proposals.map((p) => [clashKey(p), p] as const));
      setProposals((m) => new Map([...m, ...found]));
      setChoices((m) => {
        const next = new Map(m);
        for (const [key, p] of found) next.set(key, p.resolution);
        return next;
      });
      setDrafts((m) => {
        const next = new Map(m);
        for (const [key, p] of found) if ('value' in p.resolution) next.set(key, editable(p.resolution.value));
        return next;
      });
      setAiNote(
        answer.proposals.length === 0
          ? W.aiNone[lang]
          : `${W.aiDone[lang]}${answer.left > 0 ? ` (${num(answer.left, lang)} ${W.aiLeft[lang]})` : ''}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase('idle');
    }
  };

  const bringUpToDate = async () => {
    setPhase('updating');
    setError(null);
    try {
      const done = await mergeApi.update(id, resolutions);
      setChoices(new Map());
      setProposals(new Map());
      setCheck(done.check);
      setSaid(`${W.updated[lang]} · ${num(done.updated, lang)}`);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void recheck();
    } finally {
      setPhase('idle');
    }
  };

  const doMerge = async () => {
    setError(null);
    setPhase('verifying');
    try {
      // Checked once more with these choices, against the site as it is this moment.
      const now = await mergeApi.check(id, resolutions);
      setCheck(now);
      if (!now.ready) return setPhase('idle');
      setPhase('merging');
      const done = await mergeApi.approve(id, resolutions);
      setCommit(done.commit);
      setPhase('merged');
      onMerged?.(done.commit);
      void recheck();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('idle');
      void recheck();
    }
  };

  if (!check) {
    return (
      <section className="mp" aria-busy="true">
        <p className="mp-line subtle">
          <Icon name="loader" className="spin" size={14} /> {error ?? W.checking[lang]}
        </p>
      </section>
    );
  }

  const named = check.named ?? {};
  const nameOf = (entity: string) => named[entity]?.name ?? entity;
  const pageOf = (entity: string) => href(`/${entity}`, lang);
  const steps = stageSteps(check, lang);
  const merged = check.stage === 'merged' || phase === 'merged';
  const open = check.status === 'open';
  const undecided = check.clashes.filter((c) => c.decided === null).length;
  const mayUpdate = (mine || steward) && check.behind > 0 && (check.status === 'open' || check.status === 'sent_back' || check.status === 'draft');
  const busy = phase !== 'idle' && phase !== 'merged';
  const mergedCommit = commit ?? check.merged?.commit ?? null;

  return (
    <section className={cx('mp', `mp-${merged ? 'merged' : check.stage}`)} aria-label={W.title[lang]}>
      <ol className="mp-steps" aria-label={stageWords(merged ? 'merged' : check.stage, lang)}>
        {steps.map((s) => (
          <li key={s.key} className={`mp-step is-${merged ? 'done' : s.state}`}>
            <Icon name={merged || s.state === 'done' ? 'check' : s.state === 'stopped' ? 'x' : s.state === 'now' ? 'dot' : 'minus'} size={12} />
            <span>{s.words}</span>
          </li>
        ))}
      </ol>

      <p className="mp-line" role="status" aria-live="polite">
        <b>
          {phase === 'verifying'
            ? W.verifying[lang]
            : phase === 'merging'
              ? W.merging[lang]
              : phase === 'updating'
                ? W.updating[lang]
                : phase === 'ai'
                  ? W.aiWorking[lang]
                  : stageWords(merged ? 'merged' : check.stage, lang)}
        </b>
        {merged && mergedCommit !== null ? (
          <span className="subtle">
            {' '}
            · {W.commit[lang]} <span className="num">{num(mergedCommit, lang)}</span> · {W.live[lang]}
            {check.merged?.at ? (
              <>
                {' '}
                · <RelativeTime at={check.merged.at} lang={lang} />
              </>
            ) : null}
          </span>
        ) : null}
        {!merged && check.approvals > 0 ? (
          <span className="subtle">
            {' '}
            · <span className="num">{num(check.approvals, lang)}</span> {W.approvals[lang]}
          </span>
        ) : null}
        {said ? <span className="subtle"> · {said}</span> : null}
        <span className="mp-when subtle">
          {W.checkedAt[lang]} <RelativeTime at={check.checkedAt} lang={lang} />
          <button type="button" className="btn ghost sm" onClick={() => void recheck()} disabled={busy}>
            <Icon name="history" size={14} /> {W.again[lang]}
          </button>
        </span>
      </p>

      {!merged && check.behind > 0 ? (
        <p className="mp-note subtle">
          <span className="num">{num(check.behind, lang)}</span> {W.behind[lang]}
        </p>
      ) : null}

      {!merged && (check.blocking.length > 0 || check.problems.length > 0) ? (
        <div className="mp-block">
          <h4>{W.stopTitle[lang]}</h4>
          <ul>
            {check.blocking.map((b, i) => (
              <li key={`b${i}`}>
                <Icon name="x" size={14} /> {b.entityId ? <Link to={pageOf(b.entityId)}>{nameOf(b.entityId)}</Link> : null} {b.message}
              </li>
            ))}
            {check.problems.map((p, i) => (
              <li key={`p${i}`}>
                <Icon name="x" size={14} /> <Link to={pageOf(p.entityId)}>{nameOf(p.entityId)}</Link>: {p.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!merged && check.dangling.length > 0 ? (
        <div className="mp-block warn">
          <h4>{W.dangling[lang]}</h4>
          <ul>
            {check.dangling.slice(0, 20).map((d, i) => (
              <li key={i}>
                <Icon name="link" size={14} /> <Link to={pageOf(d.from)}>{nameOf(d.from)}</Link> → <Link to={pageOf(d.to)}>{nameOf(d.to)}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!merged && check.clashes.length > 0 ? (
        <div className="mp-clashes">
          <h4>
            {W.clashTitle[lang]} <span className="num subtle">({num(check.clashes.length, lang)})</span>
          </h4>
          <p className="subtle">{W.clashWhy[lang]}</p>
          <div className="mp-tools">
            <button type="button" className="btn sm" onClick={() => chooseAll('ours')} disabled={busy}>
              {W.allSite[lang]}
            </button>
            <button type="button" className="btn sm" onClick={() => chooseAll('theirs')} disabled={busy}>
              {W.allSuggestion[lang]}
            </button>
            {(check.mayApprove || mine || steward) && undecided > 0 ? (
              <button type="button" className="btn sm mp-ai" onClick={() => void askAi()} disabled={busy} aria-busy={phase === 'ai' || undefined}>
                <Icon name={phase === 'ai' ? 'loader' : 'sparkle'} size={14} className={phase === 'ai' ? 'spin' : undefined} /> {W.ai[lang]}
              </button>
            ) : null}
            {choices.size ? (
              <button type="button" className="btn ghost sm" onClick={() => (setChoices(new Map()), setProposals(new Map()), setAiNote(null))} disabled={busy}>
                {W.clear[lang]}
              </button>
            ) : null}
          </div>
          {aiNote ? (
            <p className="mp-ai-note">
              <MachineLabel lang={lang} size="sm" /> {aiNote}
            </p>
          ) : null}
          <ol className="mp-list">
            {check.clashes.slice(0, 200).map((clash) => {
              const key = clashKey(clash);
              const side = sideOf(choices.get(key) ?? clash.decided);
              const proposal = proposals.get(key);
              const draft = drafts.get(key) ?? editable(clash.theirs);
              const typed = side === 'own' ? readTyped(draft, clash.theirs ?? clash.ours) : null;
              const group = `clash-${id}-${key}`;
              return (
                <li key={key} className={cx('mp-clash', side ? 'is-decided' : 'is-open')}>
                  <p className="mp-where">
                    <Link to={pageOf(clash.entityId)}>{nameOf(clash.entityId)}</Link>
                    <span className="subtle"> · {clash.path ? fieldName(clash.path, lang) : W.wholeItem[lang]}</span>
                  </p>
                  {clash.withheld ? (
                    <p className="subtle">{W.withheld[lang]}</p>
                  ) : (
                    <div className="mp-sides">
                      <div className="mp-side was">
                        <span className="mp-label">{W.was[lang]}</span>
                        <pre dir="auto">{show(clash.base, lang)}</pre>
                      </div>
                      <div className="mp-side site">
                        <span className="mp-label">{W.site[lang]}</span>
                        <pre dir="auto">{show(clash.ours, lang)}</pre>
                      </div>
                      <div className="mp-side theirs">
                        <span className="mp-label">{W.suggestion[lang]}</span>
                        <pre dir="auto">{show(clash.theirs, lang)}</pre>
                      </div>
                    </div>
                  )}
                  {clash.cut && !clash.withheld ? <p className="subtle small">{W.cut[lang]}</p> : null}
                  <fieldset className="mp-choice" disabled={busy}>
                    <legend className="visually-hidden">{fieldName(clash.path, lang)}</legend>
                    <label>
                      <input type="radio" name={group} checked={side === 'ours'} onChange={() => choose(clash, { take: 'ours' })} /> {W.keepSite[lang]}
                    </label>
                    <label>
                      <input type="radio" name={group} checked={side === 'theirs'} onChange={() => choose(clash, { take: 'theirs' })} /> {W.takeSuggestion[lang]}
                    </label>
                    {!clash.cut && !clash.withheld && clash.path !== '' ? (
                      <label>
                        <input
                          type="radio"
                          name={group}
                          checked={side === 'own'}
                          onChange={() => {
                            const read = readTyped(draft, clash.theirs ?? clash.ours);
                            choose(clash, read.ok ? { value: read.value } : null);
                          }}
                        />{' '}
                        {W.own[lang]}
                      </label>
                    ) : null}
                  </fieldset>
                  {side === 'own' ? (
                    <div className="mp-own">
                      <textarea
                        value={draft}
                        dir="auto"
                        rows={Math.min(8, Math.max(2, draft.split('\n').length))}
                        onChange={(e) => {
                          const text = e.target.value;
                          setDrafts((m) => new Map(m).set(key, text));
                          const read = readTyped(text, clash.theirs ?? clash.ours);
                          if (read.ok) choose(clash, { value: read.value });
                        }}
                      />
                      {typed && !typed.ok ? <p className="mp-bad small">{W.ownBad[lang]}</p> : null}
                    </div>
                  ) : null}
                  {proposal ? (
                    <p className="mp-why small">
                      <MachineLabel lang={lang} size="sm">
                        {W.aiWhy[lang]}
                      </MachineLabel>{' '}
                      {proposal.why}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {!merged && check.overlaps.length > 0 ? (
        <div className="mp-block info">
          <h4>{W.overlaps[lang]}</h4>
          <p className="subtle small">{W.overlapsWhy[lang]}</p>
          <ul>
            {check.overlaps.map((o) => (
              <li key={o.id}>
                <Icon name="suggest" size={14} /> <Link to={o.number ? href(`/suggestions/${o.number}`, lang) : href('/review', lang, { s: String(o.id) })}>{o.title}</Link>
                {o.number ? <span className="num subtle"> #{o.number}</span> : null}
                <span className="subtle">
                  {' '}
                  · <span className="num">{num(o.shared, lang)}</span> {W.shared[lang]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="alert negative" role="alert">
          <Icon name="warn" />
          <span>{error}</span>
        </p>
      ) : null}

      {!merged && (mayUpdate || (merge && open)) ? (
        <div className="mp-actions">
          {merge && open && check.mayApprove ? (
            <button type="button" className="btn approve" onClick={() => void doMerge()} disabled={busy || !check.ready} aria-busy={phase === 'merging' || phase === 'verifying' || undefined}>
              <Icon name={phase === 'merging' || phase === 'verifying' ? 'loader' : 'check'} className={phase === 'merging' || phase === 'verifying' ? 'spin' : undefined} />
              {phase === 'merging' ? W.merging[lang] : phase === 'verifying' ? W.verifying[lang] : check.clashes.length ? W.mergeChoices[lang] : W.merge[lang]}
              {check.items > 1 ? <span className="num"> · {num(check.items, lang)}</span> : null}
            </button>
          ) : null}
          {merge && open && check.mayApprove === false ? (
            <span className="subtle">
              <Icon name="lock" size={14} /> {check.reason ?? W.notYours[lang]}
            </span>
          ) : null}
          {mayUpdate ? (
            <button type="button" className="btn" onClick={() => void bringUpToDate()} disabled={busy || undecided > 0} title={W.updateWhy[lang]} aria-busy={phase === 'updating' || undefined}>
              <Icon name={phase === 'updating' ? 'loader' : 'history'} className={phase === 'updating' ? 'spin' : undefined} /> {phase === 'updating' ? W.updating[lang] : W.update[lang]}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
