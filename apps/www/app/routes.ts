import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

/**
 * Every screen of the new site, each owned by one screen thread
 * (apps/www/README.md). Every item has a readable path and a permanent one;
 * both end at routes/item.tsx, after every other route.
 */
export default [
  layout('routes/shell.tsx', [
    index('routes/home.tsx'),
    route('library', 'routes/library.tsx'),
    route('listen', 'routes/listen.tsx'),
    route('listen/day/:day', 'routes/listen-day.tsx'),
    route('listen/:year', 'routes/listen-year.tsx'),
    route('listen/:year/:event', 'routes/recording.tsx'),
    route('search', 'routes/search.tsx'),
    route('signin', 'routes/signin.tsx'),
    route('account', 'routes/account.tsx'),
    route('me/fixes', 'routes/fixes.tsx'),
    route('about', 'routes/about.tsx'),
    route('back', 'routes/backroom.tsx'),
    route('ui', 'routes/ui.tsx'),
    route('*', 'routes/item.tsx'),
  ]),
  route('listen/:year/menu', 'routes/listen-menu.ts'),
  // The rows under the search box while typing, as JSON (thread 5, Search).
  route('search/suggest', 'routes/search.suggest.ts'),
  // A fix and its undo, sent as the person (thread 4, Fixing and Edit). `_` is never in an item's path.
  route('_/fix', 'routes/fix.ts'),
  route('_/fix/:changeset/undo', 'routes/fix-undo.ts'),
  // One field of a page saved from Edit, as the person.
  route('_/edit', 'routes/edit.ts'),
  // Signing in, passed on to the API's /v1/auth/* so the session cookie is this site's own (thread 6).
  route('_/auth/*', 'routes/auth.ts'),
  // One live change in the back room: its words (GET), and keeping or undoing it as the person (POST).
  route('_/back/:id', 'routes/back-item.ts'),
] satisfies RouteConfig;
