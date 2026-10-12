import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';

const focusable =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * A panel that slides up from the bottom (on a desktop it floats at the foot of
 * the window), over a dimmed page: the path bar's choices on a phone, a
 * footnote, the fix box, the chapters. It keeps the keyboard inside while open,
 * closes on Escape or a tap outside, and gives focus back to what opened it.
 */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // The choice already made, else the close button: never the filter box, which would pop a phone's keyboard up.
    // Unless what opened the sheet has already put focus in it (the fix box, focused in the tap so the keyboard comes).
    const current = panel.current?.querySelector<HTMLElement>('.bd [aria-checked="true"]');
    if (!panel.current?.contains(document.activeElement)) (current ?? panel.current?.querySelector<HTMLElement>('.hd button'))?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: 'center' });
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab' && panel.current) {
        const all = [...panel.current.querySelectorAll<HTMLElement>(focusable)].filter((el) => el.offsetParent !== null);
        const [head, tail] = [all[0], all[all.length - 1]];
        if (event.shiftKey && document.activeElement === head) {
          event.preventDefault();
          tail?.focus();
        } else if (!event.shiftKey && document.activeElement === tail) {
          event.preventDefault();
          head?.focus();
        }
      }
    };
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('keydown', keys);
      opener?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  // A phone's keyboard opened from the sheet (the fix box) is laid over the page, not shrinking it (iOS Safari, and
  // Android Chrome since 108), so it would cover the sheet's foot, Save with it: the sheet stands on the keyboard instead.
  useEffect(() => {
    const view = window.visualViewport;
    const el = panel.current;
    if (!open || !view || !el) return;
    const lift = () => el.style.setProperty('--kb', `${Math.max(0, Math.round(innerHeight - view.height - view.offsetTop))}px`);
    lift();
    view.addEventListener('resize', lift);
    view.addEventListener('scroll', lift);
    return () => {
      view.removeEventListener('resize', lift);
      view.removeEventListener('scroll', lift);
      el.style.removeProperty('--kb');
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <>
      <div className={open ? 'scrim on' : 'scrim'} onClick={onClose} aria-hidden="true" />
      <section ref={panel} className={open ? 'sheet on' : 'sheet'} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} inert={!open}>
        <div className="grab" />
        <div className="hd">
          <h2>{title}</h2>
          <IconButton icon="close" label="סגירה" onClick={onClose} />
        </div>
        <div className="bd">{children}</div>
      </section>
    </>,
    document.body,
  );
}
