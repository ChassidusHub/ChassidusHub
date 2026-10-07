import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Lang } from '../../lib/i18n.js';
import { tu } from '../../lib/i18nUi.js';
import { href } from '../../lib/links.js';
import { Icon } from '../Icon.js';
import { Breadcrumbs } from '../primitives.js';
import { ModeSwitch } from './ModeSwitch.js';

/**
 * The bar at the top of every page, the same on all of them
 * (docs/plans/redesign.md): where the page is on one side, and on the other
 * Read · Edit, then the page's own tools (follow, text size), then its "…".
 * On a phone the trail folds to one link back to where the page is in, so
 * the switch is always at the same place under the thumb.
 *
 * `crumbs` are the places above this page, not the page itself: its name is
 * the title right under the bar.
 */
export function PageBar({
  lang,
  crumbs,
  mode = true,
  tools,
  more,
}: {
  lang: Lang;
  crumbs?: Array<{ label: ReactNode; to?: string }>;
  /** Read · Edit: on (the same page with `?edit`), off, or the two addresses of a place whose Edit is a screen of its own. */
  mode?: boolean | { readTo?: string; editTo?: string };
  tools?: ReactNode;
  more?: ReactNode;
}) {
  const trail = crumbs ?? [];
  const up = [...trail].reverse().find((c) => c.to);
  return (
    <div className="pbar">
      <div className="pbar-where">
        {trail.length ? <Breadcrumbs items={trail} lang={lang} className="pbar-crumbs" linkLast /> : null}
        {up ? (
          <Link className="pbar-up" to={up.to!}>
            <Icon name="back" size={18} />
            <span>{up.label}</span>
          </Link>
        ) : null}
      </div>
      <div className="pbar-tools">
        {mode ? <ModeSwitch lang={lang} {...(typeof mode === 'object' ? mode : {})} /> : null}
        {tools}
        {more}
      </div>
    </div>
  );
}

/**
 * What Edit says under a page's head, in the same place on every page: tap
 * what is outlined; and where the page has more than its outlines cover,
 * a link to every detail of the item.
 */
export function EditHint({ lang, details }: { lang: Lang; details?: string }) {
  return (
    <p className="pf-edit-hint">
      <Icon name="pencil" />
      <span className="grow">{tu(lang, 'editHint')}</span>
      {details ? <Link to={href(`/edit/${details}`, lang)}>{tu(lang, 'allDetails')}</Link> : null}
    </p>
  );
}
