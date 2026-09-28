import { Link } from 'react-router-dom';
import { LIBRARY_ORDER } from '@sichos-kodesh/app-core';
import { useLibrary, useWorks } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { LibraryLoading } from './LibraryLoading';

/**
 * The library (docs/offline-plan.md WP4b, on the web since WP16): the
 * seforim of the Rebbeim, the farbrengens by mafteiach's moadim and
 * parshiyos, then one browser per collection of catalog schema 2. The
 * same library as the phone's; only its offline packs are phone-only.
 */
export function LibraryScreen() {
  const library = useLibrary();
  const works = useWorks();
  const { t } = useTranslation();

  return (
    <div className="screen">
      <ScreenHeader title={t.tabNames.library} />
      <p className="tab-help">{t.libraryHelp}</p>

      <div className="category">
        <h2 className="category-header">{t.librarySeforimSection}</h2>
        <Link className="category-row" to="/seforim">
          <span className="category-row-name">{t.seforimRow}</span>
          {works && <span className="category-row-count">{works.works.length}</span>}
        </Link>
        <Link className="category-row" to="/search?in=seforim">
          <span className="category-row-name">{t.seforimSearchRow}</span>
        </Link>
      </div>

      {!library ? (
        <LibraryLoading />
      ) : (
        <>
          <div className="category">
            <h2 className="category-header">{t.libraryCollectionsSection}</h2>
            {LIBRARY_ORDER.map((collection) => {
              const count = library.collections[collection].items.length;
              if (count === 0) return null;
              return (
                <Link key={collection} className="category-row" to={`/library/c/${collection}`}>
                  <span className="category-row-name">{t.collectionNames[collection]}</span>
                  <span className="category-row-count">{count}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
