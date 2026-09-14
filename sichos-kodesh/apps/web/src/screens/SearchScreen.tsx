import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MAFTEIACH_MONTH_OPTIONS, PDF_SECTION_ORDER, browsableYears } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { parshaOptions } from '../search/parshaOptions';
import { hasActiveFilters, searchOccasions } from '../search/searchOccasions';
import type { ContentType, SearchFilters } from '../search/searchOccasions';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

/**
 * Free-text search plus "smart" filters (year, month, day, parsha, content
 * type) over the whole bundled catalog - not scoped to one year or flow
 * the way every other list screen in the app is. Results link via
 * /browse/:hebrewYear/:occasionId, the one route that resolves any
 * occasion directly with no kvius-matching or this-week requirement.
 *
 * The query text is deferred (React's `useDeferredValue`, not a manual
 * debounce timer) so fast typing on a slower device doesn't force a
 * catalog-wide re-scan on every keystroke while still feeling instant on
 * a fast one.
 */
export function SearchScreen() {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const [hdateMonth, setHdateMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [parsha, setParsha] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentType[]>([]);

  const filters: SearchFilters = { query: deferredQuery, hebrewYear, hdateMonth, day, parsha, types };
  // Keyed on the individual primitive fields, not `filters` itself - a
  // fresh object literal every render would otherwise make this recompute
  // (rescanning the whole catalog) on every render, not just when a value
  // actually changes.
  const results = useMemo(
    () => searchOccasions(catalog, { query: deferredQuery, hebrewYear, hdateMonth, day, parsha, types }),
    [deferredQuery, hebrewYear, hdateMonth, day, parsha, types],
  );
  const years = useMemo(() => browsableYears(catalog), []);
  const parshas = useMemo(() => parshaOptions(language), [language]);

  function toggleType(type: ContentType): void {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t2) => t2 !== type) : [...prev, type]));
  }

  function clearFilters(): void {
    setQuery('');
    setHebrewYear(null);
    setHdateMonth(null);
    setDay(null);
    setParsha(null);
    setTypes([]);
  }

  const typeOptions: Array<{ value: ContentType; label: string }> = [
    { value: 'audio', label: t.audioTypeLabel },
    { value: 'hanacha', label: t.hanachaTypeLabel },
    ...PDF_SECTION_ORDER.map((section) => ({ value: section, label: t.sectionLabels[section] })),
  ];

  return (
    <div className="screen">
      <BackLink to="/">{t.home}</BackLink>
      <h1>{t.searchTitle}</h1>
      <p className="tab-help">{t.searchHelp}</p>

      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchPlaceholder}
        aria-label={t.searchPlaceholder}
      />

      <div className="search-filters">
        <label className="search-filter">
          <span className="search-filter-label">{t.yearFilterLabel}</span>
          <select value={hebrewYear ?? ''} onChange={(e) => setHebrewYear(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t.anyFilterOption}</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {hebrewYearLabel(year, language)}
              </option>
            ))}
          </select>
        </label>

        <label className="search-filter">
          <span className="search-filter-label">{t.monthFilterLabel}</span>
          <select value={hdateMonth ?? ''} onChange={(e) => setHdateMonth(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t.anyFilterOption}</option>
            {MAFTEIACH_MONTH_OPTIONS.map((month) => (
              <option key={month.hdateMonth} value={month.hdateMonth}>
                {language === 'he' ? month.nameHebrew : month.name}
              </option>
            ))}
          </select>
        </label>

        <label className="search-filter">
          <span className="search-filter-label">{t.dayFilterLabel}</span>
          <select value={day ?? ''} onChange={(e) => setDay(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t.anyFilterOption}</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="search-filter">
          <span className="search-filter-label">{t.parshaFilterLabel}</span>
          <select value={parsha ?? ''} onChange={(e) => setParsha(e.target.value || null)}>
            <option value="">{t.anyFilterOption}</option>
            {parshas.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="search-filter-label search-type-label">{t.typeFilterLabel}</p>
      <div className="search-type-pills">
        {typeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={types.includes(option.value) ? 'search-type-pill search-type-pill-active' : 'search-type-pill'}
            onClick={() => toggleType(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {hasActiveFilters(filters) && (
        <button type="button" className="search-clear-link" onClick={clearFilters}>
          {t.clearFiltersLabel}
        </button>
      )}

      {hasActiveFilters(filters) && (
        <>
          <p className="subtitle search-results-count">{t.searchResultsCount(results.reduce((n, g) => n + g.entries.length, 0))}</p>
          {results.length === 0 && <p className="gap-message">{t.noSearchResults}</p>}
          {results.map(({ hebrewYear: year, entries }) => (
            <div key={year}>
              <p className="category-header">{hebrewYearLabel(year, language)}</p>
              <ul className="year-list">
                {entries.map((entry) => (
                  <li key={entry.occasionId}>
                    <Link className="year-row" to={`/browse/${year}/${entry.occasionId}`}>
                      <span className="year-row-main">
                        <OccasionRowIcon entry={entry} progressMap={progressMap} />
                        <span className="year-row-year">{entry.occasionLabel}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
