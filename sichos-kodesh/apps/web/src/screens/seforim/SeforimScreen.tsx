import { Fragment, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookText, ExternalLink, Library, Search } from 'lucide-react';
import type { CatalogWork, LibraryCollectionId } from '@sichos-kodesh/catalog';
import { catalogUnit } from '@sichos-kodesh/catalog';
import { authorShelf, names, scanCount, shelfSections, unitsAreLetters, workKind, workScans } from '@sichos-kodesh/app-core';
import type { SeforimShelf } from '@sichos-kodesh/app-core';
import { catalogStore, useShelf, useWorks } from '../../catalog/catalogStore';
import { COLLECTION_ICONS } from '../../components/collectionIcons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Segmented } from '../../components/settings/SettingsControls';
import { useTranslation } from '../../i18n/useLanguage';
import { recentPlaces, useReadingState } from '../../seforim/readingState';
import { LibraryLoading } from '../library/LibraryLoading';
import { readerPath, shelfPath } from './seforimPaths';

/**
 * The seforim (catalog schema 3) on two shelves: what opens here - the
 * texts, and the library's PDFs - and what opens on other sites
 * (`?shelf=links`). Each shelf goes by Rebbe - the Baal Shem Tov and the
 * Maggid, the Alter Rebbe to the Rebbe - his seforim as tiles, like the
 * home page's. Igros Kodesh has a tile of its own on the home page, and is
 * not here. Same as the phone's.
 */
export function SeforimScreen() {
  const works = useWorks();
  const shelf = useShelf();
  const reading = useReadingState();
  const { t, language } = useTranslation();
  const [params, setParams] = useSearchParams();
  const shown: SeforimShelf = params.get('shelf') === 'links' ? 'links' : 'text';
  const sections = useMemo(() => (works ? shelfSections(works, shown, (authorId) => scanCount(authorShelf(shelf, authorId)) > 0) : []), [shelf, shown, works]);
  const byId = useMemo(() => new Map((works?.works ?? []).map((w) => [w.id, w])), [works]);
  const recent = recentPlaces(reading).filter(({ workId }) => byId.has(workId));
  const bookmarks = reading.bookmarks.filter((b) => byId.has(b.workId));

  const pick = (next: SeforimShelf) => setParams(next === 'links' ? { shelf: 'links' } : {}, { replace: true });

  // A unit's name when its sefer's chapters are already loaded; its sefer's name alone otherwise.
  const placeLabel = (workId: string, unitId: string) => {
    const work = byId.get(workId)!;
    const contents = catalogStore.getWorkContents(workId);
    const unit = contents ? catalogUnit(contents, unitId) : undefined;
    const label = unit ? (language === 'en' ? (unit.labelEn ?? unit.label) : unit.label) : null;
    return label ? `${names(work.title, language)} · ${label}` : names(work.title, language);
  };

  const meta = (work: CatalogWork): string => {
    switch (workKind(work)) {
      case 'read':
        return t.seforimChapters(work.units ?? 0, unitsAreLetters(work));
      case 'collection':
        return t.seforimInLibrary;
      case 'links': {
        const scans = scanCount(workScans(shelf, work.id));
        return scans > 0 ? t.seforimScans(scans) : t.seforimLink;
      }
      default:
        return '';
    }
  };

  const iconOf = (work: CatalogWork) => (workKind(work) === 'links' ? ExternalLink : (work.collection && COLLECTION_ICONS[work.collection as LibraryCollectionId]) || BookText);

  return (
    <div className="screen">
      <ScreenHeader to="/library" title={t.seforimTitle} />
      <p className="tab-help">{t.seforimHelp}</p>
      <Link className="category-row" to="/search?in=seforim">
        <span className="category-row-name">{t.seforimSearchRow}</span>
        <span className="category-row-trailing">
          <Search size={18} aria-hidden />
        </span>
      </Link>
      <div className="seforim-shelves">
        <Segmented<SeforimShelf>
          label={t.seforimShelves}
          value={shown}
          onChange={pick}
          options={[
            { value: 'text', label: t.seforimShelfText },
            { value: 'links', label: t.seforimShelfLinks },
          ]}
        />
      </div>

      {!works && <LibraryLoading />}

      {shown === 'text' && recent.length > 0 && (
        <div className="category">
          <h2 className="category-header">{t.seforimContinue}</h2>
          <ul className="year-list">
            {recent.map(({ workId, place }) => (
              <li key={workId}>
                <Link className="year-row" to={readerPath(workId, place.unitId, place.source)}>
                  <span className="year-row-year">{placeLabel(workId, place.unitId)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown === 'text' && bookmarks.length > 0 && (
        <div className="category">
          <h2 className="category-header">{t.seforimBookmarks}</h2>
          <ul className="year-list">
            {bookmarks.map((b) => (
              <li key={`${b.workId}/${b.unitId}`}>
                <Link className="year-row" to={readerPath(b.workId, b.unitId)}>
                  <span className="year-row-year">{placeLabel(b.workId, b.unitId)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sections.map((section) => {
        const authorId = section.author?.id ?? null;
        const scans = shown === 'links' ? scanCount(authorShelf(shelf, authorId)) : 0;
        return (
          <Fragment key={authorId ?? 'others'}>
            <h2 className="category-header">{section.author ? names(section.author.name, language) : t.seforimOtherAuthors}</h2>
            <div className="home-tiles">
              {section.works.map((work) => {
                const Glyph = iconOf(work);
                return (
                  <Link key={work.id} className="home-tile" to={`/seforim/${encodeURIComponent(work.id)}`}>
                    <span className="home-tile-well">
                      <Glyph size={20} aria-hidden />
                    </span>
                    <span className="home-tile-name">{names(work.title, language)}</span>
                    <span className="home-tile-blurb">{meta(work)}</span>
                  </Link>
                );
              })}
              {scans > 0 && (
                <Link className="home-tile" to={shelfPath(authorId)}>
                  <span className="home-tile-well">
                    <Library size={20} aria-hidden />
                  </span>
                  <span className="home-tile-name">{authorId ? t.shelfRow : t.shelfOthersRow}</span>
                  <span className="home-tile-blurb">{t.shelfBooks(scans)}</span>
                </Link>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
