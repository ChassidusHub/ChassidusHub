import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { gematriya } from '@hebcal/core';
import { MAFTEIACH_MONTH_OPTIONS, PDF_SECTION_ORDER, browsableYears } from '@sichos-kodesh/catalog';
import type { CatalogEntry, LibraryCollectionId, LibraryItemBase } from '@sichos-kodesh/catalog';
import {
  LIBRARY_ORDER,
  SEARCH_SCOPES,
  collectionYears,
  hasItemFilters,
  hebrewFullDateLabel,
  itemSubtitle,
  itemTitle,
  names,
  occasionFilter,
  occasionGroupName,
  occasionTitle,
  searchLibraryItems,
  searchNames,
  searchOccasions,
} from '@sichos-kodesh/app-core';
import type { ContentType, NameHit, SearchScope } from '@sichos-kodesh/app-core';
import { catalogStore, loadAllWorkContents, useCatalog, useLibrary, useWorks } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';
import { LibraryLoading } from './library/LibraryLoading';
import { readerPath, workPath } from './seforim/seforimPaths';

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
/** One scope's results render as plain rows; past this many, the list asks for a narrower search instead of growing (as on the phone). */
const RESULT_LIMIT = 200;
/** In "everything", each part shows this many, and a link to all of them. */
const PREVIEW = 4;

function isScope(value: string | null): value is SearchScope {
  return !!value && (SEARCH_SCOPES as readonly string[]).includes(value);
}

/**
 * One search for everything (the phone's SearchScreen): the farbrengens,
 * each collection of the library and the seforim's names, at once or one
 * of them (`?in=`). The query matches names in both languages, the whole
 * names the titles shorten, and where and when each was said; the filters
 * (year, month, day, mafteiach's parsha and moed) hold for all of them,
 * the content types only for the farbrengens. The library and the seforim
 * arrive in their own parts of the bundle; until they do, the farbrengens
 * are searched alone.
 *
 * The query text is deferred (`useDeferredValue`, not a manual debounce
 * timer) so fast typing on a slower device doesn't force a re-scan on every
 * keystroke, while still feeling instant on a fast one.
 */
export function SearchScreen() {
  const catalog = useCatalog();
  const library = useLibrary();
  const works = useWorks();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const [params, setParams] = useSearchParams();
  const requested = params.get('in');
  const scope: SearchScope = isScope(requested) ? requested : 'all';
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const [hdateMonth, setHdateMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [parshaSlug, setParshaSlug] = useState<string | null>(null);
  const [moedSlug, setMoedSlug] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [contentsReady, setContentsReady] = useState(false);

  const itemFilters = { hebrewYear, hdateMonth, day, parshaSlug, moedSlug };
  const filtered = hasItemFilters(itemFilters) || types.length > 0;
  const typed = deferredQuery.trim().length >= 2;
  const inScope = (part: SearchScope) => scope === 'all' || scope === part;
  // The seforim have no date, parsha or moed: a filter leaves them out.
  const seforimOpen = inScope('seforim') && !filtered;

  // Every sefer's chapters, for their names - loaded once the seforim are searched.
  useEffect(() => {
    if (!works || !seforimOpen || !typed || contentsReady) return;
    let alive = true;
    const done = () => alive && setContentsReady(true);
    loadAllWorkContents(works).then(done, done);
    return () => {
      alive = false;
    };
  }, [works, seforimOpen, typed, contentsReady]);

  const occasionIds = useMemo(
    () => (library ? occasionFilter([library.parshiyos.find((g) => g.slug === parshaSlug), library.moadim.find((g) => g.slug === moedSlug)]) : null),
    [library, parshaSlug, moedSlug],
  );
  const farbrengens = useMemo((): CatalogEntry[] => {
    if (!inScope('farbrengens') || (!deferredQuery.trim() && !filtered)) return [];
    return searchOccasions(catalog, { query: deferredQuery, hebrewYear, hdateMonth, day, parsha: null, specialDay: null, types, occasionIds }).flatMap((group) => group.entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, scope, deferredQuery, hebrewYear, hdateMonth, day, types, occasionIds]);
  const collections = useMemo((): Array<{ collection: LibraryCollectionId; items: LibraryItemBase[] }> => {
    // The content types say what a farbrengen has; they have nothing to say about the library.
    if (!library || types.length > 0) return [];
    return LIBRARY_ORDER.filter((collection) => inScope(collection)).map((collection) => ({
      collection,
      items: searchLibraryItems(library, collection, deferredQuery, { hebrewYear, hdateMonth, day, parshaSlug, moedSlug }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, scope, deferredQuery, hebrewYear, hdateMonth, day, parshaSlug, moedSlug, types]);
  const nameHits = useMemo(
    (): NameHit[] => (works && seforimOpen && typed ? searchNames(works, (id) => catalogStore.getWorkContents(id), deferredQuery) : []),
    [works, seforimOpen, typed, deferredQuery, contentsReady], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function toggleType(type: ContentType): void {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t2) => t2 !== type) : [...prev, type]));
  }

  function clearFilters(): void {
    setHebrewYear(null);
    setHdateMonth(null);
    setDay(null);
    setParshaSlug(null);
    setMoedSlug(null);
    setTypes([]);
  }

  function chooseScope(next: SearchScope): void {
    setParams(next === 'all' ? {} : { in: next }, { replace: true });
    // A year one part has may not be in the next; the content types are the farbrengens' own.
    if (library && next !== 'all' && next !== 'farbrengens' && next !== 'seforim' && hebrewYear != null && !collectionYears(library, next).includes(hebrewYear)) setHebrewYear(null);
    if (next !== 'all' && next !== 'farbrengens') setTypes([]);
  }

  const scopeName = (part: SearchScope): string =>
    part === 'all' ? t.searchScopeAll : part === 'farbrengens' ? t.searchScopeFarbrengens : part === 'seforim' ? t.searchScopeSeforim : t.collectionNames[part];
  const years = useMemo(
    () => (scope === 'all' || scope === 'farbrengens' || scope === 'seforim' || !library ? browsableYears(catalog) : collectionYears(library, scope)),
    [catalog, library, scope],
  );
  const typeOptions: Array<{ value: ContentType; label: string }> = [
    { value: 'audio', label: t.audioTypeLabel },
    { value: 'hanacha', label: t.hanachaTypeLabel },
    ...PDF_SECTION_ORDER.map((section) => ({ value: section, label: t.sectionLabels[section] })),
  ];
  const filterCount = [hebrewYear, hdateMonth, day, parshaSlug, moedSlug].filter((value) => value != null).length + types.length;
  const active = deferredQuery.trim() !== '' || filtered;
  const total = farbrengens.length + collections.reduce((n, c) => n + c.items.length, 0) + nameHits.length;
  const everything = scope === 'all';
  const limit = everything ? PREVIEW : RESULT_LIMIT;
  const waiting = (!library && scope !== 'farbrengens' && scope !== 'seforim') || (!works && seforimOpen);

  const sectionHeader = (part: SearchScope, count: number) => (
    <div className="search-section-head">
      <h2 className="category-header">{`${scopeName(part)} · ${count}`}</h2>
      {everything && count > PREVIEW && (
        <button type="button" className="search-show-all" onClick={() => chooseScope(part)}>
          {t.searchShowAll(count)}
        </button>
      )}
    </div>
  );
  const select = <T extends string | number>(label: string, value: T | null, options: Array<{ value: T; label: string }>, onChange: (value: T | null) => void) => (
    <label className="search-filter">
      <span className="search-filter-label">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          const found = options.find((option) => String(option.value) === raw);
          onChange(found ? found.value : null);
        }}
      >
        <option value="">{t.anyFilterOption}</option>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="screen">
      <ScreenHeader title={t.searchTitle} />
      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchEverythingPlaceholder}
        aria-label={t.searchEverythingPlaceholder}
        dir="auto"
        autoFocus
      />

      {/* Where to look: everything, or one part. */}
      <div className="search-type-pills search-scopes" role="group" aria-label={t.searchInLabel}>
        {SEARCH_SCOPES.map((part) => (
          <button key={part} type="button" aria-pressed={scope === part} className={scope === part ? 'search-type-pill search-type-pill-active' : 'search-type-pill'} onClick={() => chooseScope(part)}>
            {scopeName(part)}
          </button>
        ))}
      </div>

      <div className="search-filter-bar">
        <button type="button" className={filterCount > 0 ? 'search-filter-toggle search-filter-toggle-on' : 'search-filter-toggle'} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
          <SlidersHorizontal size={16} aria-hidden />
          {filterCount > 0 ? t.searchFiltersCount(filterCount) : t.searchFiltersLabel}
        </button>
        {filterCount > 0 && (
          <button type="button" className="search-clear-link" onClick={clearFilters}>
            {t.clearFiltersLabel}
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="search-filter-panel">
          <div className="search-filters">
            {select(t.yearFilterLabel, hebrewYear, years.map((year) => ({ value: year, label: hebrewYearLabel(year, language) })), setHebrewYear)}
            {select(
              t.monthFilterLabel,
              hdateMonth,
              MAFTEIACH_MONTH_OPTIONS.map((month) => ({ value: month.hdateMonth, label: language === 'he' ? month.nameHebrew : month.name })),
              setHdateMonth,
            )}
            {select(t.dayFilterLabel, day, DAYS.map((d) => ({ value: d, label: language === 'he' ? gematriya(d) : String(d) })), setDay)}
            {library && select(t.parshaFilterLabel, parshaSlug, library.parshiyos.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) })), setParshaSlug)}
            {library && select(t.moedFilterLabel, moedSlug, library.moadim.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) })), setMoedSlug)}
          </div>
          {(scope === 'all' || scope === 'farbrengens') && (
            <>
              <p className="search-filter-label search-type-label">{t.searchTypesFarbrengensOnly}</p>
              <div className="search-type-pills">
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={types.includes(option.value)}
                    className={types.includes(option.value) ? 'search-type-pill search-type-pill-active' : 'search-type-pill'}
                    onClick={() => toggleType(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!active && <p className="tab-help">{t.searchEverythingHelp}</p>}
      {active && <p className="subtitle search-results-count">{t.searchResultsCount(total)}</p>}
      {active && total === 0 && !waiting && <p className="gap-message">{t.searchNothingAnywhere}</p>}
      {active && waiting && <LibraryLoading />}

      {farbrengens.length > 0 && (
        <section>
          {sectionHeader('farbrengens', farbrengens.length)}
          <ul className="year-list">
            {farbrengens.slice(0, limit).map((entry) => (
              <li key={`${entry.hebrewYear}-${entry.occasionId}`}>
                <Link className="year-row library-item-row" to={`/browse/${entry.hebrewYear}/${entry.occasionId}`}>
                  <span className="library-item-text">
                    <span className="year-row-year">{occasionTitle(entry, language)}</span>
                    <span className="library-item-subtitle">{hebrewFullDateLabel(entry.hebrewDate, entry.hebrewYear, language)}</span>
                  </span>
                  <span className="year-row-trailing">
                    <OccasionRowIcon entry={entry} progressMap={progressMap} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!everything && farbrengens.length > limit && <p className="gap-message">{t.searchShowingFirst(limit, farbrengens.length)}</p>}
        </section>
      )}

      {collections.map(({ collection, items }) =>
        items.length === 0 ? null : (
          <section key={collection}>
            {sectionHeader(collection, items.length)}
            <ul className="year-list">
              {items.slice(0, limit).map((item) => {
                const subtitle = itemSubtitle(collection, item, language);
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
            {!everything && items.length > limit && <p className="gap-message">{t.searchShowingFirst(limit, items.length)}</p>}
          </section>
        ),
      )}

      {nameHits.length > 0 && (
        <section>
          {sectionHeader('seforim', nameHits.length)}
          <ul className="year-list">
            {nameHits.slice(0, limit).map((hit) => (
              <li key={hit.unit ? `${hit.work.id}/${hit.unit.id}` : hit.work.id}>
                <Link className="year-row" to={hit.unit ? readerPath(hit.work.id, hit.unit.id) : workPath(hit.work.id)}>
                  <span className="year-row-year">
                    {hit.unit ? `${names(hit.work.title, language)} · ${language === 'en' ? (hit.unit.labelEn ?? hit.unit.label) : hit.unit.label}` : names(hit.work.title, language)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
