import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useMatches } from 'react-router';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
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
 * (a sicha belongs to the library, a recording to listening); the deepest
 * route that says wins.
 */
function useSection(): Section | undefined {
  const matches = useMatches();
  for (let at = matches.length - 1; at >= 0; at--) {
    const section = (matches[at]?.handle as { section?: Section } | undefined)?.section;
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
export function AppShell({ children, dock }: { children: ReactNode; dock?: ReactNode }) {
  const section = useSection();
  const [theme, toggleTheme] = useTheme();
  const [account, setAccount] = useState(false);
  const openAccount = useCallback(() => setAccount(true), []);
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
          <button type="button" className="nav" onClick={() => setAccount(true)}>
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
          <Link className="opt" to="/signin" onClick={() => setAccount(false)}>
            <span className="t">כניסה</span>
          </Link>
          <Link className="opt" to="/me/fixes" onClick={() => setAccount(false)}>
            <span className="t">התיקונים שלי</span>
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
