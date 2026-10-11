import { passTo } from './auth';

/**
 * The person's API tokens and connected apps, from the account page:
 * /_/tokens to the API's /v1/tokens (list, make), /_/tokens/<id> to revoke
 * one, with their session. Made and revoked only from the site's own pages.
 */
const pass = passTo('/v1/tokens', /^((tok|oac)-[\w-]+)?$/);
export const loader = pass;
export const action = pass;
