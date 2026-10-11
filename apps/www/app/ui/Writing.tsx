import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

// Apart from Form.tsx and the index, so that only a page that asks for
// writing (a takedown) carries these, not the bundle every page loads.

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
