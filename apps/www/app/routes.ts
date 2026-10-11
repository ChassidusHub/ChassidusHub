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
    route('takedown', 'routes/takedown.tsx'),
    route('connect', 'routes/connect.tsx'),
    route('oauth/consent', 'routes/oauth-consent.tsx'),
    route('back', 'routes/backroom.tsx'),
    // Suggestions as pull requests: the list and one suggestion's page (thread 6, the rebuild); the old /review is the back room's.
    route('suggestions', 'routes/suggestions.tsx'),
    route('suggestions/:number', 'routes/suggestion.tsx'),
    // The catalog as a whole: its health, the site's status, what is missing, projects, downloads and the models' scores (thread 6, rebuilt).
    route('health', 'routes/health.tsx'),
    route('status', 'routes/status.tsx'),
    route('missing', 'routes/missing.tsx'),
    route('projects', 'routes/projects.tsx'),
    route('projects/:slug', 'routes/project.tsx'),
    route('mirrors', 'routes/mirrors.tsx'),
    route('models', 'routes/models.tsx'),
    // The developer docs from docs/*.md, and the API reference from the OpenAPI document (in English, in the Hebrew frame).
    route('developers/reference', 'routes/developers-reference.tsx', { id: 'reference' }),
    route('developers/reference/:group', 'routes/developers-reference.tsx', { id: 'reference-group' }),
    route('developers/:page?', 'routes/developers.tsx'),
    // The stewards' and contributors' pages (thread 6, rebuilt from the old site).
    route('organize', 'routes/organize.tsx'),
    route('admin', 'routes/admin.tsx'),
    route('add', 'routes/add.tsx'),
    route('new', 'routes/new.tsx'),
    route('showcase', 'routes/showcase.tsx'),
    route('show/:token', 'routes/show.tsx'),
    route('ui', 'routes/ui.tsx'),
    // Reports, the inbox and people's pages (thread 6, rebuilt from the old site).
    route('issues', 'routes/issues.tsx'),
    route('issues/new', 'routes/issue-new.tsx'),
    route('issues/:number', 'routes/issue.tsx'),
    route('inbox', 'routes/inbox.tsx'),
    route('u/:username', 'routes/profile.tsx'),
    // An item's tools, a file's page, a scan's text and the subject index (thread 6, item tools).
    route('history/:id', 'routes/history.tsx'),
    route('talk/:id', 'routes/talk.tsx'),
    route('compare/:unit', 'routes/compare.tsx'),
    route('shaar/:id', 'routes/shaar.tsx'),
    route('text/:scan', 'routes/text.tsx'),
    route('files/:sha256', 'routes/file.tsx'),
    route('mafteach', 'routes/mafteach.tsx'),
    route('*', 'routes/item.tsx'),
  ]),
  route('listen/:year/menu', 'routes/listen-menu.ts'),
  // For crawlers, agents and browsers (lib/site.ts: only chassidushub.org itself is indexed).
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap-index.ts'),
  route('sitemaps/:name.xml', 'routes/sitemap.ts'),
  route('llms.txt', 'routes/llms.ts', { id: 'llms' }),
  route('llms-full.txt', 'routes/llms.ts', { id: 'llms-full' }),
  route('opensearch.xml', 'routes/opensearch.ts'),
  route('.well-known/security.txt', 'routes/security-txt.ts'),
  // The rows under the search box while typing, as JSON (thread 5, Search).
  route('search/suggest', 'routes/search.suggest.ts'),
  // A fix and its undo, sent as the person (thread 4, Fixing and Edit). `_` is never in an item's path.
  route('_/fix', 'routes/fix.ts'),
  route('_/fix/:changeset/undo', 'routes/fix-undo.ts'),
  // One field of a page saved from Edit, as the person.
  route('_/edit', 'routes/edit.ts'),
  // Signing in, passed on to the API's /v1/auth/* so the session cookie is this site's own (thread 6).
  route('_/auth/*', 'routes/auth.ts'),
  // An app's request to connect (the consent page), and the person's API tokens and connected apps (the account page).
  route('_/oauth/*', 'routes/oauth-pass.ts'),
  route('_/tokens/*', 'routes/tokens-pass.ts'),
  // One live change in the back room: its words (GET), and keeping or undoing it as the person (POST).
  route('_/back/:id', 'routes/back-item.ts'),
  route('review', 'routes/review.ts'),
  // One suggestion as the person: whether they may approve it, and what they do on it.
  route('_/suggestions/*', 'routes/suggestions-pass.ts'),
  // Reports, the inbox and people as the person, passed on to the API's /v1/*; and where the reader app's links land.
  route('_/people/*', 'routes/people-pass.ts'),
  route('_/app/:action', 'routes/from-app.ts'),
  // The item tools' writes, as the person: a comment, a restore, a line of a scan, a shaar.
  route('_/tools/:what', 'routes/tools-act.ts'),
  // The one page other sites may frame: no shell, no menus.
  route('embed/:id', 'routes/embed.tsx'),
  // The old site's /edit/<id> and /all/<id>: a permanent redirect to the item's own page.
  route('edit/:id', 'routes/to-item.ts', { id: 'edit-redirect' }),
  route('all/:id', 'routes/to-item.ts', { id: 'all-redirect' }),
  // The old site's addresses with no page of their own here: a permanent redirect to the nearest one (routes/moved.ts).
  route('sets', 'routes/moved.ts', { id: 'moved-sets' }),
  route('read', 'routes/moved.ts', { id: 'moved-read' }),
  route('help', 'routes/moved.ts', { id: 'moved-help' }),
  route('contribute', 'routes/moved.ts', { id: 'moved-contribute' }),
  route('check', 'routes/moved.ts', { id: 'moved-check' }),
  route('account/:section', 'routes/moved.ts', { id: 'moved-account' }),
  route('calendar/*', 'routes/moved.ts', { id: 'moved-calendar' }),
  route('calendar', 'routes/moved.ts', { id: 'moved-calendar-top' }),
  route('daily/*', 'routes/moved.ts', { id: 'moved-daily' }),
  route('daily', 'routes/moved.ts', { id: 'moved-daily-top' }),
  route('shiurim/*', 'routes/moved.ts', { id: 'moved-shiurim' }),
  route('shiurim', 'routes/moved.ts', { id: 'moved-shiurim-top' }),
  // Organizing the catalog, the stewards' tools, adding what is missing and showcases, as the person, never kept.
  route('_/organize/*', 'routes/organize-pass.ts'),
  route('_/steward/*', 'routes/steward-pass.ts'),
  route('_/uploads/*', 'routes/uploads-pass.ts'),
  route('_/hanachos/text', 'routes/hanachos-text.ts'),
  route('_/showcases', 'routes/showcases-pass.ts'),
  // A few items by name, for the pickers; the same for everyone.
  route('_/find', 'routes/find.ts', { id: 'find' }),
  route('_/lookup', 'routes/find.ts', { id: 'lookup' }),
  // A showcase's transcripts and files, only those it lists (stewards/showcase.ts).
  route('show/:token/t/:recording', 'routes/show-transcript.ts'),
  route('show/:token/m/:n', 'routes/show-media.ts'),
] satisfies RouteConfig;
