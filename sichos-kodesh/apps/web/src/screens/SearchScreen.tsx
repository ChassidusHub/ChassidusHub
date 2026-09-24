import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gematriya } from '@hebcal/core';
import { MAFTEIACH_MONTH_OPTIONS, PDF_SECTION_ORDER, browsableYears } from '@sichos-kodesh/catalog';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import { LIBRARY_ORDER, collectionYears, itemSubtitle, occasionTitle, searchLibrary } from '@sichos-kodesh/app-core';
import { useCatalog, useLibrary } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { chagOptions, parshaOptions } from '../search/parshaOptions';
import { specialDayOptions } from '../search/specialDayOptions';
import { hasActiveFilters, isChagCategory, searchOccasions } from '../search/searchOccasions';
import type { ContentType, SearchFilters } from '../search/searchOccasions';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';
import { LibraryLoading } from './library/LibraryLoading';

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
/** A collection's results render as plain rows; past this many, the list asks for a narrower search instead of growing (as on the phone). */
const LIBRARY_RESULT_LIMIT = 200;

/**
 * Free-text search plus filters (year, month, day, parsha, content type)
 * over the whole bundled catalog, not scoped to one year or flow.
 * Results link via /browse/:hebrewYear/:occasionId, the one route that
 * resolves any occasion directly with no kvius-matching or this-week
 * requirement.
 *
 * The query text is deferred (`useDeferredValue`, not a manual debounce
 * timer) so fast typing on a slower device doesn't force a catalog-wide
 * re-scan on every keystroke, while still feeling instant on a fast one.
 */
function FarbrengenSearch() {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const [hdateMonth, setHdateMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [parsha, setParsha] = useState<string | null>(null);
  const [specialDay, setSpecialDay] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentType[]>([]);

  const filters: SearchFilters = { query: deferredQuery, hebrewYear, hdateMonth, day, parsha, specialDay, types };
  // Keyed on individual fields, not `filters` itself - a fresh object
  // literal every render would otherwise force a full catalog re-scan on
  // every render.
  const results = useMemo(
    () => searchOccasions(catalog, { query: deferredQuery, hebrewYear, hdateMonth, day, parsha, specialDay, types }),
    [catalog, deferredQuery, hebrewYear, hdateMonth, day, parsha, specialDay, types],
  );
  const years = useMemo(() => browsableYears(catalog), [catalog]);
  const parshas = useMemo(() => parshaOptions(language), [language]);
  const chagim = useMemo(() => chagOptions(language), [language]);
  const specialDays = useMemo(() => specialDayOptions(language), [language]);

  function toggleType(type: ContentType): void {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t2) => t2 !== type) : [...prev, type]));
  }

  function clearFilters(): void {
    setQuery('');
    setHebrewYear(null);
    setHdateMonth(null);
    setDay(null);
    setParsha(null);
    setSpecialDay(null);
    setTypes([]);
  }

  const typeOptions: Array<{ value: ContentType; label: string }> = [
    { value: 'audio', label: t.audioTypeLabel },
    { value: 'hanacha', label: t.hanachaTypeLabel },
    ...PDF_SECTION_ORDER.map((section) => ({ value: section, label: t.sectionLabels[section] })),
  ];

  return (
    <>
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
                {language === 'he' ? gematriya(d) : d}
              </option>
            ))}
          </select>
        </label>

        <label className="search-filter">
          <span className="search-filter-label">{t.parshaFilterLabel}</span>
          <select value={parsha && !isChagCategory(parsha) ? parsha : ''} onChange={(e) => setParsha(e.target.value || null)}>
            <option value="">{t.anyFilterOption}</option>
            {parshas.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="search-filter">
          <span className="search-filter-label">{t.chagOptgroupLabel}</span>
          <select value={parsha && isChagCategory(parsha) ? parsha : ''} onChange={(e) => setParsha(e.target.value || null)}>
            <option value="">{t.anyFilterOption}</option>
            {chagim.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="search-filter">
          <span className="search-filter-label">{t.specialDayFilterLabel}</span>
          <select value={specialDay ?? ''} onChange={(e) => setSpecialDay(e.target.value || null)}>
            <option value="">{t.anyFilterOption}</option>
            {specialDays.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
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
                      <span className="year-row-year">{occasionTitle(entry, language)}</span>
                      <span className="year-row-trailing">
                        <OccasionRowIcon entry={entry} progressMap={progressMap} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/** One library collection, searched by name and by where and when it was said (app-core's searchLibrary, as on the phone). */
function LibrarySearch({ collection }: { collection: LibraryCollectionId }) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const years = useMemo(() => (library ? collectionYears(library, collection) : []), [library, collection]);
  const items = useMemo(() => (library ? searchLibrary(library, collection, deferredQuery, hebrewYear) : []), [library, collection, deferredQuery, hebrewYear]);
  const active = query.trim() !== '' || hebrewYear != null;

  return (
    <>
      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchLibraryPlaceholder}
        aria-label={t.searchLibraryPlaceholder}
        dir="auto"
      />
      {years.length > 0 && (
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
        </div>
      )}
      {!library && <LibraryLoading />}
      {active && library && (
        <>
          <p className="subtitle search-results-count">{t.searchResultsCount(items.length)}</p>
          {items.length === 0 && <p className="gap-message">{t.noSearchResults}</p>}
          <ul className="year-list">
            {items.slice(0, LIBRARY_RESULT_LIMIT).map((item) => {
              const subtitle = itemSubtitle(collection, item, language);
              return (
                <li key={item.id}>
                  <Link className="year-row library-item-row" to={`/library/item/${collection}/${encodeURIComponent(item.id)}`}>
                    <span className="library-item-text">
                      <span className="year-row-year">{item.label}</span>
                      {subtitle && <span className="library-item-subtitle">{subtitle}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {items.length > LIBRARY_RESULT_LIMIT && <p className="gap-message">{t.searchShowingFirst(LIBRARY_RESULT_LIMIT, items.length)}</p>}
        </>
      )}
    </>
  );
}

/**
 * Search: the farbrengens by default (free text plus year, month, day,
 * parsha, chag, special day and content type), or - picked in "Search in" -
 * one collection of the library.
 */
export function SearchScreen() {
  const { t } = useTranslation();
  const [collection, setCollection] = useState<LibraryCollectionId | null>(null);

  return (
    <div className="screen">
      <ScreenHeader to="/" title={t.searchTitle} />
      <p className="tab-help">{collection ? t.searchLibraryHelp : t.searchHelp}</p>
      <div className="search-filters search-in">
        <label className="search-filter">
          <span className="search-filter-label">{t.searchInLabel}</span>
          <select value={collection ?? ''} onChange={(e) => setCollection((e.target.value || null) as LibraryCollectionId | null)}>
            <option value="">{t.searchInFarbrengens}</option>
            {LIBRARY_ORDER.map((id) => (
              <option key={id} value={id}>
                {t.collectionNames[id]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {collection ? <LibrarySearch key={collection} collection={collection} /> : <FarbrengenSearch />}
    </div>
  );
}
