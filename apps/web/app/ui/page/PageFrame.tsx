import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { Lang } from '../../lib/i18n.js';
import { tu } from '../../lib/i18nUi.js';
import { isEditing } from '../../lib/editMode.js';
import { Icon } from '../Icon.js';
import { Sheet } from '../primitives.js';
import { EditHint, PageBar } from './PageBar.js';
import { EditTray } from './EditTray.js';

/**
 * The frame every page of the redesign is drawn in (docs/plans/redesign.md):
 * the page bar (where it is, Read · Edit, an ⓘ that
 * opens what is about the page rather than in it (history, discussion,
 * sources, its permanent id)), its title, and in Edit, the tray of your changes.
 *
 * The page's own blocks read `editing` and draw themselves in either mode,
 * so a page never has a separate editor. `place` is the item's permanent id:
 * the draft the page's changes collect in.
 */
export function PageFrame({
  lang,
  place,
  crumbs,
  title,
  titleDir,
  sub,
  info,
  onSend,
  children,
}: {
  lang: Lang;
  place: string;
  crumbs?: Array<{ label: ReactNode; to?: string }>;
  title: ReactNode;
  /** A Hebrew title on an English page is set right to left in the Torah face. */
  titleDir?: 'rtl' | 'ltr';
  sub?: ReactNode;
  /** What the ⓘ panel holds; no ⓘ when there is nothing. */
  info?: ReactNode;
  /** Sending the tray; left out, the draft is sent as it is (the Send sheet comes in step 6). */
  onSend?: () => void;
  children: (editing: boolean) => ReactNode;
}) {
  const { search } = useLocation();
  const editing = isEditing(search);
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className={editing ? 'page-frame is-editing' : 'page-frame'}>
      <PageBar
        lang={lang}
        crumbs={crumbs}
        more={
          info ? (
            <button type="button" className="ib pf-info" aria-label={tu(lang, 'pageInfo')} onClick={() => setInfoOpen(true)}>
              <Icon name="info" />
            </button>
          ) : null
        }
      />
      <h1 className={titleDir === 'rtl' ? 'pf-title is-torah' : 'pf-title'} dir={titleDir}>
        {title}
      </h1>
      {sub ? <div className="pf-sub">{sub}</div> : null}
      {editing ? <EditHint lang={lang} /> : null}
      <div className="pf-body">{children(editing)}</div>
      {editing ? <EditTray place={place} lang={lang} onSend={onSend} /> : null}
      {info ? (
        <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title={tu(lang, 'pageInfo')}>
          {info}
        </Sheet>
      ) : null}
    </div>
  );
}
