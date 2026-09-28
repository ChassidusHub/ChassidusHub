import { Link } from 'react-router-dom';
import { BookText, CalendarRange, ChevronLeft, ChevronRight, Library, Mails, MessageSquareText, Sparkles, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import { currentParsha, todayHebrewDateLabel } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { HOME_WORK_IDS, workKind } from '@sichos-kodesh/app-core';
import { IL } from '../config';
import { useWorks } from '../catalog/catalogStore';
import { COLLECTION_ICONS } from '../components/collectionIcons';
import { ContinueSection } from '../components/ContinueSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { farbrengensPath } from '../routes/tabs';
import { parshaLabel } from '../utils/formatHebrewDate';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
}

/**
 * The library on the home page, the Rebbe's own Torah first, then what was
 * written and recorded around it (the phone's order): its collections, and
 * the seforim with a tile of their own (app-core's HOME_WORK_IDS) - Igros
 * Kodesh, and the Maanos once they may ship (only then are they in the
 * works index).
 */
const LIBRARY_TILES: ReadonlyArray<{ collection: LibraryCollectionId } | { workId: string; name: 'igros' | 'maanos'; icon: LucideIcon }> = [
  { collection: 'likkuteiSichos' },
  { collection: 'maamorim' },
  { workId: 'igros-kodesh-rebbe', name: 'igros', icon: Mails },
  { workId: 'maanos', name: 'maanos', icon: MessageSquareText },
  { collection: 'michtavimKlolim' },
  { collection: 'reshimos' },
  { collection: 'hadranim' },
  { collection: 'yomanim' },
  { collection: 'jemEvents' },
];

/** Igros Kodesh is cleared to ship: its tile stands before the works index is here, so the grid does not shift when it comes. */
const SHOWN_BEFORE_WORKS = 'igros-kodesh-rebbe';

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
  const works = useWorks();
  const homeWorks = new Set((works?.works ?? []).filter((w) => HOME_WORK_IDS.includes(w.id) && workKind(w) !== 'listed').map((w) => w.id));
  const bestMatch = findMatchingYears(targetYear)[0];
  const { parsha } = currentParsha(IL);
  const hebrewDate = todayHebrewDateLabel();
  const parshaName = parsha ? parshaLabel(parsha, language) : null;
  const Chevron = language === 'he' ? ChevronLeft : ChevronRight;

  return (
    <div className="screen">
      <ScreenHeader title={t.appTitle} />
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
        <Link className="home-chip" to={farbrengensPath()}>
          <CalendarRange size={17} aria-hidden />
          <span>{t.homeByYear}</span>
        </Link>
        <Link className="home-chip" to={farbrengensPath('moed')}>
          <Sparkles size={17} aria-hidden />
          <span>{t.homeByMoed}</span>
        </Link>
        <Link className="home-chip" to={farbrengensPath('parsha')}>
          <BookText size={17} aria-hidden />
          <span>{t.homeByParsha}</span>
        </Link>
      </div>

      <h2 className="category-header">{t.homeLibrarySection}</h2>
      <div className="home-tiles">
        {LIBRARY_TILES.map((tile) => {
          if ('collection' in tile) {
            const Icon = COLLECTION_ICONS[tile.collection];
            return (
              <Link key={tile.collection} className="home-tile" to={`/library/c/${tile.collection}`}>
                <span className="home-tile-well">
                  <Icon size={20} aria-hidden />
                </span>
                <span className="home-tile-name">{t.collectionNames[tile.collection]}</span>
                <span className="home-tile-blurb">{t.homeBlurbs[tile.collection]}</span>
              </Link>
            );
          }
          if (!(works ? homeWorks.has(tile.workId) : tile.workId === SHOWN_BEFORE_WORKS)) return null;
          const Icon = tile.icon;
          return (
            <Link key={tile.workId} className="home-tile" to={`/seforim/${encodeURIComponent(tile.workId)}`}>
              <span className="home-tile-well">
                <Icon size={20} aria-hidden />
              </span>
              <span className="home-tile-name">{tile.name === 'igros' ? t.homeIgros : t.homeMaanos}</span>
              <span className="home-tile-blurb">{t.homeBlurbs[tile.name]}</span>
            </Link>
          );
        })}
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
