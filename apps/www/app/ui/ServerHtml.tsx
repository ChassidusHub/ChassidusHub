import { useState } from 'react';
import { useServerOnly } from '../serverOnly';

/**
 * HTML drawn on the server (the reader's words.server.ts, the developer docs) that the page's hydration data
 * leaves out. On the server it comes from the request (serverOnly.tsx); in the
 * browser, on the first render, it is read back from the element the server
 * drew, so React hydrates the same markup and nothing is sent twice. After a
 * click to another page it comes with that page's data.
 */
export function ServerHtml({ id, html, className, as: Tag = 'div' }: { id: string; html: string | null; className?: string; as?: 'div' | 'ol' }) {
  const server = useServerOnly(id);
  const [drawn] = useState(() => (typeof document === 'undefined' ? '' : (document.querySelector(`[data-html="${CSS.escape(id)}"]`)?.innerHTML ?? '')));
  return <Tag className={className} data-html={id} dangerouslySetInnerHTML={{ __html: html ?? server ?? drawn }} />;
}
