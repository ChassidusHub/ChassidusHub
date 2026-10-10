import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router';
import type { Lang } from '../lib/i18n.js';
import { tu, type UiKey } from '../lib/i18nUi.js';
import { href } from '../lib/links.js';
import { localPlaces, type Place } from '../lib/places.js';
import { useAccount } from '../lib/useAccount.js';
import { Icon, type IconName } from './Icon.js';
import { Logo } from './Logo.js';
import { Avatar } from './primitives.js';
import { setSideFolded, useSideFolded } from './theme.js';

/**
 * The new look's frame (studio/design-target, GOALS.md): a sidebar at the
 * start of every page. At its head the logo, which is the way home, and the
 * fold; then My study (where you stopped reading or listening), the Library
 * and Search, as the new look names them, and under a line the rest of the
 * site's sections; settings, feedback and the language at its foot. On a
 * wide screen it folds to its icons and stays folded next time; on a phone
 * it is a drawer, opened from the header (and without script, by its
 * address, #nav).
 */

/**
 * Chats with a model about the texts send words to an outside service, so
 * they wait for Shmuly's OK (GOALS.md). The place for them is kept here;
 * it is drawn only when this is turned on.
 */
export const AI_ON = false;

/** The site's other sections, under the line: what the old header's menus held. */
const MORE: Array<{ to: string; key: UiKey; icon: IconName }> = [
  { to: '/daily', key: 'navDailyLong', icon: 'cal' },
  { to: '/calendar', key: 'navListen', icon: 'audio' },
  { to: '/contribute', key: 'navTakePart', icon: 'heart' },
  { to: '/suggestions', key: 'navSuggestions', icon: 'suggest' },
  { to: '/issues', key: 'navReports', icon: 'report' },
  { to: '/projects', key: 'navProjects', icon: 'target' },
];

// The phone's drawer: open or shut, shared by the header's button and the drawer itself.
let drawerOpen = false;
const listeners = new Set<() => void>();
function setDrawer(open: boolean) {
  drawerOpen = open;
  listeners.forEach((l) => l());
}
export const openDrawer = () => setDrawer(true);
const useDrawer = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => drawerOpen,
    () => false,
  );

/** Asks the header to open the command palette (search). */
export function openSearch(initial = '') {
  window.dispatchEvent(new CustomEvent('chassidushub:palette', { detail: initial }));
}

function otherLangHref(lang: Lang, pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  if (lang === 'en') params.set('lang', 'he');
  else params.delete('lang');
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Where you stopped, newest first: kept in this browser (lib/places.ts), so read after the page is up. */
function useStudy(): Place[] | null {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const { pathname } = useLocation();
  useEffect(() => setPlaces(localPlaces().slice(0, 3)), [pathname]);
  return places;
}

export function Sidebar({ lang, section }: { lang: Lang; section: string }) {
  const { pathname, search } = useLocation();
  const account = useAccount();
  const folded = useSideFolded();
  const open = useDrawer();
  const study = useStudy();

  // A new page closes the drawer.
  useEffect(() => setDrawer(false), [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const other = otherLangHref(lang, pathname, search);
  const current = (to: string) => (section === to ? 'page' : undefined);
  const shut = (e: React.MouseEvent) => {
    e.preventDefault();
    setDrawer(false);
  };

  return (
    <>
      <a className="side-scrim" href="#" hidden={!open} onClick={shut} aria-label={tu(lang, 'close')} tabIndex={-1} />
      <aside id="nav" className={open ? 'side open' : 'side'} aria-label={tu(lang, 'mainNav')}>
        <div className="side-h">
          <button
            type="button"
            className="ib side-fold"
            onClick={() => setSideFolded(!folded)}
            aria-expanded={!folded}
            aria-label={tu(lang, folded ? 'sideUnfold' : 'sideFold')}
            title={tu(lang, folded ? 'sideUnfold' : 'sideFold')}
          >
            <Icon name="panel" />
          </button>
          <Link to={href('/', lang)} className="brand" aria-label="ChassidusHub">
            <Logo size={22} />
          </Link>
          <a className="ib side-x" href="#" onClick={shut} aria-label={tu(lang, 'close')}>
            <Icon name="x" />
          </a>
        </div>

        {/* On a phone the header has no room for you: the drawer starts with you. */}
        {account ? (
          <Link className="side-me" to={href(account.person.username ? `/u/${account.person.username}` : '/account', lang)}>
            <Avatar name={account.person.displayName} id={account.person.id} />
            <span>{account.person.displayName}</span>
          </Link>
        ) : account === null ? (
          <Link className="side-me" to={href('/signin', lang, { return: `${pathname}${search}` })}>
            <Icon name="user" />
            <span>{tu(lang, 'signIn')}</span>
          </Link>
        ) : null}

        <nav className="side-nav">
          {AI_ON ? (
            <div className="side-sec">
              <span className="side-link side-key">
                <Icon name="discuss" />
                <span className="side-t">{tu(lang, 'myChats')}</span>
              </span>
            </div>
          ) : null}

          <details className="side-sec" open>
            <summary className="side-link side-key">
              <Icon name="study" />
              <span className="side-t">{tu(lang, 'myStudy')}</span>
              <Icon name="chevd" className="side-chev" />
            </summary>
            <div className="side-study">
              {study === null ? null : study.length ? (
                <>
                  {study.map((p) => (
                    <Link key={`${p.kind} ${p.key}`} to={p.href} className="side-place" dir="auto">
                      <span>{p.title}</span>
                      {p.sub ? <small>{p.sub}</small> : null}
                    </Link>
                  ))}
                  <Link to={href('/', lang)} className="side-more">
                    {tu(lang, 'myStudyAll')}
                  </Link>
                </>
              ) : (
                <p className="side-empty">{tu(lang, 'myStudyEmpty')}</p>
              )}
            </div>
          </details>

          <Link className="side-link side-key" to={href('/sets', lang)} aria-current={current('/sets')}>
            <Icon name="shelves" />
            <span className="side-t">{tu(lang, 'navLibrary')}</span>
          </Link>
          <Link
            className="side-link side-key"
            to={href('/search', lang)}
            aria-current={pathname === '/search' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              setDrawer(false);
              openSearch();
            }}
          >
            <Icon name="search" />
            <span className="side-t">{tu(lang, 'searchShort')}</span>
          </Link>

          <hr />

          {MORE.map((n) => (
            <Link key={n.to} className="side-link" to={href(n.to, lang)} aria-current={current(n.to)} title={folded ? tu(lang, n.key) : undefined}>
              <Icon name={n.icon} />
              <span className="side-t">{tu(lang, n.key)}</span>
            </Link>
          ))}
        </nav>

        <div className="side-foot">
          <Link className="side-link" to={href('/account', lang)} title={folded ? tu(lang, 'settings') : undefined}>
            <Icon name="gear" />
            <span className="side-t">{tu(lang, 'settings')}</span>
          </Link>
          <Link className="side-link" to={href('/issues/new', lang)} title={folded ? tu(lang, 'feedback') : undefined}>
            <Icon name="discuss" />
            <span className="side-t">{tu(lang, 'feedback')}</span>
          </Link>
          <a className="side-link" href={other} hrefLang={lang === 'he' ? 'en' : 'he'} title={folded ? tu(lang, 'language') : undefined}>
            <Icon name="globe" />
            <span className="side-t">
              {tu(lang, 'language')} · <span lang={lang === 'he' ? 'en' : 'he'}>{lang === 'he' ? 'English' : 'עברית'}</span>
            </span>
          </a>
        </div>
      </aside>
    </>
  );
}
