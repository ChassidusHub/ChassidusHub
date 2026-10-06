import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LibraryCollectionId } from '@chassidushub-reader/catalog';
import { findGroup, groupDisplayName, groupItems, itemSubtitle, itemTitle, volumeSections } from '@chassidushub-reader/app-core';
import { useLibrary } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { libraryCollectionPath, libraryGroupPath, libraryItemPath } from '../../routes/links';
import { useTranslation } from '../../i18n/useLanguage';
import { LibraryLoading } from './LibraryLoading';

interface Props {
  collection: LibraryCollectionId;
  axis: string;
  slug: string;
}

/**
 * One group of a collection (a volume, a year, a masechta): its items in the
 * order mafteiach lists them. A Likkutei Sichos volume opens on its
 * parshiyos first (`?section=` is one of them), and a parsha on its sichos.
 */
export function LibraryGroupScreen({ collection, axis, slug }: Props) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const [params] = useSearchParams();
  const sectionKey = params.get('section');
  const group = library ? findGroup(library, collection, axis, slug) : undefined;
  const allItems = useMemo(() => (library && group ? groupItems(library, collection, group) : []), [collection, group, library]);
  const sections = useMemo(() => volumeSections(collection, axis, allItems), [allItems, axis, collection]);
  const section = sectionKey !== null ? sections?.find((s) => s.key === sectionKey) : undefined;
  const items = section ? section.items : allItems;
  const groupName = group ? groupDisplayName(collection, axis, group, language) : t.collectionNames[collection];
  const title = section ? section.name[language] : groupName;
  const groupPath = libraryGroupPath(collection, axis, slug);
  const back = section ? groupPath : libraryCollectionPath(collection, axis);

  return (
    <div className="screen">
      <ScreenHeader to={back} title={title} />
      {!library && <LibraryLoading />}
      {library && (
        <p className="subtitle">
          {section ? groupName : t.collectionNames[collection]} · {t.libraryItemsCount(items.length)}
        </p>
      )}
      {collection === 'likkuteiSichos' && slug === '40' && <p className="tab-help">{t.libraryDisputedNote}</p>}
      {library && items.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-text">{t.libraryNotFound}</p>
        </div>
      )}
      {sections && !section ? (
        <ul className="year-list library-list">
          {sections.map((s) => (
            <li key={s.key}>
              <Link className="year-row" to={libraryGroupPath(collection, axis, slug, s.key)}>
                <span className="year-row-year">{s.name[language]}</span>
                <span className="library-count">{s.items.length}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="year-list library-list">
          {items.map((item) => {
            // The group this list is (a sicha's parsha) is already its title: not repeated under each item.
            const line = itemSubtitle(collection, item, language);
            const subtitle = line === title ? '' : line;
            return (
              <li key={item.id}>
                <Link className="year-row library-item-row" to={libraryItemPath(collection, item.id)}>
                  <span className="library-item-text">
                    <span className="year-row-year">{itemTitle(collection, item, language)}</span>
                    {subtitle && <span className="library-item-subtitle">{subtitle}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
