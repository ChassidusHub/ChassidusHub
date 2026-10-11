import { redirect } from 'react-router';

/**
 * The old site's addresses that have no page of their own on this one, kept
 * for the links already out there: each is a permanent redirect (301) to the
 * nearest page here (studio/plans/www-switchover.md). The site is in Hebrew
 * only, so the old `?lang=` and every other query are dropped.
 */
export function movedTo(pathname: string): string | null {
  const [first = '', second] = pathname.split('/').filter(Boolean);
  switch (first) {
    // The library replaces the shelf list and the reading start page.
    case 'sets':
    case 'read':
      return '/library';
    // About, help and for developers are one page.
    case 'help':
    case 'contribute':
      return '/about';
    // Machine text to check is in the back room.
    case 'check':
      return '/back';
    // One account page.
    case 'account':
      return '/account';
    // Listening by year and by day replaces the calendar; a year keeps its year.
    case 'calendar':
      return second && /^\d{4}$/.test(second) ? `/listen/${second}` : '/listen';
    // No daily learning on this site.
    case 'daily':
    case 'shiurim':
      return '/';
    default:
      return null;
  }
}

export function loader({ request }: { request: Request }) {
  return redirect(movedTo(new URL(request.url).pathname) ?? '/', 301);
}
