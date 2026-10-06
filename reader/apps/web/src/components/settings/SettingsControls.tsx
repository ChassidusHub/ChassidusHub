import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n/useLanguage';

/**
 * The settings pages' building blocks. A page is a stack of groups; a
 * group is an eyebrow title over one card of rows; a row is a label (with
 * optional help under it) and, on its trailing side, the control that
 * changes it - a real switch for on/off, a segmented choice for pick-one,
 * a value plus chevron when the row opens another page. A tap anywhere on
 * a switch row flips it, so the whole row is the target, not only the
 * 46px switch.
 */

export function SettingsGroup({ title, help, children }: { title?: string; help?: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      {title && <h2 className="settings-group-title">{title}</h2>}
      <div className="settings-card">{children}</div>
      {help && <p className="settings-group-help">{help}</p>}
    </section>
  );
}

/** A value this long goes under the label instead of beside it, so neither has to wrap into a column. */
const INLINE_VALUE_MAX_CHARS = 18;

interface SettingRowProps {
  /** Omitted when the group's title already says what the control is (a lone segmented choice in its own card). */
  label?: string;
  help?: string;
  /** The control on the trailing side (a Toggle, a value…). */
  children?: ReactNode;
  /** Renders the control under the label instead of beside it - a segmented choice needs the full width. */
  stack?: boolean;
  /** Makes the whole row a tap target for its own switch. */
  onClick?: () => void;
  /** Makes the row a link to another settings page, with the current value and a chevron on its trailing side. */
  to?: string;
  value?: string;
  danger?: boolean;
}

export function SettingRow({ label, help, children, stack = false, onClick, to, value, danger = false }: SettingRowProps) {
  const { language } = useTranslation();
  const isRtl = language === 'he';
  const className = ['setting-row', stack && 'setting-row-stack', (onClick || to) && 'setting-row-clickable', danger && 'settings-danger'].filter(Boolean).join(' ');
  const valueBelow = value != null && value.length > INLINE_VALUE_MAX_CHARS;
  const text = label ? (
    <div className="setting-row-text">
      <span className="setting-row-label">{label}</span>
      {help && <span className="setting-row-help">{help}</span>}
      {valueBelow && <span className="setting-row-help">{value}</span>}
    </div>
  ) : null;

  if (to) {
    const Chevron = isRtl ? ChevronLeft : ChevronRight;
    return (
      <Link className={className} to={to}>
        {text}
        <span className="setting-row-control">
          {value && !valueBelow && <span className="setting-row-value">{value}</span>}
          <Chevron size={18} aria-hidden />
        </span>
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {text}
        {children && <span className="setting-row-control">{children}</span>}
      </button>
    );
  }

  return (
    <div className={className}>
      {text}
      {children && <span className="setting-row-control">{children}</span>}
    </div>
  );
}

/**
 * A switch. Inside a `SettingRow` with `onClick`, the row itself is the tap
 * target and this is only the picture of the state (`tabIndex=-1`, no
 * handler), so a tap never fires twice; standalone, it is the button.
 */
export function Toggle({ checked, onChange, label, decorative = false }: { checked: boolean; onChange?: (next: boolean) => void; label: string; decorative?: boolean }) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={decorative ? -1 : 0}
      className="toggle"
      onClick={decorative ? undefined : () => onChange?.(!checked)}
      onKeyDown={
        decorative
          ? undefined
          : (e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onChange?.(!checked);
              }
            }
      }
    >
      <span className="toggle-knob" />
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** A pick-one control: every option visible, the chosen one filled with the accent. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: SegmentedOption<T>[]; value: T; onChange: (next: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="segmented">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} className="segmented-option" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A pick-many control laid out as a wrapping row of chips (the year picker). */
export function Chips<T extends string | number>({ options, selected, onToggle, label }: { options: Array<{ value: T; label: string }>; selected: T[]; onToggle: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="chips">
      {options.map((option) => (
        <button key={String(option.value)} type="button" aria-pressed={selected.includes(option.value)} className="chip" onClick={() => onToggle(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
