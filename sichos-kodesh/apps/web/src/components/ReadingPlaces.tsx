import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { catalogUnit } from '@sichos-kodesh/catalog';
import { names } from '@sichos-kodesh/app-core';
import { catalogStore, useWorks } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useLanguage';
import { readerPath } from '../routes/links';
import { recentPlaces, useReadingState } from '../seforim/readingState';

/**
 * Where the reader left off in each sefer, and the bookmarks (the redo
 * plan's "שלי": history and bookmarks) - each opening the reader right
 * there. Nothing shows until something has been read.
 */
export function ReadingPlaces() {
  const works = useWorks();
  const reading = useReadingState();
  const { t, language } = useTranslation();
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

  return (
    <>
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
    </>
  );
}
