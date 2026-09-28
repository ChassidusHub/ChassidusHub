import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Sparkles, X } from 'lucide-react';
import { gematriya } from '@hebcal/core';
import { MAFTEIACH_MONTH_OPTIONS, PDF_SECTION_ORDER, browsableYears, currentParsha } from '@sichos-kodesh/catalog';
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
  occasionParshaSlugs,
  occasionTitle,
  searchLibraryItems,
  searchNames,
  searchOccasions,
} from '@sichos-kodesh/app-core';
import type { ContentType, NameHit, SearchScope } from '@sichos-kodesh/app-core';
import { IL } from '../config';
import { catalogStore, loadAllWorkContents, useCatalog, useLibrary, useWorks } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { SettingsSheet } from '../components/SettingsSheet';
import { hebrewYearLabel, parshaLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useRecentSearches } from '../settings/useRecentSearches';
import { isRtlLanguage, useTranslation } from '../i18n/useLanguage';
import { LibraryLoading } from './library/LibraryLoading';
import { farbrengenPath, libraryItemPath, readerPath, seferPath } from '../routes/links';

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
/** One part's results render as plain rows; past this many, the list asks for a narrower search instead of growing (as on the phone). */
const RESULT_LIMIT = 200;
/** Searching more than one part, each shows this many, under a heading that narrows to all of them. */
const PREVIEW = 4;

/** Where to look: everything, one part, or the library - every part but the farbrengens (the Library tab's own search box). */
type Scope = SearchScope | 'library';
const SCOPES: readonly Scope[] = ['all', 'farbrengens', 'library', ...SEARCH_SCOPES.filter((part) => part !== 'all' && part !== 'farbrengens')];

function isScope(value: string | null): value is Scope {
  return !!value && (SCOPES as readonly string[]).includes(value);
}

type SheetName = 'kind' | 'year' | 'month' | 'parsha' | 'moed' | 'types';

interface ChipProps {
  label: string;
  active: boolean;
  onOpen: () => void;
  onClear: () => void;
  clearLabel: string;
}

/** One filter (the redo plan's "חיפוש"): its value when set, a tap opens its short list, and × takes it off. */
function FilterChip({ label, active, onOpen, onClear, clearLabel }: ChipProps) {
  return (
    <span className={active ? 'search-chip search-chip-on' : 'search-chip'}>
      <button type="button" className="search-chip-open" onClick={onOpen} aria-haspopup="dialog">
        <span>{label}</span>
        {!active && <ChevronDown size={14} aria-hidden />}
      </button>
      {active && (
        <button type="button" className="search-chip-clear" onClick={onClear} aria-label={`${clearLabel}: ${label}`}>
          <X size={14} aria-hidden />
        </button>
      )}
    </span>
  );
}

interface Option<T> {
  value: T;
  label: string;
}

/** A filter's choices, in the sheet it opens: "any" first, the chosen one checked. */
function OptionList<T extends string | number>({ options, value, anyLabel, onPick }: { options: Array<Option<T>>; value: T | null; anyLabel?: string; onPick: (value: T | null) => void }) {
  const row = (key: string, label: string, on: boolean, pick: () => void) => (
    <li key={key}>
      <button type="button" className={on ? 'sheet-option sheet-option-on' : 'sheet-option'} aria-pressed={on} onClick={pick}>
        <span>{label}</span>
        {on && <Check size={18} aria-hidden />}
      </button>
    </li>
  );
  return (
    <ul className="sheet-options">
      {anyLabel !== undefined && row('any', anyLabel, value == null, () => onPick(null))}
      {options.map((option) => row(String(option.value), option.label, option.value === value, () => onPick(option.value)))}
    </ul>
  );
}

/**
 * One search for everything (docs: the UI/UX redo plan, "חיפוש"; the
 * phone's SearchScreen): one box, and under it the filters as chips - where
 * to look, the year, the month and day, mafteiach's parsha and moed, and
 * what a farbrengen has - each opening a short list. Before anything is
 * typed: the searches made lately, and this week's parsha. The results
 * come grouped by kind with their counts; a group's heading narrows the
 * search to it. `?in=` names where to look (`library` - every part but the
 * farbrengens - is the Library tab's own search), `?q=` what to look for.
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
  const { recent, remember, clear: clearRecent } = useRecentSearches();
  const [params, setParams] = useSearchParams();
  const requested = params.get('in');
  const scope: Scope = isScope(requested) ? requested : 'all';
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const deferredQuery = useDeferredValue(query);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const [hdateMonth, setHdateMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [parshaSlug, setParshaSlug] = useState<string | null>(null);
  const [moedSlug, setMoedSlug] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [contentsReady, setContentsReady] = useState(false);
  const Chevron = isRtlLanguage(language) ? ChevronLeft : ChevronRight;

  const itemFilters = { hebrewYear, hdateMonth, day, parshaSlug, moedSlug };
  const filtered = hasItemFilters(itemFilters) || types.length > 0;
  const typed = deferredQuery.trim().length >= 2;
  const inScope = (part: SearchScope) => scope === 'all' || scope === part || (scope === 'library' && part !== 'farbrengens');
  const farbrengensOpen = scope === 'all' || scope === 'farbrengens';
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

  // This week's parsha, as a filter to try before typing.
  const weekParsha = useMemo(() => {
    if (!library) return null;
    const { parsha } = currentParsha(IL);
    const slug = occasionParshaSlugs(library, parsha)[0];
    return slug && parsha ? { slug, name: parshaLabel(parsha, language) } : null;
  }, [library, language]);

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

  function chooseScope(next: Scope): void {
    const nextParams = new URLSearchParams(params);
    if (next === 'all') nextParams.delete('in');
    else nextParams.set('in', next);
    setParams(nextParams, { replace: true });
    // A year one part has may not be in the next; the content types are the farbrengens' own.
    if (library && next !== 'all' && next !== 'library' && next !== 'farbrengens' && next !== 'seforim' && hebrewYear != null && !collectionYears(library, next).includes(hebrewYear)) setHebrewYear(null);
    if (next !== 'all' && next !== 'farbrengens') setTypes([]);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    remember(query);
  }

  const scopeName = (part: Scope): string =>
    part === 'all'
      ? t.searchScopeAll
      : part === 'farbrengens'
        ? t.searchScopeFarbrengens
        : part === 'library'
          ? t.searchScopeLibrary
          : part === 'seforim'
            ? t.searchScopeSeforim
            : t.collectionNames[part];
  const years = useMemo(
    () => (scope === 'all' || scope === 'library' || scope === 'farbrengens' || scope === 'seforim' || !library ? browsableYears(catalog) : collectionYears(library, scope)),
    [catalog, library, scope],
  );
  const typeOptions: Array<Option<ContentType>> = [
    { value: 'audio', label: t.audioTypeLabel },
    { value: 'hanacha', label: t.hanachaTypeLabel },
    ...PDF_SECTION_ORDER.map((section) => ({ value: section, label: t.sectionLabels[section] })),
  ];
  const monthName = (hdate: number) => {
    const month = MAFTEIACH_MONTH_OPTIONS.find((m) => m.hdateMonth === hdate);
    return month ? (language === 'he' ? month.nameHebrew : month.name) : '';
  };
  const dayName = (d: number) => (language === 'he' ? gematriya(d) : String(d));
  const parshaGroup = library?.parshiyos.find((g) => g.slug === parshaSlug);
  const moedGroup = library?.moadim.find((g) => g.slug === moedSlug);
  const anyFilter = filtered || scope !== 'all';
  const active = deferredQuery.trim() !== '' || filtered;
  const total = farbrengens.length + collections.reduce((n, c) => n + c.items.length, 0) + nameHits.length;
  const grouped = scope === 'all' || scope === 'library';
  const limit = grouped ? PREVIEW : RESULT_LIMIT;
  const waiting = (!library && scope !== 'farbrengens' && scope !== 'seforim') || (!works && seforimOpen);
  const opened = () => remember(query);

  const sectionHeader = (part: SearchScope, count: number) =>
    grouped ? (
      <button type="button" className="search-group-head" onClick={() => chooseScope(part)}>
        <span className="search-group-name">{scopeName(part)}</span>
        <span className="search-group-count">{count}</span>
        <Chevron size={16} aria-hidden />
      </button>
    ) : (
      <h2 className="category-header">{`${scopeName(part)} · ${count}`}</h2>
    );
  const showAll = (part: SearchScope, count: number) =>
    grouped && count > PREVIEW ? (
      <button type="button" className="search-show-all" onClick={() => chooseScope(part)}>
        {t.searchShowAll(count)}
      </button>
    ) : null;

  const sheetTitle: Record<SheetName, string> = {
    kind: t.searchKindChip,
    year: t.yearFilterLabel,
    month: t.monthFilterLabel,
    parsha: t.parshaFilterLabel,
    moed: t.moedFilterLabel,
    types: t.searchContentsChip,
  };
  const pickAndClose =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setSheet(null);
    };

  return (
    <div className="screen">
      <ScreenHeader title={t.searchTitle} />
      <form role="search" onSubmit={submit}>
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={scope === 'library' ? t.searchLibraryEverythingPlaceholder : t.searchEverythingPlaceholder}
          aria-label={t.searchEverythingPlaceholder}
          dir="auto"
          autoFocus
          enterKeyHint="search"
        />
      </form>

      {/* The filters as chips: each opens its short list, × takes it off. */}
      <div className="search-chips" role="group" aria-label={t.searchFiltersLabel}>
        <FilterChip label={scope === 'all' ? t.searchKindChip : scopeName(scope)} active={scope !== 'all'} onOpen={() => setSheet('kind')} onClear={() => chooseScope('all')} clearLabel={t.clearFiltersLabel} />
        <FilterChip
          label={hebrewYear != null ? hebrewYearLabel(hebrewYear, language) : t.yearFilterLabel}
          active={hebrewYear != null}
          onOpen={() => setSheet('year')}
          onClear={() => setHebrewYear(null)}
          clearLabel={t.clearFiltersLabel}
        />
        <FilterChip
          label={hdateMonth != null ? [day != null ? dayName(day) : null, monthName(hdateMonth)].filter(Boolean).join(' ') : day != null ? `${t.dayFilterLabel} ${dayName(day)}` : t.monthFilterLabel}
          active={hdateMonth != null || day != null}
          onOpen={() => setSheet('month')}
          onClear={() => {
            setHdateMonth(null);
            setDay(null);
          }}
          clearLabel={t.clearFiltersLabel}
        />
        {library && (
          <FilterChip
            label={parshaGroup ? occasionGroupName(parshaGroup, language) : t.parshaFilterLabel}
            active={!!parshaGroup}
            onOpen={() => setSheet('parsha')}
            onClear={() => setParshaSlug(null)}
            clearLabel={t.clearFiltersLabel}
          />
        )}
        {library && (
          <FilterChip label={moedGroup ? occasionGroupName(moedGroup, language) : t.moedFilterLabel} active={!!moedGroup} onOpen={() => setSheet('moed')} onClear={() => setMoedSlug(null)} clearLabel={t.clearFiltersLabel} />
        )}
        {farbrengensOpen && (
          <FilterChip
            label={types.length > 0 ? t.searchContentsCount(types.length) : t.searchContentsChip}
            active={types.length > 0}
            onOpen={() => setSheet('types')}
            onClear={() => setTypes([])}
            clearLabel={t.clearFiltersLabel}
          />
        )}
        {anyFilter && (
          <button
            type="button"
            className="search-clear-link"
            onClick={() => {
              clearFilters();
              chooseScope('all');
            }}
          >
            {t.clearFiltersLabel}
          </button>
        )}
      </div>

      {sheet && (
        <SettingsSheet title={sheetTitle[sheet]} onClose={() => setSheet(null)}>
          {sheet === 'kind' && <OptionList options={SCOPES.map((part) => ({ value: part, label: scopeName(part) }))} value={scope} onPick={pickAndClose((value: Scope | null) => chooseScope(value ?? 'all'))} />}
          {sheet === 'year' && <OptionList options={years.map((year) => ({ value: year, label: hebrewYearLabel(year, language) }))} value={hebrewYear} anyLabel={t.anyFilterOption} onPick={pickAndClose(setHebrewYear)} />}
          {sheet === 'month' && (
            <>
              <OptionList options={MAFTEIACH_MONTH_OPTIONS.map((month) => ({ value: month.hdateMonth, label: monthName(month.hdateMonth) }))} value={hdateMonth} anyLabel={t.anyFilterOption} onPick={setHdateMonth} />
              <h3 className="sheet-subtitle">{t.dayFilterLabel}</h3>
              <div className="sheet-days">
                {DAYS.map((d) => (
                  <button key={d} type="button" className={day === d ? 'sheet-day sheet-day-on' : 'sheet-day'} aria-pressed={day === d} onClick={() => setDay(day === d ? null : d)}>
                    {dayName(d)}
                  </button>
                ))}
              </div>
            </>
          )}
          {sheet === 'parsha' && library && (
            <OptionList options={library.parshiyos.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) }))} value={parshaSlug} anyLabel={t.anyFilterOption} onPick={pickAndClose(setParshaSlug)} />
          )}
          {sheet === 'moed' && library && <OptionList options={library.moadim.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) }))} value={moedSlug} anyLabel={t.anyFilterOption} onPick={pickAndClose(setMoedSlug)} />}
          {sheet === 'types' && (
            <>
              <p className="tab-help">{t.searchTypesFarbrengensOnly}</p>
              <ul className="sheet-options">
                {typeOptions.map((option) => {
                  const on = types.includes(option.value);
                  return (
                    <li key={option.value}>
                      <button type="button" className={on ? 'sheet-option sheet-option-on' : 'sheet-option'} aria-pressed={on} onClick={() => toggleType(option.value)}>
                        <span>{option.label}</span>
                        {on && <Check size={18} aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </SettingsSheet>
      )}

      {/* Before anything is typed: the searches made lately, and this week's parsha to try. */}
      {!active && (
        <>
          {recent.length > 0 && (
            <section className="search-start" aria-labelledby="search-recent">
              <div className="search-start-head">
                <h2 className="category-header" id="search-recent">
                  {t.searchRecent}
                </h2>
                <button type="button" className="search-clear-link" onClick={clearRecent}>
                  {t.searchClearRecent}
                </button>
              </div>
              <ul className="text-list">
                {recent.map((item) => (
                  <li key={item}>
                    <button type="button" className="text-row" onClick={() => setQuery(item)}>
                      <Clock size={18} className="text-row-icon" aria-hidden />
                      <span className="text-row-label" dir="auto">
                        {item}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {weekParsha && (
            <section className="search-start" aria-labelledby="search-suggested">
              <h2 className="category-header" id="search-suggested">
                {t.searchSuggestions}
              </h2>
              <ul className="text-list">
                <li>
                  <button type="button" className="text-row" onClick={() => setParshaSlug(weekParsha.slug)}>
                    <Sparkles size={18} className="text-row-icon" aria-hidden />
                    <span className="text-row-label">{t.searchWeekParsha(weekParsha.name)}</span>
                  </button>
                </li>
              </ul>
            </section>
          )}
          <p className="tab-help">{scope === 'library' ? t.searchLibraryEverythingHelp : t.searchEverythingHelp}</p>
        </>
      )}
      {active && <p className="subtitle search-results-count">{t.searchResultsCount(total)}</p>}
      {active && total === 0 && !waiting && <p className="gap-message">{t.searchNothingAnywhere}</p>}
      {active && waiting && <LibraryLoading />}

      {farbrengens.length > 0 && (
        <section className="search-group">
          {sectionHeader('farbrengens', farbrengens.length)}
          <ul className="year-list">
            {farbrengens.slice(0, limit).map((entry) => (
              <li key={`${entry.hebrewYear}-${entry.occasionId}`}>
                <Link className="year-row library-item-row" to={farbrengenPath(entry.hebrewYear, entry.occasionId)} onClick={opened}>
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
          {showAll('farbrengens', farbrengens.length)}
          {!grouped && farbrengens.length > limit && <p className="gap-message">{t.searchShowingFirst(limit, farbrengens.length)}</p>}
        </section>
      )}

      {collections.map(({ collection, items }) =>
        items.length === 0 ? null : (
          <section key={collection} className="search-group">
            {sectionHeader(collection, items.length)}
            <ul className="year-list">
              {items.slice(0, limit).map((item) => {
                const subtitle = itemSubtitle(collection, item, language);
                return (
                  <li key={item.id}>
                    <Link className="year-row library-item-row" to={libraryItemPath(collection, item.id)} onClick={opened}>
                      <span className="library-item-text">
                        <span className="year-row-year">{itemTitle(collection, item, language)}</span>
                        {subtitle && <span className="library-item-subtitle">{subtitle}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {showAll(collection, items.length)}
            {!grouped && items.length > limit && <p className="gap-message">{t.searchShowingFirst(limit, items.length)}</p>}
          </section>
        ),
      )}

      {nameHits.length > 0 && (
        <section className="search-group">
          {sectionHeader('seforim', nameHits.length)}
          <ul className="year-list">
            {nameHits.slice(0, limit).map((hit) => (
              <li key={hit.unit ? `${hit.work.id}/${hit.unit.id}` : hit.work.id}>
                <Link className="year-row" to={hit.unit ? readerPath(hit.work.id, hit.unit.id) : seferPath(hit.work.id)} onClick={opened}>
                  <span className="year-row-year">
                    {hit.unit ? `${names(hit.work.title, language)} · ${language === 'en' ? (hit.unit.labelEn ?? hit.unit.label) : hit.unit.label}` : names(hit.work.title, language)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {showAll('seforim', nameHits.length)}
        </section>
      )}
    </div>
  );
}
