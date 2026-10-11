import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  layout('routes/shell.tsx', [index('routes/home.tsx'), route('ui', 'routes/ui.tsx'), route('search', 'routes/search.tsx')]),
  route('search/suggest', 'routes/search.suggest.ts'),
] satisfies RouteConfig;
