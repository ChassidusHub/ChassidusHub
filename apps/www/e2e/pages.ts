/**
 * Every page the browser tests open: each one is held to the page budgets and
 * checked for accessibility. A screen thread adds its screens here.
 */
export const pages: { name: string; path: string }[] = [
  { name: 'Home', path: '/' },
  { name: 'Library', path: '/library' },
  { name: 'Listen', path: '/listen' },
  { name: 'Search', path: '/search' },
  { name: 'Design system', path: '/ui' },
  // Reading pages come from the stand-in API (fixture-api.ts), so only on the local build.
  ...(process.env.BASE_URL
    ? []
    : [
        { name: 'Reader', path: '/sample/1/1' },
        { name: 'Reader, machine words', path: '/sample/1/2' },
      ]),
];
