import type { ReactNode } from 'react';
import { BackLink } from './BackLink';

interface Props {
  /** Where back goes when there is no history to pop. */
  back: string;
  /** What is open: a chapter, a PDF's name. */
  title: string;
  /** What it belongs to, in a small line above the title: the sefer, the farbrengen. */
  context?: string;
  /** Whether the bar has stepped aside (useReadingChrome). */
  hidden: boolean;
  /** Its buttons at the end: a bookmark, the settings. */
  children?: ReactNode;
}

/**
 * The one top bar of the reader and the PDF (docs: the UI/UX redo plan,
 * "Reader and PDF"): back, what is open under what it belongs to, and the
 * page's own buttons - the settings always last. It steps aside with the
 * rest of the chrome (useReadingChrome). Its colours are the page's own
 * (`--r-*`: the reader's paper, or the PDF's theme).
 */
export function ReadingBar({ back, title, context, hidden, children }: Props) {
  return (
    <header className={hidden ? 'reader-bar reader-bar-hidden' : 'reader-bar'}>
      <div className="reader-bar-row">
        <BackLink to={back} />
        <div className="reader-bar-titles">
          {context && <span className="reader-bar-work">{context}</span>}
          <span className="reader-bar-unit">{title}</span>
        </div>
        {children}
      </div>
    </header>
  );
}
