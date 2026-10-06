import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from './i18n';
import { CheckIcon, DownloadIcon, PlusIcon } from './icons';

/** The pieces every part of the site is built from. */

export type Load<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; message: string };

/** Something loaded for what `deps` name; `retry` loads it again. */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Load<T> & { retry: () => void } {
  const [result, setResult] = useState<Load<T>>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: 'loading' });
    load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult({ state: 'ready', value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ state: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what the load depends on
  }, [...deps, attempt]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

export function toggled<T>(list: T[], value: T, on: boolean): T[] {
  return on ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value);
}

/** A pick-one row of pills, the chosen one filled (the app's segmented control). */
export function Segmented<T extends string | number>({ name, value, options, onChange }: { name: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((option) => (
        <label key={String(option.value)} className={option.value === value ? 'segmented-option segmented-on' : 'segmented-option'}>
          <input type="radio" className="visually-hidden" name={name} id={`${name}-${option.value}`} checked={option.value === value} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** A chip that toggles a choice in a set (a year, a month, a group). `mark` flags it: a kvius year, this month. */
export function ToggleChip({ id, on, onChange, mark, title, children }: { id: string; on: boolean; onChange: (on: boolean) => void; mark?: 'kvius' | 'now'; title?: string; children: ReactNode }) {
  const className = ['chip', 'chip-check', on ? 'chip-on' : '', mark === 'kvius' ? 'chip-kvius' : '', mark === 'now' ? 'chip-now' : ''].filter(Boolean).join(' ');
  return (
    <label className={className} title={title}>
      <input type="checkbox" className="visually-hidden" id={id} checked={on} onChange={(event) => onChange(event.target.checked)} />
      <span className="chip-tick" aria-hidden="true">
        <CheckIcon size={14} />
      </span>
      {children}
    </label>
  );
}

export function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={title}>
      <div className="field-title">{title}</div>
      {hint && <p className="field-hint">{hint}</p>}
      {children}
    </div>
  );
}

export function DownloadButton({ href, file, label, big }: { href: string; file?: string; label?: string; big?: boolean }) {
  const { t } = useI18n();
  return (
    <a className={big ? 'download-button download-button-big' : 'download-button'} href={href} download={file ?? true}>
      <DownloadIcon size={big ? 22 : 18} />
      {label ?? t.download}
    </a>
  );
}

/** Add to the cart, or - once it is there - say so and take it out on a second tap. A named offer (this month's kvius) keeps its name and says "in the cart" underneath. */
export function AddButton({ inCart, disabled, onAdd, onRemove, label, detail }: { inCart: boolean; disabled?: boolean; onAdd: () => void; onRemove?: () => void; label?: string; detail?: string }) {
  const { t } = useI18n();
  const shownDetail = inCart && label ? [t.inCart, detail].filter(Boolean).join(' · ') : detail;
  return (
    <button type="button" className={inCart ? 'add-button add-button-in' : 'add-button'} disabled={disabled} onClick={inCart ? onRemove : onAdd} aria-pressed={inCart}>
      {inCart ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
      <span className="add-button-text">
        <span>{inCart && !label ? t.inCart : (label ?? t.addToCart)}</span>
        {shownDetail && <span className="add-button-detail">{shownDetail}</span>}
      </span>
    </button>
  );
}

/** A step of the three: its number, its name, and a line under it. */
export function StepHeader({ n, title, lead, id }: { n: number; title: string; lead?: string; id?: string }) {
  const { t } = useI18n();
  return (
    <div className="step-head">
      <span className="step-number" aria-hidden="true">
        {n}
      </span>
      <div className="step-text">
        <h3 className="step-title" id={id}>
          <span className="visually-hidden">{t.step(n)}: </span>
          {title}
        </h3>
        {lead && <p className="step-lead">{lead}</p>}
      </div>
    </div>
  );
}
