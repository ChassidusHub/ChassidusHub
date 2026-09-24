import { Link, useSearchParams } from 'react-router-dom';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import { COLLECTION_AXES, axisGroups, groupDisplayName } from '@sichos-kodesh/app-core';
import { useLibrary } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Segmented } from '../../components/settings/SettingsControls';
import { useTranslation } from '../../i18n/useLanguage';
import { LibraryLoading } from './LibraryLoading';

interface Props {
  collection: LibraryCollectionId;
}

/** One collection of the library: its browse axes as tabs (kept in the URL), and the groups of the chosen one (volumes, years, parshiyos...). */
export function LibraryCollectionScreen({ collection }: Props) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const [params, setParams] = useSearchParams();
  const axes = COLLECTION_AXES[collection];
  const asked = params.get('axis');
  const axis = asked && axes.includes(asked) ? asked : axes[0]!;
  const groups = library ? axisGroups(library, collection, axis) : [];

  return (
    <div className="screen">
      <ScreenHeader to="/library" title={t.collectionNames[collection]} />
      <p className="tab-help">{t.collectionHelp[collection]}</p>
      {axes.length > 1 && (
        <div className="library-tabs">
          <Segmented
            options={axes.map((value) => ({ value, label: t.axisNames[value] ?? value }))}
            value={axis}
            onChange={(next) => setParams({ axis: next }, { replace: true })}
            label={t.collectionNames[collection]}
          />
        </div>
      )}
      {!library && <LibraryLoading />}
      <ul className="year-list">
        {groups.map((group) => (
          <li key={`${axis}:${group.slug}`}>
            <Link className="year-row" to={`/library/c/${collection}/${axis}/${encodeURIComponent(group.slug)}`}>
              <span className="year-row-year">{groupDisplayName(collection, axis, group, language)}</span>
              <span className="year-row-distance">{group.itemIds.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
