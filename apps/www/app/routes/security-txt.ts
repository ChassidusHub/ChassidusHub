import { fileResponse, siteOf } from '../lib/site';
import type { Route } from './+types/security-txt';

/**
 * Where to report a security problem (RFC 9116), for those who look here
 * first: the same private reporting SECURITY.md names. It expires half a
 * year after it is made, and is made again each day.
 */
export function securityTxt(origin: string, now = new Date()): string {
  const expires = new Date(now.getTime() + 182 * 86_400_000);
  expires.setUTCHours(0, 0, 0, 0);
  return [
    'Contact: https://github.com/ChassidusHub/ChassidusHub/security/advisories/new',
    `Expires: ${expires.toISOString()}`,
    'Policy: https://github.com/ChassidusHub/ChassidusHub/blob/main/SECURITY.md',
    'Preferred-Languages: en, he',
    `Canonical: ${origin}/.well-known/security.txt`,
    '',
  ].join('\n');
}

export function loader({ request }: Route.LoaderArgs) {
  return fileResponse(securityTxt(siteOf(request).origin), 'text/plain', 86400);
}
