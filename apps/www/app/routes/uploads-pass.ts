import { ownPagesOnly } from '../stewards/pass.server';
import { passTo } from './auth';

/**
 * Adding what is missing (/add), as the person, never kept: /_/uploads sends
 * the file itself on to POST /v1/uploads (its type, and the choices in the
 * address), /_/uploads/propose asks the machine where it likely belongs, and
 * /_/uploads/check whether the file is kept already.
 */
const pass = passTo('/v1/uploads', /^(propose|check)?$/);
export const action = ownPagesOnly(pass);
