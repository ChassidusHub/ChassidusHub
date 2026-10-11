/**
 * Every page the browser tests open: each one is held to the page budgets and
 * checked for accessibility. A screen thread adds its screens here.
 */
export const pages: { name: string; path: string }[] = [
  { name: 'Home', path: '/' },
  { name: 'Listen', path: '/listen' },
  { name: 'Listen by year', path: '/listen/5747' },
  { name: 'Listen by day', path: '/listen/day/03-19' },
  { name: 'Recording', path: '/listen/5732/rh-3dvjfkyc' },
  { name: 'Design system', path: '/ui' },
];
