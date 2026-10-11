import { useEffect, useState } from 'react';
import { Field } from '../ui';

export type UsernameCheck = { ok: boolean; message: string | null; suggestion: string | null };

const USERNAME_SAID: Record<string, string> = {
  invalid: 'שם משתמש: 2 עד 39 אותיות לטיניות, ספרות ומקפים בודדים.',
  reserved: 'המילה הזאת שמורה לאתר. בחרו אחרת.',
  taken: 'שם המשתמש הזה תפוס. בחרו אחר.',
};

/** Whether a handle can be had, asked while the person types, and a free one suggested from their name. */
export function useUsername(username: string, from: string): UsernameCheck {
  const [check, setCheck] = useState<UsernameCheck>({ ok: true, message: null, suggestion: null });
  useEffect(() => {
    const wanted = username.trim().replace(/^@/, '');
    if (!wanted && !from.trim()) return setCheck({ ok: true, message: null, suggestion: null });
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ name: wanted, from });
      const answer = (await fetch(`/_/auth/username?${query}`, { headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { available: boolean; reason?: string | null; suggestion?: string | null } | null;
      if (!answer) return setCheck((was) => ({ ...was, ok: true, message: null }));
      setCheck({ ok: !wanted || answer.available, message: wanted && !answer.available ? (USERNAME_SAID[answer.reason ?? ''] ?? USERNAME_SAID.taken!) : null, suggestion: answer.suggestion ?? null });
    }, 300);
    return () => clearTimeout(timer);
  }, [username, from]);
  return check;
}

export function UsernameField({ value, onChange, check, label = 'שם משתמש, לאזכורים (@)' }: { value: string; onChange: (value: string) => void; check: UsernameCheck; label?: string }) {
  return (
    <Field
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={40}
      dir="ltr"
      autoComplete="username"
      autoCapitalize="none"
      spellCheck={false}
      placeholder={check.suggestion ?? undefined}
      aria-invalid={check.message ? true : undefined}
      hint={check.message ?? (check.suggestion && !value ? `אם תשאירו ריק: @${check.suggestion}` : 'אותיות לטיניות, ספרות ומקפים.')}
    />
  );
}

