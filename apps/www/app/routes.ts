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
    route('me/fixes', 'routes/fixes.tsx'),
    route('about', 'routes/about.tsx'),
    route('back', 'routes/backroom.tsx'),
    route('ui', 'routes/ui.tsx'),
    route('*', 'routes/item.tsx'),
  ]),
  route('listen/:year/menu', 'routes/listen-menu.ts'),
  // The rows under the search box while typing, as JSON (thread 5, Search).
  route('search/suggest', 'routes/search.suggest.ts'),
] satisfies RouteConfig;
