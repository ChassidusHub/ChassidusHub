/**
 * Every page the browser tests open: each one is held to the page budgets and
 * checked for accessibility. A screen thread adds its screens here.
 */
export const pages: { name: string; path: string }[] = [
  { name: 'Home', path: '/' },
  { name: 'Library', path: '/library' },
  { name: 'Library: other shelves', path: '/library?more' },
  { name: 'A Rebbe', path: '/sets/the-rebbe' },
  { name: 'A sefer', path: '/likkutei-sichos' },
  { name: 'A volume', path: '/likkutei-sichos/12' },
  { name: 'Listen', path: '/listen' },
  { name: 'Search', path: '/search' },
  { name: 'Design system', path: '/ui' },
];
