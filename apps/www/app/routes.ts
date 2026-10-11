import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  layout('routes/shell.tsx', [
    index('routes/home.tsx'),
    route('listen', 'routes/listen.tsx'),
    route('listen/day/:day', 'routes/listen-day.tsx'),
    route('listen/:year', 'routes/listen-year.tsx'),
    route('listen/:year/:event', 'routes/recording.tsx'),
    route('ui', 'routes/ui.tsx'),
  ]),
  route('listen/:year/menu', 'routes/listen-menu.ts'),
] satisfies RouteConfig;
