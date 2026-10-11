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
    route('listen/:year?', 'routes/listen.tsx'),
    route('search', 'routes/search.tsx'),
    route('signin', 'routes/signin.tsx'),
    route('me/fixes', 'routes/fixes.tsx'),
    route('about', 'routes/about.tsx'),
    route('back', 'routes/backroom.tsx'),
    route('ui', 'routes/ui.tsx'),
    route('*', 'routes/item.tsx'),
  ]),
] satisfies RouteConfig;
