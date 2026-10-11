import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse } from 'react-router';
import type { Route } from './+types/root';

/**
 * The whole site is Hebrew and right to left from the first byte, so nothing
 * flips after load. Play controls and progress bars set their own direction.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
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
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main>
      <h1>{missing ? 'הדף לא נמצא' : 'משהו השתבש'}</h1>
      <p>
        <a href="/">לדף הבית</a>
      </p>
    </main>
  );
}
