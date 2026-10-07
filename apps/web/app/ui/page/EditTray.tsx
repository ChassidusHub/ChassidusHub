import { useState } from 'react';
import { Link } from 'react-router';
import type { Lang } from '../../lib/i18n.js';
import { num, tu } from '../../lib/i18nUi.js';
import { href } from '../../lib/links.js';
import { useDraft } from '../../lib/useDraft.js';
import { Sheet } from '../primitives.js';
import { Tray } from './Tray.js';

/**
 * The tray with sending wired to it: what a page in Edit puts at its foot.
 * Send opens the Send sheet: every change in the draft, one line each with
 * its own Undo, a name for the whole (the first change's words unless you
 * give one) and a note for the reviewers; sending makes them one
 * Suggestion. What came of it (live at once, sent for review, or why it
 * was not sent) shows in the tray's place, and a change that no longer
 * fits is named so the person can undo it.
 */
export function EditTray({ place, lang, onSend }: { place: string; lang: Lang; onSend?: () => void }) {
  const { draft, undo, remove, send } = useDraft(place);
  const [sheet, setSheet] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string; number?: number | null; key?: string } | null>(null);
  const go = async () => {
    setBusy(true);
    setSaid(null);
    const result = await send({ title: title.trim() || undefined, note: note.trim() || undefined });
    setBusy(false);
    if (result.ok) {
      setSheet(false);
      setTitle('');
      setNote('');
      setSaid({ ok: true, text: tu(lang, result.status === 'merged' ? 'traySentLive' : 'traySentOpen'), number: result.number });
    } else setSaid({ ok: false, key: result.key, text: result.status === 401 ? tu(lang, 'traySignIn') : result.status === 409 ? `${tu(lang, 'trayConflict')} (${result.message})` : result.message });
  };
  const result = said ? (
    <p className={said.ok ? 'tray-said is-ok' : 'tray-said is-error'} role={said.ok ? 'status' : 'alert'}>
      {said.text}
      {said.ok && said.number ? (
        <>
          {' '}
          <Link to={href('/review', lang, { s: String(said.number) })}>{tu(lang, 'traySee')}</Link>
        </>
      ) : null}
    </p>
  ) : null;
  return (
    <>
      {sheet ? null : result}
      <Tray
        draft={draft}
        lang={lang}
        onUndo={undo}
        onSend={() => {
          if (onSend) return onSend();
          setSaid(null);
          setSheet(true);
        }}
        busy={busy}
      />
      <Sheet
        open={sheet && draft.ops.length > 0}
        onClose={() => !busy && setSheet(false)}
        title={tu(lang, 'sendTitle')}
        footer={
          <div className="send-foot">
            <button type="button" className="btn" onClick={() => setSheet(false)} disabled={busy}>
              {tu(lang, 'fieldCancel')}
            </button>
            <button type="button" className="btn primary" onClick={() => void go()} disabled={busy} aria-busy={busy || undefined}>
              {tu(lang, busy ? 'traySending' : 'sendNow')}
            </button>
          </div>
        }
      >
        <p className="send-lede">{tu(lang, 'sendLede').replace('{n}', num(draft.ops.length, lang))}</p>
        <ol className="send-list">
          {draft.ops.map((op) => (
            <li key={op.key} className={said?.key === op.key ? 'is-stuck' : undefined}>
              <span dir="auto">{op.says}</span>
              <button type="button" className="words-undo" onClick={() => remove(op.key)} disabled={busy}>
                {tu(lang, 'fieldUndo')}
              </button>
            </li>
          ))}
        </ol>
        <label className="send-field">
          <span>{tu(lang, 'sendName')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} dir="auto" placeholder={draft.ops[0]?.says} />
        </label>
        <label className="send-field">
          <span>{tu(lang, 'sendNote')}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} dir="auto" />
        </label>
        {result}
      </Sheet>
    </>
  );
}
