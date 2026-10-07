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
export function ModeSwitch({ lang }: { lang: Lang }) {
  const { pathname, search, hash } = useLocation();
  const editing = isEditing(search);
  return (
    <nav className="mode-switch" aria-label={tu(lang, 'modeLabel')}>
      <Link to={modeHref(pathname, search, false, hash)} aria-current={editing ? undefined : 'page'} replace preventScrollReset>
        <Icon name="eye" />
        {tu(lang, 'modeRead')}
      </Link>
      <Link to={modeHref(pathname, search, true, hash)} aria-current={editing ? 'page' : undefined} className="is-edit" replace preventScrollReset rel="nofollow">
        <Icon name="pencil" />
        {tu(lang, 'modeEdit')}
      </Link>
    </nav>
  );
}
