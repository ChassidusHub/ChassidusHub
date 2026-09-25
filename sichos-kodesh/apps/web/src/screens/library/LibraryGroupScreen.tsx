import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import { findGroup, groupDisplayName, groupItems, itemSubtitle, itemTitle } from '@sichos-kodesh/app-core';
import { useLibrary } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { LibraryLoading } from './LibraryLoading';

interface Props {
  collection: LibraryCollectionId;
  axis: string;
  slug: string;
}

/** One group of a collection (a volume, a year, a masechta): its items in the order mafteiach lists them. */
export function LibraryGroupScreen({ collection, axis, slug }: Props) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const group = library ? findGroup(library, collection, axis, slug) : undefined;
  const items = useMemo(() => (library && group ? groupItems(library, collection, group) : []), [collection, group, library]);
  const title = group ? groupDisplayName(collection, axis, group, language) : t.collectionNames[collection];

  return (
    <div className="screen">
      <ScreenHeader to={`/library/c/${collection}?axis=${encodeURIComponent(axis)}`} title={title} />
      {!library && <LibraryLoading />}
      {library && (
        <p className="subtitle">
          {t.collectionNames[collection]} · {t.libraryItemsCount(items.length)}
        </p>
      )}
      {collection === 'likkuteiSichos' && slug === '40' && <p className="tab-help">{t.libraryDisputedNote}</p>}
      {library && items.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-text">{t.libraryNotFound}</p>
        </div>
      )}
      <ul className="year-list library-list">
        {items.map((item) => {
          // The group this list is (a sicha's parsha) is already its title: not repeated under each item.
          const line = itemSubtitle(collection, item, language);
          const subtitle = line === title ? '' : line;
          return (
            <li key={item.id}>
              <Link className="year-row library-item-row" to={`/library/item/${collection}/${encodeURIComponent(item.id)}`}>
                <span className="library-item-text">
                  <span className="year-row-year">{itemTitle(collection, item, language)}</span>
                  {subtitle && <span className="library-item-subtitle">{subtitle}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
