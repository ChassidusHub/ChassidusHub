/**
 * Every page the browser tests open: each one is held to the page budgets and
 * checked for accessibility. A screen thread adds its screens here.
 */
export const pages: { name: string; path: string }[] = [
  { name: 'Home', path: '/' },
  { name: 'Library', path: '/library' },
  { name: 'Listen', path: '/listen' },
  { name: 'Listen by year', path: '/listen/5747' },
  { name: 'Listen by day', path: '/listen/day/03-19' },
  { name: 'Recording', path: '/listen/5732/rh-3dvjfkyc' },
  { name: 'Search', path: '/search' },
  { name: 'Design system', path: '/ui' },
  { name: 'Sign in', path: '/signin' },
  { name: 'Account', path: '/account' },
  { name: 'About', path: '/about' },
  { name: 'Takedown', path: '/takedown' },
  { name: 'Connect an AI app', path: '/connect' },
  { name: 'Connect consent', path: '/oauth/consent?request=oar-sample' },
  // These pages come from the stand-in API (fixture-api.ts), so only on the local build.
  ...(process.env.BASE_URL
    ? []
    : [
        { name: 'Library: other shelves', path: '/library?more' },
        { name: 'A Rebbe', path: '/sets/the-rebbe' },
        { name: 'A sefer', path: '/sample-sichos' },
        { name: 'A volume', path: '/sample-sichos/12' },
        { name: 'Back room', path: '/back' },
        { name: 'Back room: waiting for review', path: '/back?tab=waiting' },
        { name: 'Suggestions', path: '/suggestions' },
        { name: 'A suggestion', path: '/suggestions/42' },
        { name: 'A suggestion, its changes', path: '/suggestions/42?tab=changes' },
        { name: 'Reader', path: '/sample/1/1' },
        { name: 'Reader, machine words', path: '/sample/1/2' },
        { name: 'Reports', path: '/issues' },
        { name: 'A report', path: '/issues/12' },
        { name: 'New report', path: '/issues/new?item=rh-aaaaaab1' },
        { name: 'Inbox', path: '/inbox' },
        { name: 'A person', path: '/u/sample-reader' },
      ]),
];
