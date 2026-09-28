import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, WifiOff } from 'lucide-react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { currentParsha, resolveThisWeek, resolveThisWeekAllYears, todayHebrewDateLabel } from '@sichos-kodesh/catalog';
import { farbrengenTexts, findGroup, groupItems, itemTitle, lsParshaSlugs, occasionTitle, occasionWeekday, preferredHanachaEdition } from '@sichos-kodesh/app-core';
import { IL } from '../config';
import { useCatalog, useLibrary } from '../catalog/catalogStore';
import { ContinueSection } from '../components/ContinueSection';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDownload } from '../download/useDownload';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useProgressMap } from '../player/useProgressMap';
import { useReadHanacha } from '../player/useReadHanacha';
import { farbrengenPath, farbrengenPdfPath } from '../routes/links';
import { hebrewDayMonthLabel, hebrewYearLabel, parshaLabel } from '../utils/formatHebrewDate';
import { bestKviusYear, findSpecialAnniversaries } from '../utils/weekYears';
import { isRtlLanguage, useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
}

/** How many of the parsha's sichos the page shows before "all". */
const LS_PREVIEW = 3;

/** One of the kvius year's farbrengens this week, on the page itself: its name and day, Play, and its hanacha. */
function WeekCard({ entry }: { entry: CatalogEntry }) {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const readHanacha = useReadHanacha();
  const { settings } = useDownload();
  const hanacha = farbrengenTexts(entry, preferredHanachaEdition(settings.contentTypes.hanachaEditions)).hanachos[0];
  const weekday = occasionWeekday(entry.hebrewDate, language);
  return (
    <li className="week-card">
      <Link className="week-card-main" to={farbrengenPath(entry.hebrewYear, entry.occasionId)}>
        <span className="week-card-title">{occasionTitle(entry, language)}</span>
        <span className="week-card-date">{[weekday, hebrewDayMonthLabel(entry.hebrewDate, language)].filter(Boolean).join(' · ')}</span>
      </Link>
      {(entry.audio.length > 0 || hanacha) && (
        <div className="week-card-actions">
          {entry.audio.length > 0 && <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="compact" />}
          {hanacha && (
            <Link className="week-card-action" to={farbrengenPdfPath(entry.hebrewYear, entry.occasionId, hanacha.driveFileId)} onClick={() => readHanacha(entry)}>
              <FileText size={16} aria-hidden />
              {t.markHanacha}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * This week (docs: the UI/UX redo plan, "השבוע"): the date and the parsha,
 * then the week itself on the page - the kvius year's farbrengens as cards
 * to play and read, every year's farbrengens of the week as a strip of
 * years, the parsha's Likkutei Sichos - then where the listener left off,
 * and the round anniversaries. The rest of the app is one tab away.
 */
export function HomeScreen({ targetYear }: Props) {
  const { t, language } = useTranslation();
  const catalog = useCatalog();
  const library = useLibrary();
  const online = useOnlineStatus();
  const today = useMemo(() => new Date(), []);
  const { parsha } = currentParsha(IL);
  const kviusYear = useMemo(() => bestKviusYear(targetYear, catalog, today), [catalog, targetYear, today]);
  const kviusWeek = useMemo(() => (kviusYear ? resolveThisWeek(kviusYear, catalog, today).map((occasion) => occasion.entry) : []), [catalog, kviusYear, today]);
  const everyYear = useMemo(() => resolveThisWeekAllYears(catalog, today), [catalog, today]);
  const anniversaries = useMemo(() => findSpecialAnniversaries(targetYear, catalog, today), [catalog, targetYear, today]);
  const sichos = useMemo(() => {
    if (!library) return [];
    const slug = lsParshaSlugs(library, parsha)[0];
    const group = slug ? findGroup(library, 'likkuteiSichos', 'parsha', slug) : undefined;
    return group ? groupItems(library, 'likkuteiSichos', group) : [];
  }, [library, parsha]);
  const Chevron = isRtlLanguage(language) ? ChevronLeft : ChevronRight;

  return (
    <div className="screen">
      <ScreenHeader title={t.appTitle} />
      <p className="home-date">{todayHebrewDateLabel()}</p>
      {parsha && <p className="home-parsha">{t.homeParsha(parshaLabel(parsha, language))}</p>}

      {/* Browsing reads the bundled catalog with no network; only what was never downloaded needs a connection. */}
      {!online && (
        <p className="offline-note">
          <WifiOff size={16} aria-hidden />
          <span>{t.offlineNote}</span>
        </p>
      )}

      <section aria-labelledby="home-kvius-title">
        <h2 className="category-header" id="home-kvius-title">
          {kviusYear ? t.homeKviusWeek(hebrewYearLabel(kviusYear, language)) : t.weekKviusFarbrengens}
        </h2>
        {kviusWeek.length > 0 ? (
          <ul className="week-cards">
            {kviusWeek.map((entry) => (
              <WeekCard key={entry.occasionId} entry={entry} />
            ))}
          </ul>
        ) : (
          <p className="gap-message">{t.homeNothingThisWeek}</p>
        )}
        <Link className="home-more" to="/kvius">
          <span>{t.homeAllKviusYears}</span>
          <Chevron size={16} aria-hidden />
        </Link>
      </section>

      {everyYear.length > 0 && (
        <section aria-labelledby="home-years-title">
          <h2 className="category-header" id="home-years-title">
            {t.homeEveryYear}
          </h2>
          <ul className="year-strip">
            {everyYear.map(({ hebrewYear, entries }) => (
              <li key={hebrewYear}>
                <Link className="year-strip-year" to={`/follow/${hebrewYear}`}>
                  <span className="year-strip-label">{hebrewYearLabel(hebrewYear, language)}</span>
                  <span className="year-strip-count">{entries.length}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link className="home-more" to="/this-week-all-years">
            <span>{t.allFarbrengensThisWeek}</span>
            <Chevron size={16} aria-hidden />
          </Link>
        </section>
      )}

      {parsha && sichos.length > 0 && (
        <section aria-labelledby="home-ls-title">
          <h2 className="category-header" id="home-ls-title">
            {t.homeLsOnParsha}
          </h2>
          <ul className="text-list">
            {sichos.slice(0, LS_PREVIEW).map((item) => (
              <li key={item.id}>
                <Link className="text-row" to={`/library/item/likkuteiSichos/${encodeURIComponent(item.id)}`}>
                  <FileText size={18} className="text-row-icon" aria-hidden />
                  <span className="text-row-label">{itemTitle('likkuteiSichos', item, language)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {sichos.length > LS_PREVIEW && (
            <Link className="home-more" to="/library/this-parsha">
              <span>{t.homeAllSichos(sichos.length)}</span>
              <Chevron size={16} aria-hidden />
            </Link>
          )}
        </section>
      )}

      <ContinueSection />

      {anniversaries.length > 0 && (
        <section aria-labelledby="home-anniversaries-title">
          <h2 className="category-header" id="home-anniversaries-title">
            {t.specialAnniversariesHeader}
          </h2>
          <ul className="year-strip">
            {anniversaries.map((item) => (
              <li key={item.hebrewYear}>
                <Link className="year-strip-year" to={`/follow/${item.hebrewYear}`}>
                  <span className="year-strip-label">{hebrewYearLabel(item.hebrewYear, language)}</span>
                  <span className="year-strip-count">{t.specialAnniversaryLabel(item.anniversaryNumber)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
