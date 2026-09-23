import { Link } from 'react-router-dom';
import { browsableYears } from '@sichos-kodesh/catalog';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

export function BrowseYearsScreen() {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const allYears = browsableYears(catalog);

  return (
    <div className="screen">
      <ScreenHeader to="/" title={t.browseAnyYear} />
      <p className="tab-help">{t.browseHelp}</p>
      <ul className="year-list">
        {allYears.map((year) => (
          <li key={year}>
            <Link className="year-row" to={`/browse/${year}`}>
              <span className="year-row-year">{hebrewYearLabel(year, language)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
