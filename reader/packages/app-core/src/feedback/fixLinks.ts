/**
 * The way from the app to ChassidusHub's site, where the catalog is edited:
 * "Suggest a fix" opens the item's edit page, "Report a problem" a new
 * report about it. The app knows only its own ids (a farbrengen's mafteiach
 * number, a sefer's and a page's ids), so the links go to the site's
 * `/_/app/<edit|report>`, which finds the item by those ids and sends the
 * reader on (apps/web/app/routes/from-app.ts in ChassidusHub). The site
 * is where people sign in and suggest; the app changes nothing itself.
 */

export const CHASSIDUSHUB_SITE_URL = 'https://chassidushub.org';

export type FixAction = 'edit' | 'report';

/** What the link is about: a farbrengen, a sefer, a page of a sefer, or the app itself. */
export type FixTarget = { farbrengen: number } | { work: string; unit?: string } | { app: true };

/** The site's address for `action` on `target`; the app's version and platform go along for reports about the app. */
export function fixLinkUrl(action: FixAction, target: FixTarget, app?: { version: string; platform: string }, siteUrl: string = CHASSIDUSHUB_SITE_URL): string {
  const params = new URLSearchParams();
  if ('farbrengen' in target) params.set('farbrengen', String(target.farbrengen));
  else if ('work' in target) {
    params.set('work', target.work);
    if (target.unit) params.set('unit', target.unit);
  }
  if (app) {
    params.set('v', app.version);
    params.set('on', app.platform);
  }
  const query = params.toString();
  return `${siteUrl.replace(/\/$/, '')}/_/app/${action}${query ? `?${query}` : ''}`;
}
