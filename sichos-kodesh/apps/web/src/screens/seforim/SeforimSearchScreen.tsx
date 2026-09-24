import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { names, searchNames } from '@sichos-kodesh/app-core';
import { catalogStore, loadAllWorkContents, useWorks } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { LibraryLoading } from '../library/LibraryLoading';
import { readerPath, workPath } from './seforimPaths';

/**
 * Search the seforim by name: every sefer, and every chapter of the ones
 * read here. Searching inside the text is the phone's, in the seforim
 * saved on it (their search indexes are built there).
 */
export function SeforimSearchScreen() {
  const works = useWorks();
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const [contentsReady, setContentsReady] = useState(false);

  useEffect(() => {
    if (!works) return;
    let alive = true;
    loadAllWorkContents(works).then(
      () => alive && setContentsReady(true),
      () => alive && setContentsReady(true),
    );
    return () => {
      alive = false;
    };
  }, [works]);

  const typed = query.trim().length >= 2;
  const hits = useMemo(() => (works && typed ? searchNames(works, (id) => catalogStore.getWorkContents(id), query) : []), [works, typed, query, contentsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen">
      <ScreenHeader to="/seforim" title={t.seforimSearchTitle} />
      <p className="tab-help">{t.seforimSearchHelp}</p>
      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.seforimSearchPlaceholder}
        aria-label={t.seforimSearchPlaceholder}
        dir="auto"
        autoFocus
      />
      {!works && <LibraryLoading />}
      {typed && works && (
        <>
          <h2 className="category-header">{t.seforimSearchNames}</h2>
          {hits.length === 0 ? (
            <p className="search-results-count">{t.seforimSearchNothing}</p>
          ) : (
            <ul className="year-list">
              {hits.map((hit) => (
                <li key={hit.unit ? `${hit.work.id}/${hit.unit.id}` : hit.work.id}>
                  <Link className="year-row" to={hit.unit ? readerPath(hit.work.id, hit.unit.id) : workPath(hit.work.id)}>
                    <span className="year-row-year">
                      {hit.unit ? `${names(hit.work.title, language)} · ${language === 'en' ? (hit.unit.labelEn ?? hit.unit.label) : hit.unit.label}` : names(hit.work.title, language)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
