/**
 * What every page tells the browser to keep it safe. No other site may frame
 * a page, so nobody can lay this site's Approve or a new API key under a
 * click of their own (clickjacking). Only an embed (/embed/…), made to sit in
 * other sites' frames, may be framed anywhere.
 */
export function pageSafety(pathname: string): Record<string, string> {
  const embed = pathname.startsWith('/embed/');
  return {
    'Content-Security-Policy': embed ? 'frame-ancestors *' : "frame-ancestors 'self'",
    ...(embed ? {} : { 'X-Frame-Options': 'SAMEORIGIN' }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}
