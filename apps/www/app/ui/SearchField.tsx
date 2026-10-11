import type { InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

/**
 * The search box: big on Home, normal on Search, small inside a menu. It is a
 * real <input type="search">, so a form around it works without JavaScript.
 */
export function SearchField({ size, label, ...input }: { size?: 'big' | 'small'; label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>) {
  return (
    <label className={['search', size].filter(Boolean).join(' ')}>
      <Icon name="search" />
      <span className="sr-only">{label}</span>
      <input type="search" autoComplete="off" enterKeyHint="search" placeholder={label} {...input} />
    </label>
  );
}
