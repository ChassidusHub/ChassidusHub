import { Link, useSearchParams } from 'react-router-dom';
import { browsableYears } from '@sichos-kodesh/catalog';
import { occasionGroupName } from '@sichos-kodesh/app-core';
import { useCatalog, useLibrary } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { Segmented } from '../components/settings/SettingsControls';
import { useTranslation } from '../i18n/useLanguage';
import type { FarbrengensView } from '../routes/tabs';
import { occasionGroupPath } from '../routes/links';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { LibraryLoading } from './library/LibraryLoading';

function isView(value: string | null): value is FarbrengensView {
  return value === 'year' || value === 'moed' || value === 'parsha';
}

/** Every year with something indexed, newest last (the catalog's order). */
function YearList() {
  const catalog = useCatalog();
  const { language } = useTranslation();
  return (
    <ul className="year-list">
      {browsableYears(catalog).map((year) => (
        <li key={year}>
          <Link className="year-row" to={`/browse/${year}`}>
            <span className="year-row-year">{hebrewYearLabel(year, language)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The farbrengens by mafteiach's own moadim (and yemei d'pagra) or parshiyos: its names, its order, its membership. */
function OccasionGroupList({ axis }: { axis: 'moadim' | 'parshiyos' }) {
  const library = useLibrary();
  const { language } = useTranslation();
  if (!library) return <LibraryLoading />;
  const groups = axis === 'moadim' ? library.moadim : library.parshiyos;
  return (
    <ul className="year-list library-list">
      {groups.map((group) => (
        <li key={group.slug}>
          <Link className="year-row" to={occasionGroupPath(axis, group.slug)}>
            <span className="year-row-year">{occasionGroupName(group, language)}</span>
            <span className="library-count">{group.occasionIds.length}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The farbrengens tab: every farbrengen, by year, by moed or by parsha -
 * one switch at the top, the view in the address (`?by=`) so back and a
 * shared link land on the same one.
 */
export function FarbrengensScreen() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const by = params.get('by');
  const view: FarbrengensView = isView(by) ? by : 'year';
  const options: Array<{ value: FarbrengensView; label: string }> = [
    { value: 'year', label: t.homeByYear },
    { value: 'moed', label: t.homeByMoed },
    { value: 'parsha', label: t.homeByParsha },
  ];

  return (
    <div className="screen">
      <ScreenHeader title={t.tabNames.farbrengens} />
      <div className="tab-switch">
        <Segmented options={options} value={view} label={t.tabNames.farbrengens} onChange={(next) => setParams(next === 'year' ? {} : { by: next }, { replace: true })} />
      </div>
      {view === 'year' && <YearList />}
      {view === 'moed' && <OccasionGroupList axis="moadim" />}
      {view === 'parsha' && <OccasionGroupList axis="parshiyos" />}
    </div>
  );
}
