import { Link } from 'react-router-dom';
import { browsableYears } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { useTranslation } from '../i18n/useLanguage';

/** Reached from the home screen's secondary "browse any year" link - every indexed year, no kvius match required. */
export function BrowseYearsScreen() {
  const { t } = useTranslation();
  const allYears = browsableYears(catalog);

  return (
    <div className="screen">
      <BackLink to="/">{t.home}</BackLink>
      <h1>{t.browseAnyYear}</h1>
      <p className="tab-help">{t.browseHelp}</p>
      <ul className="year-list">
        {allYears.map((year) => (
          <li key={year}>
            <Link className="year-row" to={`/browse/${year}`}>
              <span className="year-row-year">{year}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
