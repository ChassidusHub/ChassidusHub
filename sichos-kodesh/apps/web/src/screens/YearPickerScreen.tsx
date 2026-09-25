import { Link } from 'react-router-dom';
import { BookOpen, BookText, CalendarRange, ChevronLeft, ChevronRight, Feather, GraduationCap, Headphones, Library, Mail, NotebookPen, ScrollText, Search, Settings, Sparkles, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import { currentParsha, todayHebrewDateLabel } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { IL } from '../config';
import { ContinueSection } from '../components/ContinueSection';
import { parshaLabel } from '../utils/formatHebrewDate';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
}

/** The library's collections on the home page, the Rebbe's own Torah first, then what was written and recorded around it (the phone's order). */
const COLLECTION_TILES: ReadonlyArray<{ collection: LibraryCollectionId; icon: LucideIcon }> = [
  { collection: 'likkuteiSichos', icon: BookOpen },
  { collection: 'maamorim', icon: ScrollText },
  { collection: 'michtavimKlolim', icon: Mail },
  { collection: 'reshimos', icon: NotebookPen },
  { collection: 'hadranim', icon: GraduationCap },
  { collection: 'yomanim', icon: Feather },
  { collection: 'jemEvents', icon: Headphones },
];

/**
 * The home page. What is on this week comes first - the kvius farbrengens,
 * every year's farbrengens of this week, the parsha's Likkutei Sichos -
 * then where the listener left off, then every way into the rest: the
 * farbrengens by year, moed and parsha, and a door into each part of the
 * library. Nothing here loads the library until a door is opened.
 */
export function YearPickerScreen({ targetYear }: Props) {
  const { t, language } = useTranslation();
  const online = useOnlineStatus();
  const bestMatch = findMatchingYears(targetYear)[0];
  const { parsha } = currentParsha(IL);
  const hebrewDate = todayHebrewDateLabel();
  const parshaName = parsha ? parshaLabel(parsha, language) : null;
  const Chevron = language === 'he' ? ChevronLeft : ChevronRight;

  return (
    <div className="screen">
      <div className="header-row">
        <h1>{t.appTitle}</h1>
        <div className="header-row-actions">
          <Link className="settings-link" to="/search" aria-label={t.searchLink}>
            <Search size={22} strokeWidth={2} />
          </Link>
          <Link className="settings-link" to="/settings" aria-label={t.settingsLabel}>
            <Settings size={22} strokeWidth={2} />
          </Link>
        </div>
      </div>
      <p className="subtitle home-date">{hebrewDate}</p>

      {/* Browsing/search read from the bundled catalog with no network
          needed, and already-cached content still opens offline - only
          content that was never downloaded needs a connection. */}
      {!online && (
        <p className="offline-note">
          <WifiOff size={16} aria-hidden />
          <span>{t.offlineNote}</span>
        </p>
      )}
      {!online && (
        <Link className="category-row" to="/downloaded">
          <span className="category-row-name">{t.viewDownloadedLabel}</span>
        </Link>
      )}

      {/* This week: the kvius farbrengens first, then every year's, then the parsha's sichos. */}
      <section className="home-week" aria-labelledby="home-week-title">
        <p className="home-week-eyebrow">{t.homeThisWeek}</p>
        {parshaName && (
          <h2 className="home-week-title" id="home-week-title">
            {t.homeParsha(parshaName)}
          </h2>
        )}
        {bestMatch && (
          <Link className="button hero-button home-week-button" to="/kvius">
            {t.weekKviusFarbrengens}
          </Link>
        )}
        <Link className="home-link" to="/this-week-all-years">
          <span>{t.allFarbrengensThisWeek}</span>
          <Chevron size={18} aria-hidden />
        </Link>
        {parsha && (
          <Link className="home-link" to="/library/this-parsha">
            <span>{t.homeLsOnParsha}</span>
            <Chevron size={18} aria-hidden />
          </Link>
        )}
      </section>

      <ContinueSection />

      <h2 className="category-header">{t.homeFarbrengensSection}</h2>
      <div className="home-chips">
        <Link className="home-chip" to="/years">
          <CalendarRange size={17} aria-hidden />
          <span>{t.homeByYear}</span>
        </Link>
        <Link className="home-chip" to="/library/moadim">
          <Sparkles size={17} aria-hidden />
          <span>{t.homeByMoed}</span>
        </Link>
        <Link className="home-chip" to="/library/parshiyos">
          <BookText size={17} aria-hidden />
          <span>{t.homeByParsha}</span>
        </Link>
      </div>

      <h2 className="category-header">{t.homeLibrarySection}</h2>
      <div className="home-tiles">
        {COLLECTION_TILES.map(({ collection, icon: Icon }) => (
          <Link key={collection} className="home-tile" to={`/library/c/${collection}`}>
            <span className="home-tile-well">
              <Icon size={20} aria-hidden />
            </span>
            <span className="home-tile-name">{t.collectionNames[collection]}</span>
            <span className="home-tile-blurb">{t.homeBlurbs[collection]}</span>
          </Link>
        ))}
        <Link className="home-tile" to="/seforim">
          <span className="home-tile-well">
            <Library size={20} aria-hidden />
          </span>
          <span className="home-tile-name">{t.homeSeforim}</span>
          <span className="home-tile-blurb">{t.homeBlurbs.seforim}</span>
        </Link>
      </div>
      <Link className="category-row" to="/library">
        <span className="category-row-name">{t.homeAllLibrary}</span>
      </Link>
    </div>
  );
}
