import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon';

/** A labelled text box, with a quiet line under it saying what it is for. */
export function Field({ label, hint, ...input }: { label: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hintId} {...input} />
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * A short message in a page's column: something that failed (`bad`, read out
 * at once), something done (`good`), or a word of explanation.
 */
export function Say({ tone = 'info', children }: { tone?: 'bad' | 'good' | 'info'; children: ReactNode }) {
  return (
    <div className={`say ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {tone !== 'info' && <Icon name={tone === 'good' ? 'check' : 'flag'} size="s" />}
      <div>{children}</div>
    </div>
  );
}

/** A framed part of a page with its own heading: a way to sign in, one part of the account. */
export function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}
