import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
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

/** A labelled box for a few lines of writing. */
export function Area({ label, hint, ...area }: { label: ReactNode; hint?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} aria-describedby={hintId} {...area} />
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
    </div>
  );
}

/** One answer out of a few, each a whole row to press: never a drop-down. Works in a plain form post. */
export function Choice({ legend, name, options, required }: { legend: ReactNode; name: string; options: { value: string; label: ReactNode }[]; required?: boolean }) {
  return (
    <fieldset className="field choice">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.value}>
          <input type="radio" name={name} value={option.value} required={required} />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
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
