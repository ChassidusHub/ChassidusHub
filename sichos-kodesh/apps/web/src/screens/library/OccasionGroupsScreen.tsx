import { Link } from 'react-router-dom';
import { occasionGroupName } from '@sichos-kodesh/app-core';
import { useLibrary } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { LibraryLoading } from './LibraryLoading';

interface Props {
  axis: 'moadim' | 'parshiyos';
}

/** The farbrengens by mafteiach's own moadim (and yemei d'pagra) or parshiyos: its names, its order, its membership. */
export function OccasionGroupsScreen({ axis }: Props) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const groups = library ? (axis === 'moadim' ? library.moadim : library.parshiyos) : [];

  return (
    <div className="screen">
      <ScreenHeader to="/library" title={axis === 'moadim' ? t.libraryByMoed : t.libraryByParsha} />
      {!library && <LibraryLoading />}
      <ul className="year-list">
        {groups.map((group) => (
          <li key={group.slug}>
            <Link className="year-row" to={`/library/${axis}/${encodeURIComponent(group.slug)}`}>
              <span className="year-row-year">{occasionGroupName(group, language)}</span>
              <span className="year-row-distance">{group.occasionIds.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
