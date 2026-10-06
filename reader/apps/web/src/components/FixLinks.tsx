import { Flag, PenLine } from 'lucide-react';
import { fixLinkUrl, type FixAction, type FixTarget } from '@chassidushub-reader/app-core';
import { useTranslation } from '../i18n/useLanguage';
import { APP_VERSION } from '../changelog';

/** ChassidusHub's site for `action` on `target` (app-core's fixLinks.ts); the app's version goes along. */
export function fixHref(action: FixAction, target: FixTarget): string {
  return fixLinkUrl(action, target, { version: APP_VERSION, platform: 'web' });
}

/**
 * "Suggest a fix" and "Report a problem" at the foot of a farbrengen or a
 * sefer, as on the phone (apps/mobile's FixLinks.tsx): the catalog is
 * ChassidusHub's, so both open its site on this item, in a new tab.
 */
export function FixLinks({ target }: { target: FixTarget }) {
  const { t } = useTranslation();
  return (
    <div className="fix-links">
      <div className="fix-links-row">
        <a className="action-pill" href={fixHref('edit', target)} target="_blank" rel="noopener noreferrer">
          <PenLine size={16} aria-hidden />
          <span>{t.fixSuggest}</span>
        </a>
        <a className="action-pill" href={fixHref('report', target)} target="_blank" rel="noopener noreferrer">
          <Flag size={16} aria-hidden />
          <span>{t.fixReport}</span>
        </a>
      </div>
      <p className="fix-links-help">{t.fixHelp}</p>
    </div>
  );
}
