import { passTo } from './auth';

/**
 * The connect page's questions, from the site's own pages: /_/oauth/requests/<id>
 * goes on to the API's /v1/oauth/requests/<id>, with the person's session.
 * Only that address passes; the API checks the Origin itself.
 */
const pass = passTo('/v1/oauth', /^requests\/oar-[\w-]+$/);
export const loader = pass;
export const action = pass;
