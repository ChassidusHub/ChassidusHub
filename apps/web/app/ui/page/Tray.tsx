import type { Lang } from '../../lib/i18n.js';
import { num, tu } from '../../lib/i18nUi.js';
import type { Draft } from '../../lib/draft.js';
import { Icon } from '../Icon.js';

/**
 * Your changes, not sent yet: a dark bar at the foot of a page in Edit,
 * with how many things you changed, the last one undone in a tap, and Send.
 * It is drawn only when there is something in it.
 */
export function Tray({ draft, lang, onUndo, onSend }: { draft: Draft; lang: Lang; onUndo: () => void; onSend: () => void }) {
  const count = draft.ops.length;
  if (!count) return null;
  const last = draft.ops[count - 1];
  return (
    <div className="tray" role="region" aria-label={tu(lang, 'trayLabel')}>
      <span className="tray-count" aria-hidden="true">
        {num(count, lang)}
      </span>
      <span className="tray-what">
        <b>{tu(lang, 'trayLabel')}</b>
        <span className="tray-last">{last?.says ?? tu(lang, 'traySaved')}</span>
      </span>
      <button type="button" className="tray-undo" onClick={onUndo}>
        {tu(lang, 'trayUndo')}
      </button>
      <button type="button" className="tray-send" onClick={onSend}>
        <Icon name="send" />
        {tu(lang, 'traySend')}
      </button>
    </div>
  );
}
