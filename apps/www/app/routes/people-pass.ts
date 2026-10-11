import { passTo } from './auth';

/**
 * Reports, the inbox and people, from the site's own pages as the person:
 * /_/people/* goes on to the API's /v1/* with the session cookie (a signed-in
 * reader's list of reports, with the private ones they may read; a report's
 * conversation and what they may do in it; their inbox). Only these
 * addresses pass; the API checks the Origin of every write itself. Never
 * cached.
 */
const HANDLE = '[A-Za-z0-9-]{1,39}';
const ALLOWED = new RegExp(
  '^(' +
    [
      'issues',
      'issues/\\d{1,9}(/(state|labels|assignees|comments))?',
      'labels',
      'inbox',
      'inbox/(count|read)',
      'follows',
      `people(/${HANDLE})?`,
    ].join('|') +
    ')$',
);

const pass = passTo('/v1', ALLOWED);
export const loader = pass;
export const action = pass;
