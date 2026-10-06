import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { CatalogWork, CatalogWorkSource, LibraryCollectionId } from '@chassidushub-reader/catalog';
import { LIBRARY_COLLECTION_IDS, catalogUnit } from '@chassidushub-reader/catalog';
import { HOME_WORK_IDS, contentsAt, mayRead, names, sharedLabels, unitCount, unitsAreLetters, workKind, workScans } from '@chassidushub-reader/app-core';
import { editionUrl } from '@chassidushub-reader/sefaria-index/reader';
import { useShelf, useWorkContents, useWorks } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { useReadingState } from '../../seforim/readingState';
import { LibraryLoading } from '../library/LibraryLoading';
import { ScanRow } from './HebrewBooksShelfScreen';
import { libraryCollectionPath, readerPath, rebbePath, seferPath } from '../../routes/links';
import { FixLinks } from '../../components/FixLinks';

type Translation = ReturnType<typeof useTranslation>['t'];

const LICENCE_NAMES: Readonly<Record<string, string>> = {
  'public-domain': 'Public domain',
  cc0: 'CC0',
  'cc-by': 'CC BY',
  'cc-by-nc': 'CC BY-NC',
};

const SOURCE_NAMES: Readonly<Record<string, string>> = { sefaria: 'Sefaria', chabadlibrary: 'chabadlibrary.org', hebrewbooks: 'HebrewBooks' };

function sourceLine(t: Translation, source: CatalogWorkSource): string {
  const language = source.language ? t.editionLanguages[source.language] : null;
  const licence = LICENCE_NAMES[source.licence];
  return [language, source.credit ?? source.version, licence].filter(Boolean).join(' · ');
}

function sourceUrl(source: CatalogWorkSource): string | null {
  return editionUrl({ source: source.source as 'sefaria', sourceId: source.sourceId, language: source.language, version: source.version });
}

/** How many scans show before "show all". */
const SCANS_SHOWN = 10;

/** The sources a sefer lists as editions: HebrewBooks' copy is its scans, listed on their own. */
function editionSources(work: CatalogWork): CatalogWorkSource[] {
  return work.sources.filter((source) => source.source !== 'hebrewbooks');
}

function Editions({ work }: { work: CatalogWork }) {
  const { t } = useTranslation();
  return (
    <div className="category">
      <h2 className="category-header">{t.workSources}</h2>
      <ul className="year-list">
        {editionSources(work).map((source, index) => {
          const url = sourceUrl(source);
          const body = (
            <span className="library-item-text">
              <span className="year-row-year">{SOURCE_NAMES[source.source] ?? source.source}</span>
              <span className="library-item-subtitle">{sourceLine(t, source)}</span>
            </span>
          );
          return (
            <li key={`${index}-${source.source}-${source.version ?? ''}`}>
              {url ? (
                <a className="year-row library-item-row" href={url} target="_blank" rel="noreferrer">
                  {body}
                  <span className="year-row-trailing">
                    <ExternalLink size={16} aria-hidden />
                  </span>
                </a>
              ) : (
                <div className="year-row library-item-row seforim-row-muted">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A sefer's scans on HebrewBooks, each opening on its page there; the first few until asked for all. */
function Scans({ workId }: { workId: string }) {
  const shelf = useShelf();
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const series = workScans(shelf, workId);
  const scans = series.flatMap((s) => s.scans.map((scan) => ({ scan, label: scan.volume ? (series.length > 1 ? `${s.title} · ${scan.volume}` : scan.volume) : scan.title })));
  if (scans.length === 0) return null;
  const shared = sharedLabels(scans.map(({ label }) => label));
  return (
    <div className="category">
      <h2 className="category-header">{t.workScans}</h2>
      <ul className="year-list">
        {(all ? scans : scans.slice(0, SCANS_SHOWN)).map(({ scan, label }) => (
          <ScanRow key={scan.id} scan={scan} label={label} printed={shared.has(label)} />
        ))}
        {!all && scans.length > SCANS_SHOWN && (
          <li>
            <button type="button" className="year-row" onClick={() => setAll(true)}>
              <span className="year-row-year">{t.workScansAll(scans.length)}</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

interface Props {
  workId: string;
  /** The part of its contents shown, as indexes into the tree (routes/links.ts's `seferPath`). */
  path: readonly number[];
}

/**
 * One sefer: who wrote it, where the reader left off, its contents (a part
 * at a time, down to the chapters that open in the reader), and its
 * editions with where each may be read.
 */
export function WorkScreen({ workId, path }: Props) {
  const works = useWorks();
  const shelf = useShelf();
  const reading = useReadingState();
  const { t, language } = useTranslation();
  const work = works?.works.find((w) => w.id === workId);
  const contents = useWorkContents(workId, !!work?.units);
  const unitsById = useMemo(() => new Map((contents?.units ?? []).map((unit) => [unit.id, unit])), [contents]);
  // Up a part, else to its Rebbe's seforim - or the shelf, for the Rebbe's own seforim that stand on it.
  const back = path.length > 0 ? seferPath(workId, path.slice(0, -1)) : work && works && !HOME_WORK_IDS.includes(work.id) ? rebbePath(work.authors.find((id) => works.authors.some((author) => author.id === id)) ?? null) : '/library';

  if (!works || contents === undefined) {
    return (
      <div className="screen">
        <ScreenHeader to={back} title={work ? names(work.title, language) : t.seforimTitle} />
        <LibraryLoading />
      </div>
    );
  }
  if (!work) {
    return (
      <div className="screen">
        <ScreenHeader to="/library" title={t.seforimTitle} />
        <div className="empty-state">
          <p className="empty-state-text">{t.workNotFound}</p>
        </div>
      </div>
    );
  }

  const kind = workKind(work);
  const part = contents ? contentsAt(contents, path) : null;
  const trail = part?.trail ?? [];
  const title = trail.length > 0 ? names(trail[trail.length - 1]!.title, language) : names(work.title, language);
  const authorNames = work.authors
    .map((id) => works.authors.find((a) => a.id === id))
    .filter((a) => !!a)
    .map((a) => names(a!.name, language));
  const place = reading.places[workId];
  const placeUnit = place && contents ? catalogUnit(contents, place.unitId) : undefined;
  // Inside a part, a chapter's label without the part's own names in front.
  const prefix = trail.map((node) => `${names(node.title, language)}, `).join('');
  const unitLabel = (unitId: string) => {
    const unit = unitsById.get(unitId);
    const label = unit ? (language === 'en' ? (unit.labelEn ?? unit.label) : unit.label) : unitId;
    return prefix && label.startsWith(prefix) ? label.slice(prefix.length) : label;
  };
  const collection = work.collection && (LIBRARY_COLLECTION_IDS as readonly string[]).includes(work.collection) ? (work.collection as LibraryCollectionId) : null;
  const editions = editionSources(work).length > 0 && kind !== 'collection' ? <Editions work={work} /> : null;
  const onlyScans = workScans(shelf, workId).length > 0 && !work.sources.some((source) => sourceUrl(source));

  return (
    <div className="screen">
      <ScreenHeader to={back} title={title} />
      {path.length === 0 && (
        <>
          <h1 className="library-item-title">{names(work.title, language)}</h1>
          {authorNames.length > 0 && <p className="subtitle">{authorNames.join(', ')}</p>}
          {kind === 'read' && <p className="tab-help">{work.sources.some((s) => s.source === 'sefaria' && mayRead(s)) ? t.workReadOnline : t.workReadOnlineHosted}</p>}
          {kind === 'links' && <p className="tab-help">{onlyScans ? t.workNoTextScans : t.workNoText}</p>}
          {collection && (
            <Link className="button" to={libraryCollectionPath(collection)}>
              {t.workOpenCollection}
            </Link>
          )}
          {place && placeUnit && (
            <Link className="category-row" to={readerPath(workId, place.unitId, place.source)}>
              <span className="category-row-name">{t.seforimContinue}</span>
              <span className="category-row-count">{language === 'en' ? (placeUnit.labelEn ?? placeUnit.label) : placeUnit.label}</span>
            </Link>
          )}
          {kind !== 'read' && editions}
          {kind !== 'read' && <Scans workId={workId} />}
        </>
      )}

      {part && (
        <>
          {path.length === 0 && part.entries.length > 0 && <h2 className="category-header">{names(work.title, language)}</h2>}
          <ul className="year-list">
            {part.entries.map((entry, index) =>
              'unitId' in entry ? (
                <li key={entry.unitId}>
                  <Link className={place?.unitId === entry.unitId ? 'year-row year-row-selected' : 'year-row'} to={readerPath(workId, entry.unitId)}>
                    <span className="year-row-year">{unitLabel(entry.unitId)}</span>
                  </Link>
                </li>
              ) : (
                <li key={`part-${index}`}>
                  <Link className="year-row" to={seferPath(workId, [...path, index])}>
                    <span className="year-row-year">{names(entry.title, language)}</span>
                    <span className="year-row-distance">{t.workPartOf(unitCount(entry), unitsAreLetters(work))}</span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {kind === 'read' && path.length === 0 && editions}
      {kind === 'read' && path.length === 0 && <Scans workId={workId} />}
      {path.length === 0 && <FixLinks target={{ work: workId }} />}
    </div>
  );
}
