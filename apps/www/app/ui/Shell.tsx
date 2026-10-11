import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useMatches } from 'react-router';
import { signOut, useAccount } from '../lib/account';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
import { PlayerDock } from './player/PlayerDock';
import { PathBar, type PathLevel } from './PathBar';
import { Sheet } from './Sheet';
import { useTheme } from './theme';

/** The four places of the site, in the phone's bottom bar and the desktop's side rail. */
export type Section = 'home' | 'library' | 'listen' | 'search';

const sections: { key: Section; label: string; icon: IconName; to: string }[] = [
  { key: 'home', label: 'בית', icon: 'home', to: '/' },
  { key: 'library', label: 'ספרייה', icon: 'library', to: '/library' },
  { key: 'listen', label: 'שמיעה', icon: 'listen', to: '/listen' },
  { key: 'search', label: 'חיפוש', icon: 'search', to: '/search' },
];
/** The desktop rail puts search first, as the prototype does. */
const railOrder: Section[] = ['search', 'home', 'library', 'listen'];

/** Opens the account sheet, from the rail or from a page's top bar. */
const AccountContext = createContext<() => void>(() => {});

/**
 * Which place a page belongs to: a route says so with `handle: { section }`
 * (a sicha belongs to the library, a recording to listening), or with a
 * function of its loader's data when that depends on the item; the deepest
 * route that says wins.
 */
function useSection(): Section | undefined {
  const matches = useMatches();
  for (let at = matches.length - 1; at >= 0; at--) {
    const match = matches[at]!;
    const section = (match.handle as { section?: Section | ((data: never) => Section) } | undefined)?.section;
    if (typeof section === 'function') return section(match.loaderData as never);
    if (section) return section;
  }
  return undefined;
}

/**
 * Every page's frame. On a phone: the page's own top bar, its column, and at
 * the foot the player (when something plays) over the bottom bar. On a
 * desktop: the side rail at the start (the right), the column in the middle,
 * the player bar along the foot. `dock` is the player's place.
 */
export function AppShell({ children, dock = <PlayerDock /> }: { children: ReactNode; dock?: ReactNode }) {
  const section = useSection();
  const [theme, toggleTheme] = useTheme();
  const [account, setAccount] = useState(false);
  const [asked, setAsked] = useState(false);
  const openAccount = useCallback(() => {
    setAsked(true);
    setAccount(true);
  }, []);
  return (
    <AccountContext.Provider value={openAccount}>
      <div className="app">
        <a className="skip" href="#content">
          לתוכן
        </a>
        <nav className="rail" aria-label="ראשי">
          <Link to="/" className="nav-logo" aria-label="ChassidusHub, דף הבית">
            <Logo />
          </Link>
          {railOrder.map((key) => {
            const place = sections.find((s) => s.key === key)!;
            return (
              <Link key={key} to={place.to} className="nav" aria-current={section === key ? 'page' : undefined}>
                <Icon name={place.icon} />
                {place.label}
              </Link>
            );
          })}
          <div className="sp" />
          <button type="button" className="nav" onClick={toggleTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
          </button>
          <button type="button" className="nav" onClick={openAccount}>
            <Icon name="user" />
            החשבון שלי
          </button>
        </nav>
        <div className="main">{children}</div>
        <div className="dock">
          {dock}
          <nav className="tabs" aria-label="ראשי">
            {sections.map((place) => (
              <Link key={place.key} to={place.to} aria-current={section === place.key ? 'page' : undefined}>
                <Icon name={place.icon} />
                {place.label}
              </Link>
            ))}
          </nav>
        </div>
        <Sheet open={account} title="החשבון שלי" onClose={() => setAccount(false)}>
          {/* Who is signed in is asked only once the sheet has been opened, never on every page. */}
          {asked ? <AccountOptions close={() => setAccount(false)} /> : null}
          <Link className="opt" to="/back" onClick={() => setAccount(false)}>
            <span className="t">בדיקה: עזרה בבדיקת טקסט שנקרא במכונה</span>
          </Link>
          <button type="button" className="opt" onClick={toggleTheme}>
            <span className="t">{theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}</span>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <Link className="opt quiet" to="/about" onClick={() => setAccount(false)}>
            <span className="t">אודות · עזרה · למפתחים</span>
          </Link>
        </Sheet>
      </div>
    </AccountContext.Provider>
  );
}

/**
 * The account sheet's own lines: signed out, Sign in; signed in, their name,
 * their account, their fixes, their inbox, their public page and Sign out.
 */
function AccountOptions({ close }: { close: () => void }) {
  const account = useAccount();
  const location = useLocation();
  if (account === undefined) return <div className="opt off" aria-busy="true"><span className="t">…</span></div>;
  if (!account) {
    const back = location.pathname === '/signin' ? '' : `?return=${encodeURIComponent(location.pathname + location.search)}`;
    return (
      <Link className="opt" to={`/signin${back}`} onClick={close}>
        <span className="t">כניסה</span>
        <Icon name="user" />
      </Link>
    );
  }
  return (
    <>
      <Link className="opt" to="/account" onClick={close}>
        <span className="t">
          {account.person.displayName}
          {account.person.username ? (
            <span className="faint sm">
              {' '}
              <bdi>@{account.person.username}</bdi>
            </span>
          ) : null}
        </span>
        <span className="r">הגדרות</span>
      </Link>
      <Link className="opt" to="/me/fixes" onClick={close}>
        <span className="t">התיקונים שלי</span>
      </Link>
      <Link className="opt" to="/inbox" onClick={close}>
        <span className="t">התיבה שלי</span>
      </Link>
      {account.person.username ? (
        <Link className="opt" to={`/u/${account.person.username}`} onClick={close}>
          <span className="t">הדף שלי</span>
        </Link>
      ) : null}
      {(account.person.steward || account.person.admin) && (
        <>
          <Link className="opt" to="/organize" onClick={close}>
            <span className="t">סידור הקטלוג</span>
          </Link>
          <Link className="opt" to="/admin" onClick={close}>
            <span className="t">כלי השומרים</span>
            <Icon name="shield" />
          </Link>
        </>
      )}
      <button
        type="button"
        className="opt"
        onClick={async () => {
          await signOut();
          close();
        }}
      >
        <span className="t">יציאה</span>
      </button>
    </>
  );
}

/**
 * The bar at the top of a page: the path bar where the page has a place in the
 * library or in listening, else the page's title (and on a phone the logo, on
 * Home). The account button sits at its end unless the page puts its own
 * actions there. `hideOnScroll` tucks it away while reading down the page.
 */
export function TopBar({
  path,
  title,
  sub,
  end,
  hideOnScroll,
}: {
  path?: PathLevel[];
  title?: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  hideOnScroll?: boolean;
}) {
  const openAccount = useContext(AccountContext);
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    let last = scrollY;
    const scrolled = () => {
      const y = scrollY;
      bar.current?.classList.toggle('scrolled', y > 4);
      bar.current?.classList.toggle('hide', !!hideOnScroll && y > last && y > 120);
      last = y;
    };
    scrolled();
    addEventListener('scroll', scrolled, { passive: true });
    return () => removeEventListener('scroll', scrolled);
  }, [hideOnScroll]);
  return (
    <header ref={bar} className="top">
      {path ? (
        <PathBar levels={path} />
      ) : (
        <>
          <Link to="/" className="homelogo" aria-label="ChassidusHub, דף הבית">
            <Logo />
          </Link>
          <div className="mid">
            {title && <b>{title}</b>}
            {sub && <small>{sub}</small>}
          </div>
        </>
      )}
      {end ?? <IconButton icon="user" label="החשבון שלי" onClick={openAccount} />}
    </header>
  );
}
