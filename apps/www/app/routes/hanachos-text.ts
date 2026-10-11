import { ownPagesOnly } from '../stewards/pass.server';
import { passTo } from './auth';
import type { Route } from './+types/hanachos-text';

/** A hanacha's words, pasted on /add: /_/hanachos/text to POST /v1/hanachos/text, as the person, for review. */
const pass = passTo('/v1/hanachos', /^text$/);
export const action = ownPagesOnly((args: Route.ActionArgs) => pass({ ...args, params: { '*': 'text' } }));
