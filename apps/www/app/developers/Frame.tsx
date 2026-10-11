import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, TopBar, type MenuItem } from '../ui';
import { docAddress, docsPath, neighbours, REPOSITORY } from './pages';

/**
 * The frame of every docs page: the path bar (the docs, the page, and on the
 * reference its group), a line saying the docs are in English, then the page
 * itself in English, left to right (`lang="en"`), with what is on it and the
 * pages before and after. Its one bit of script shows the Copy buttons and
 * copies a code box when one is pressed.
 */
export function DocsFrame({
  slug,
  group,
  contents,
  file,
  children,
}: {
  slug: string;
  group?: { label: string; items: MenuItem[] };
  contents?: { id: string; text: string; depth: number }[];
  file?: string | null;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useCopy(root);
  const { previous, next } = neighbours(slug);
  return (
    <>
      <TopBar path={docsPath(slug, group)} />
      <main id="content" className="view wide docs" ref={root}>
        <p className="faint sm">
          <Icon name="globe" size="s" /> התיעוד למפתחים כתוב באנגלית, כמו הקוד.
        </p>
        <div className="doc" lang="en" dir="ltr">
          {contents && contents.length > 1 && (
            <details className="fold toc">
              <summary>
                <span>On this page</span>
                <Icon name="chevron-down" size="s" />
              </summary>
              <ul>
                {contents.map((heading) => (
                  <li key={heading.id} className={heading.depth > 2 ? 'sub' : undefined}>
                    <a href={`#${heading.id}`}>{heading.text}</a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {children}
        </div>
        {file && (
          <p className="faint sm">
            <a href={`${REPOSITORY}/edit/main/${file}`} rel="noopener">
              <Icon name="pen" size="s" /> עריכת הדף ב-GitHub
            </a>{' '}
            <bdi dir="ltr" className="code">
              {file}
            </bdi>
          </p>
        )}
        <nav className="prevnext" aria-label="דפי התיעוד">
          {previous ? (
            <Link to={docAddress(previous.slug)} rel="prev">
              <small>הקודם</small>
              <b>{previous.label}</b>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={docAddress(next.slug)} rel="next" className="next">
              <small>הבא</small>
              <b>{next.label}</b>
            </Link>
          )}
        </nav>
      </main>
    </>
  );
}

/** Copy buttons appear once script runs (only script can copy), and copy their box's code. */
function useCopy(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    for (const button of el.querySelectorAll<HTMLButtonElement>('[data-copy]')) button.hidden = false;
    const copy = async (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
      const code = button?.closest('.codebox')?.querySelector('pre');
      if (!button || !code) return;
      try {
        await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ''));
        const label = button.querySelector('span');
        if (label) {
          label.textContent = 'הועתק';
          setTimeout(() => (label.textContent = 'העתקה'), 1600);
        }
      } catch {
        // The browser would not let the page write to the clipboard; the code is there to select.
      }
    };
    el.addEventListener('click', copy);
    return () => el.removeEventListener('click', copy);
  });
}
