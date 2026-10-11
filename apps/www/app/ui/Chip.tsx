import type { ReactNode } from 'react';

/** A small choice or action; `on` when it is a filter that is set. */
export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={on === undefined ? undefined : on} onClick={onClick}>
      {children}
    </button>
  );
}

export function Chips({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** One of a few choices side by side (text size, speed). */
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button type="button" key={String(option.value)} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
