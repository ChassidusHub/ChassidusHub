import { Link, useLocation } from 'react-router';
import type { Lang } from '../../lib/i18n.js';
import { tu } from '../../lib/i18nUi.js';
import { isEditing, modeHref } from '../../lib/editMode.js';
import { Icon } from '../Icon.js';

/**
 * Read · Edit: the one switch every page has, in the same place, beside
 * the title. Two links rather than a button, so each mode has an address
 * of its own and works before the page's script has loaded.
 */
export function ModeSwitch({ lang, readTo, editTo }: { lang: Lang; readTo?: string; editTo?: string }) {
  const { pathname, search, hash } = useLocation();
  // A place whose Edit is a screen of its own (the library's is Organize) gives both addresses; the one it is on is current.
  const editing = editTo || readTo ? Boolean(readTo) && !editTo : isEditing(search);
  return (
    <nav className="mode-switch" aria-label={tu(lang, 'modeLabel')}>
      <Link to={readTo ?? modeHref(pathname, search, false, hash)} aria-current={editing ? undefined : 'page'} replace={!readTo} preventScrollReset={!readTo}>
        <Icon name="eye" />
        {tu(lang, 'modeRead')}
      </Link>
      <Link to={editTo ?? modeHref(pathname, search, true, hash)} aria-current={editing ? 'page' : undefined} className="is-edit" replace={!editTo} preventScrollReset={!editTo} rel="nofollow">
        <Icon name="pencil" />
        {tu(lang, 'modeEdit')}
      </Link>
    </nav>
  );
}
