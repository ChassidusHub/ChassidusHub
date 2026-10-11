import { ownPagesOnly } from '../stewards/pass.server';
import { passTo } from './auth';

/**
 * The stewards' page (/admin), as the person, never kept: the people with
 * accounts (appointing or suspending them), the reports readers sent
 * (closing them), and takedown requests (taking a file down). Only these
 * addresses pass; the API decides who may see and do each.
 */
const pass = ownPagesOnly(passTo('/v1', /^(admin\/people(\/u-[0-9a-z]+\/(role|suspend))?|admin\/takedowns|admin\/files\/[0-9a-f]{64}\/takedown|reports(\/\d{1,9}\/close)?)$/));
export const loader = pass;
export const action = pass;
