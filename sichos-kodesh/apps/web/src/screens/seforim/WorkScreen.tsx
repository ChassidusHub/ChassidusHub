import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { CatalogWork, CatalogWorkSource, LibraryCollectionId } from '@sichos-kodesh/catalog';
import { LIBRARY_COLLECTION_IDS, catalogUnit } from '@sichos-kodesh/catalog';
import { contentsAt, names, unitCount, workKind } from '@sichos-kodesh/app-core';
import { editionUrl } from '@sichos-kodesh/sefaria-index/reader';
import { useWorkContents, useWorks } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { useReadingState } from '../../seforim/readingState';
import { LibraryLoading } from '../library/LibraryLoading';
import { readerPath, workPath } from './seforimPaths';

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

function Editions({ work }: { work: CatalogWork }) {
  const { t } = useTranslation();
  return (
    <div className="category">
      <h2 className="category-header">{t.workSources}</h2>
      <ul className="year-list">
        {work.sources.map((source, index) => {
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

interface Props {
  workId: string;
}

/**
 * One sefer: who wrote it, where the reader left off, its contents (a part
 * at a time, down to the chapters that open in the reader), and its
 * editions with where each may be read.
 */
export function WorkScreen({ workId }: Props) {
  const works = useWorks();
  const reading = useReadingState();
  const { t, language } = useTranslation();
  const [params] = useSearchParams();
  const path = useMemo(() => (params.get('path') ?? '').split('.').filter((s) => /^\d+$/.test(s)).map(Number), [params]);
  const work = works?.works.find((w) => w.id === workId);
  const contents = useWorkContents(workId, !!work?.units);
  const unitsById = useMemo(() => new Map((contents?.units ?? []).map((unit) => [unit.id, unit])), [contents]);
  const back = path.length > 0 ? workPath(workId, path.slice(0, -1)) : '/seforim';

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
        <ScreenHeader to="/seforim" title={t.seforimTitle} />
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
  const editions = work.sources.length > 0 && kind !== 'collection' ? <Editions work={work} /> : null;

  return (
    <div className="screen">
      <ScreenHeader to={back} title={title} />
      {path.length === 0 && (
        <>
          <h1 className="library-item-title">{names(work.title, language)}</h1>
          {authorNames.length > 0 && <p className="subtitle">{authorNames.join(', ')}</p>}
          {kind === 'read' && <p className="tab-help">{t.workReadOnline}</p>}
          {kind === 'links' && <p className="tab-help">{t.workNoText}</p>}
          {collection && (
            <Link className="button" to={`/library/c/${collection}`}>
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
                  <Link className="year-row" to={workPath(workId, [...path, index])}>
                    <span className="year-row-year">{names(entry.title, language)}</span>
                    <span className="year-row-distance">{t.workPartOf(unitCount(entry))}</span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {kind === 'read' && path.length === 0 && editions}
    </div>
  );
}
