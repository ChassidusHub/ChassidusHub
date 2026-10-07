import { useState } from 'react';
import { Link } from 'react-router';
import type { Lang } from '../../lib/i18n.js';
import { tu } from '../../lib/i18nUi.js';
import { href } from '../../lib/links.js';
import { useDraft } from '../../lib/useDraft.js';
import { Tray } from './Tray.js';

/**
 * The tray with sending wired to it: what a page in Edit puts at its foot.
 * Sending makes the draft one Suggestion; what came of it (live at once,
 * sent for review, or why it was not sent) shows in its place, and a
 * change that no longer fits is named so the person can undo it.
 */
export function EditTray({ place, lang, onSend }: { place: string; lang: Lang; onSend?: () => void }) {
  const { draft, undo, send } = useDraft(place);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string; number?: number | null } | null>(null);
  const go = async () => {
    if (onSend) return onSend();
    setBusy(true);
    setSaid(null);
    const result = await send();
    setBusy(false);
    if (result.ok) setSaid({ ok: true, text: tu(lang, result.status === 'merged' ? 'traySentLive' : 'traySentOpen'), number: result.number });
    else setSaid({ ok: false, text: result.status === 401 ? tu(lang, 'traySignIn') : result.status === 409 ? `${tu(lang, 'trayConflict')} (${result.message})` : result.message });
  };
  return (
    <>
      {said ? (
        <p className={said.ok ? 'tray-said is-ok' : 'tray-said is-error'} role={said.ok ? 'status' : 'alert'}>
          {said.text}
          {said.ok && said.number ? (
            <>
              {' '}
              <Link to={href('/review', lang, { s: String(said.number) })}>{tu(lang, 'traySee')}</Link>
            </>
          ) : null}
        </p>
      ) : null}
      <Tray draft={draft} lang={lang} onUndo={undo} onSend={() => void go()} busy={busy} />
    </>
  );
}
