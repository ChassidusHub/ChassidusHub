import type { ReactNode } from 'react';

/**
 * The one best answer at the head of search results: what it is, its name, a
 * quiet line under it, and its actions (read, listen). The actions are
 * <Button small>s, the first one the primary.
 */
export function TopAnswer({ kind, title, sub, children }: { kind: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <section className="top-answer" aria-label="התשובה">
      <span className="k">{kind}</span>
      <b>{title}</b>
      {sub && <span className="faint sm">{sub}</span>}
      {children && <div className="acts">{children}</div>}
    </section>
  );
}
