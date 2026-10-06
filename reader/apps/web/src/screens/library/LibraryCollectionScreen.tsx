import { Link, useSearchParams } from 'react-router-dom';
import type { LibraryCollectionId } from '@chassidushub-reader/catalog';
import { AXIS_VARIANTS, COLLECTION_AXES, axisGroups, axisTab, groupDisplayName, isCollectionAxis } from '@chassidushub-reader/app-core';
import { useLibrary } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { libraryGroupPath } from '../../routes/links';
import { Segmented } from '../../components/settings/SettingsControls';
import { useTranslation } from '../../i18n/useLanguage';
import { LibraryLoading } from './LibraryLoading';

interface Props {
  collection: LibraryCollectionId;
}

/**
 * One collection of the library: its browse axes as tabs (kept in the URL),
 * and the groups of the chosen one (volumes, years, months, parshiyos...).
 * A tab with variants (Melukat: its six volumes, or its edition by the
 * months in four parts) adds a second toggle. Same as the phone's.
 */
/** A group whose name is at most this long goes in a tile (the phone's LibraryCollectionScreen does the same). */
const COMPACT_NAME = 10;

export function LibraryCollectionScreen({ collection }: Props) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const [params, setParams] = useSearchParams();
  const axes = COLLECTION_AXES[collection];
  const asked = params.get('axis') ?? undefined;
  const axis = isCollectionAxis(collection, asked) ? asked : axes[0]!;
  const tab = axisTab(axis);
  const variants = library ? (AXIS_VARIANTS[tab] ?? []).filter((variant) => axisGroups(library, collection, variant).length > 0) : [];
  const groups = library ? axisGroups(library, collection, axis) : [];
  const compact = groups.length > 0 && groups.every((group) => groupDisplayName(collection, axis, group, language).length <= COMPACT_NAME);

  return (
    <div className="screen">
      <ScreenHeader to="/library" title={t.collectionNames[collection]} />
      <p className="tab-help">{t.collectionHelp[collection]}</p>
      {axes.length > 1 && (
        <div className="library-tabs">
          <Segmented
            options={axes.map((value) => ({ value, label: t.axisNames[value] ?? value }))}
            value={tab}
            onChange={(next) => setParams({ axis: next }, { replace: true })}
            label={t.collectionNames[collection]}
          />
        </div>
      )}
      {variants.length > 1 && (
        <div className="library-tabs">
          <Segmented
            options={variants.map((value) => ({ value, label: t.axisVariantNames[value] ?? value }))}
            value={axis}
            onChange={(next) => setParams({ axis: next }, { replace: true })}
            label={t.axisNames[tab] ?? tab}
          />
        </div>
      )}
      {!library && <LibraryLoading />}
      {/* Short names (years, months, parshiyos) as a grid of tiles; long ones (moadim, the Melukat's parts) as a list. */}
      <ul className={compact ? 'library-grid' : 'year-list library-list'}>
        {groups.map((group) => (
          <li key={`${axis}:${group.slug}`}>
            <Link className={compact ? 'library-grid-tile' : 'year-row'} to={libraryGroupPath(collection, axis, group.slug)}>
              <span className={compact ? 'library-grid-name' : 'year-row-year'}>{groupDisplayName(collection, axis, group, language)}</span>
              <span className={compact ? 'library-grid-count' : 'library-count'}>{group.itemIds.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
