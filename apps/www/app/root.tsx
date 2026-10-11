import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse } from 'react-router';
import type { Route } from './+types/root';
import { ToastProvider } from './ui';
import uiFont from './ui/fonts/noto-sans-hebrew.woff2?url';
import uiCss from './ui/ui.css?url';

/**
 * Only the UI face is fetched before the first paint; the title and Torah
 * faces come when a page uses them (ui/fonts/README.md).
 */
export const links: Route.LinksFunction = () => [
  { rel: 'preload', href: uiFont, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  { rel: 'stylesheet', href: uiCss },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

/**
 * A reader's light or dark choice and text size (kept in this browser), set
 * before the page paints so it never flashes the other one or jumps to
 * another size. With no choice the system's theme wins.
 */
const theme = `try{var d=document.documentElement,t=localStorage.getItem('theme'),s=localStorage.getItem('size');if(t==='light'||t==='dark')d.dataset.theme=t;if(/^(-[12]|[0-5])$/.test(s))d.style.setProperty('--torah-step',s)}catch(e){}`;

/**
 * The whole site is Hebrew and right to left from the first byte, so nothing
 * flips after load. Play controls and progress bars set their own direction.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="search" type="application/opensearchdescription+xml" title="ChassidusHub" href="/opensearch.xml" />
        <script dangerouslySetInnerHTML={{ __html: theme }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="view">
      <h1>{missing ? 'הדף לא נמצא' : 'משהו השתבש'}</h1>
      <p>
        <a href="/">לדף הבית</a>
      </p>
    </main>
  );
}
