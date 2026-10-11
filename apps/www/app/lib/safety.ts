/**
 * What every page tells the browser to keep it safe. No other site may frame
 * a page, so nobody can lay this site's Approve or a new API key under a
 * click of their own (clickjacking). Only an embed (/embed/…), made to sit in
 * other sites' frames, may be framed anywhere.
 */
export function pageSafety(pathname: string): Record<string, string> {
  const embed = pathname.startsWith('/embed/');
  // A showcase (/show/…) is one guest's private link: framed by nobody, its address never sent on.
  const showcase = pathname.startsWith('/show/');
  return {
    'Content-Security-Policy': embed ? 'frame-ancestors *' : showcase ? "frame-ancestors 'none'" : "frame-ancestors 'self'",
    ...(embed ? {} : { 'X-Frame-Options': showcase ? 'DENY' : 'SAMEORIGIN' }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': showcase ? 'no-referrer' : 'strict-origin-when-cross-origin',
  };
}
