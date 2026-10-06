import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, FileText, PenLine } from 'lucide-react';
import { farbrengenTexts, neighborOccasions, occasionDescription, occasionMarks, occasionTitle, occasionWeekday, preferredHanachaEdition } from '@sichos-kodesh/app-core';
import type { CatalogPdf } from '@sichos-kodesh/catalog';
import { occasionParsha } from '@sichos-kodesh/catalog';
import { IL } from '../config';
import { useCatalog } from '../catalog/catalogStore';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { FARBRENGEN_AUDIO_ANCHOR, FARBRENGEN_TEXTS_ANCHOR, farbrengenPath, farbrengenPdfPath } from '../routes/links';
import { useReadHanacha } from '../player/useReadHanacha';
import { useRecordVisit } from '../player/useRecordVisit';
import { useProgressMap } from '../player/useProgressMap';
import { useDownload } from '../download/useDownload';
import { isRtlLanguage, useTranslation } from '../i18n/useLanguage';
import { hebrewFullDateLabel, parshaLabel } from '../utils/formatHebrewDate';
import { formatDuration } from '../utils/formatDuration';
import { BackLink } from '../components/BackLink';
import { ChapterList } from '../components/ChapterList';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionActions } from '../components/OccasionActions';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';

interface Props {
  resolved: ResolvedEntry | null;
}

/**
 * A farbrengen's one page (docs: the UI/UX redo plan, "A farbrengen"), at
 * one address however it was reached (routes/links.ts). It opens on what
 * it holds: when and what it was, then Play - every chapter as one queue,
 * the chapters right under it - then its texts, each row opening its PDF:
 * the hanachos first, in the preferred edition with the other right below
 * it, then the mugah, maamorim, hagahos and hosafos. Around it: this
 * occasion in every year, and the farbrengens before and after it.
 */
export function FarbrengenScreen({ resolved }: Props) {
  const { t, language } = useTranslation();
  const catalog = useCatalog();
  const progressMap = useProgressMap();
  const { settings } = useDownload();
  const readHanacha = useReadHanacha();
  const { hash } = useLocation();
  useRecordVisit(resolved?.entry);
  const entry = resolved?.entry;
  const neighbors = useMemo(() => (entry ? neighborOccasions(catalog, entry.hebrewYear, entry.occasionId) : null), [catalog, entry]);

  // An old recordings or category address lands here on its section (see canonicalFarbrengenPath).
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash, entry]);

  if (!resolved || !entry) {
    return (
      <div className="screen">
        <BackLink to="/farbrengens" />
        <p className="gap-message">{t.occasionNotFound}</p>
      </div>
    );
  }

  const { backPath } = resolved;
  const texts = farbrengenTexts(entry, preferredHanachaEdition(settings.contentTypes.hanachaEditions));
  const marks = occasionMarks(entry);
  const weekday = occasionWeekday(entry.hebrewDate, language);
  const parsha = occasionParsha(entry.hebrewDate, IL);
  const hasTexts = texts.hanachos.length > 0 || texts.groups.length > 0;
  const isEmpty = entry.audio.length === 0 && !hasTexts;
  const Prev = isRtlLanguage(language) ? ChevronRight : ChevronLeft;
  const Next = isRtlLanguage(language) ? ChevronLeft : ChevronRight;

  const pdfRow = (pdf: CatalogPdf, hanacha = false) => (
    <li key={pdf.driveFileId}>
      <Link className="text-row" to={farbrengenPdfPath(entry.hebrewYear, entry.occasionId, pdf.driveFileId)} onClick={hanacha ? () => readHanacha(entry) : undefined}>
        <FileText size={18} className="text-row-icon" aria-hidden />
        <span className="text-row-label">{pdf.label}</span>
      </Link>
    </li>
  );

  return (
    <div className="screen">
      <ScreenHeader to={backPath} title={occasionTitle(entry, language)} />
      {/* The whole name, where the header shortens it - a yechidus says here who it was for. */}
      {occasionDescription(entry, language) && <p className="item-description">{occasionDescription(entry, language)}</p>}
      <p className="farbrengen-date">
        {[weekday, hebrewFullDateLabel(entry.hebrewDate, entry.hebrewYear, language), parsha ? t.homeParsha(parshaLabel(parsha, language)) : null].filter(Boolean).join(' · ')}
      </p>
      {(marks.durationMs > 0 || marks.hanacha || marks.mugah) && (
        <ul className="farbrengen-marks" aria-label={t.farbrengenHas}>
          {marks.durationMs > 0 && (
            <li>
              <Clock size={14} aria-hidden />
              {formatDuration(marks.durationMs / 1000)}
            </li>
          )}
          {marks.hanacha && (
            <li>
              <FileText size={14} aria-hidden />
              {t.markHanacha}
            </li>
          )}
          {marks.mugah && (
            <li>
              <PenLine size={14} aria-hidden />
              {t.markMugah}
            </li>
          )}
        </ul>
      )}

      <OccasionActions entry={entry} />

      {isEmpty && <p className="gap-message">{t.nothingDownloadable}</p>}

      {entry.audio.length > 0 && (
        <section className="farbrengen-section" id={FARBRENGEN_AUDIO_ANCHOR} aria-labelledby="farbrengen-audio-title">
          <div className="playlist-header">
            <div className="playlist-header-main">
              <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="large" />
              <div className="playlist-header-copy">
                <h2 className="playlist-header-title" id="farbrengen-audio-title">
                  {t.recordings}
                </h2>
                <p className="playlist-header-subtitle">
                  {t.recordingsCount(entry.audio.length)} · {formatDuration(marks.durationMs / 1000)}
                </p>
              </div>
            </div>
          </div>
          <ChapterList entry={entry} progressMap={progressMap} />
        </section>
      )}

      {hasTexts && (
        <section className="farbrengen-section" id={FARBRENGEN_TEXTS_ANCHOR} aria-labelledby="farbrengen-texts-title">
          <h2 className="category-header" id="farbrengen-texts-title">
            {t.texts}
          </h2>
          {texts.hanachos.length > 0 && <ul className="text-list">{texts.hanachos.map((pdf) => pdfRow(pdf, true))}</ul>}
          {texts.groups.map((group) => (
            <div key={group.section} className="text-group">
              <h3 className="text-group-title">{t.sectionLabels[group.section]}</h3>
              <ul className="text-list">{group.pdfs.map((pdf) => pdfRow(pdf))}</ul>
            </div>
          ))}
        </section>
      )}

      <section className="farbrengen-section">
        <Link className="category-row" to={`/occasion-all-years/${entry.hebrewYear}/${entry.occasionId}`}>
          <span className="category-row-name">{t.thisOccasionAllYears}</span>
        </Link>
        {neighbors && (neighbors.previous || neighbors.next) && (
          <nav className="farbrengen-neighbors" aria-label={t.farbrengenNeighbors}>
            {neighbors.previous ? (
              <Link className="farbrengen-neighbor" to={farbrengenPath(neighbors.previous.hebrewYear, neighbors.previous.occasionId)} rel="prev">
                <Prev size={18} aria-hidden />
                <span className="farbrengen-neighbor-text">
                  <span className="farbrengen-neighbor-label">{t.previousFarbrengen}</span>
                  <span className="farbrengen-neighbor-title">{occasionTitle(neighbors.previous, language)}</span>
                </span>
              </Link>
            ) : (
              <span />
            )}
            {neighbors.next && (
              <Link className="farbrengen-neighbor farbrengen-neighbor-next" to={farbrengenPath(neighbors.next.hebrewYear, neighbors.next.occasionId)} rel="next">
                <span className="farbrengen-neighbor-text">
                  <span className="farbrengen-neighbor-label">{t.nextFarbrengen}</span>
                  <span className="farbrengen-neighbor-title">{occasionTitle(neighbors.next, language)}</span>
                </span>
                <Next size={18} aria-hidden />
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
