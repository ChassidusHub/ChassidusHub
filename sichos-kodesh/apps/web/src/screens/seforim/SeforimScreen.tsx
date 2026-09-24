import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { catalogUnit } from '@sichos-kodesh/catalog';
import { authorSections, names, workKind } from '@sichos-kodesh/app-core';
import { catalogStore, useWorks } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { recentPlaces, useReadingState } from '../../seforim/readingState';
import { LibraryLoading } from '../library/LibraryLoading';
import { readerPath } from './seforimPaths';

/**
 * The seforim (catalog schema 3): where the reader left off, the
 * bookmarks, then the Rebbeim in order - the Baal Shem Tov and the Maggid,
 * the Alter Rebbe to the Rebbe - each with his seforim. Same as the phone's.
 */
export function SeforimScreen() {
  const works = useWorks();
  const reading = useReadingState();
  const { t, language } = useTranslation();
  const sections = useMemo(() => (works ? authorSections(works) : []), [works]);
  const byId = useMemo(() => new Map((works?.works ?? []).map((w) => [w.id, w])), [works]);
  const recent = recentPlaces(reading).filter(({ workId }) => byId.has(workId));
  const bookmarks = reading.bookmarks.filter((b) => byId.has(b.workId));

  // A unit's name when its sefer's chapters are already loaded; its sefer's name alone otherwise.
  const placeLabel = (workId: string, unitId: string) => {
    const work = byId.get(workId)!;
    const contents = catalogStore.getWorkContents(workId);
    const unit = contents ? catalogUnit(contents, unitId) : undefined;
    const label = unit ? (language === 'en' ? (unit.labelEn ?? unit.label) : unit.label) : null;
    return label ? `${names(work.title, language)} · ${label}` : names(work.title, language);
  };

  const meta = (workId: string): string => {
    const work = byId.get(workId)!;
    switch (workKind(work)) {
      case 'read':
        return t.seforimChapters(work.units ?? 0);
      case 'collection':
        return t.seforimInLibrary;
      case 'links':
        return t.seforimLink;
      default:
        return '';
    }
  };

  return (
    <div className="screen">
      <ScreenHeader to="/library" title={t.seforimTitle} />
      <p className="tab-help">{t.seforimHelp}</p>
      <Link className="category-row" to="/seforim/search">
        <span className="category-row-name">{t.seforimSearchRow}</span>
        <span className="category-row-trailing">
          <Search size={18} aria-hidden />
        </span>
      </Link>

      {!works && <LibraryLoading />}

      {recent.length > 0 && (
        <div className="category">
          <h2 className="category-header">{t.seforimContinue}</h2>
          <ul className="year-list">
            {recent.map(({ workId, place }) => (
              <li key={workId}>
                <Link className="year-row" to={readerPath(workId, place.unitId, place.source)}>
                  <span className="year-row-year">{placeLabel(workId, place.unitId)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {bookmarks.length > 0 && (
        <div className="category">
          <h2 className="category-header">{t.seforimBookmarks}</h2>
          <ul className="year-list">
            {bookmarks.map((b) => (
              <li key={`${b.workId}/${b.unitId}`}>
                <Link className="year-row" to={readerPath(b.workId, b.unitId)}>
                  <span className="year-row-year">{placeLabel(b.workId, b.unitId)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sections.map((section) => (
        <Fragment key={section.author?.id ?? 'others'}>
          <h2 className="category-header">{section.author ? names(section.author.name, language) : t.seforimOtherAuthors}</h2>
          <ul className="year-list">
            {section.works.map((work) => (
              <li key={work.id}>
                <Link className={workKind(work) === 'listed' ? 'year-row seforim-row-muted' : 'year-row'} to={`/seforim/${encodeURIComponent(work.id)}`}>
                  <span className="year-row-year">{names(work.title, language)}</span>
                  <span className="year-row-distance">{meta(work.id)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}
