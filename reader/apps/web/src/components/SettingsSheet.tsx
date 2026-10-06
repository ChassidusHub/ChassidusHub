import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, TouchEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** How far down (px), or how fast (px/ms), a drag has to go to close the sheet rather than spring back. */
const CLOSE_DISTANCE = 100;
const CLOSE_VELOCITY = 0.6;
/** The close animation's length; nothing waits when the viewer asked for less motion. */
const CLOSE_MS = 180;

/** Whether the panel is a sheet from the bottom (a phone), not a card beside the text (a wide screen: see `.reader-panel`). */
function isSheet(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A settings panel whose changes show at once on the page behind it (the
 * reader's, the PDF reader's; the phone's BottomSheet). On a phone it is
 * a sheet from the bottom that follows the finger down and closes past a
 * short distance or on a flick - from its handle and title, or from
 * anywhere in it once scrolled to the top - and springs back otherwise.
 * Escape, the close button or a tap outside close it too.
 */
export function SettingsSheet({ title, onClose, children }: Props) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; time: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);

  const close = () => {
    if (closing) return;
    if (reducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isSheet() || event.touches.length !== 1) return;
    const fromHandle = (event.target as Element).closest('.reader-panel-head') !== null;
    // Inside the contents, a drag down only moves the sheet once they are scrolled to the top.
    if (!fromHandle && (panel.current?.scrollTop ?? 0) > 0) return;
    start.current = { y: event.touches[0]!.clientY, time: performance.now() };
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dy = event.touches[0]!.clientY - start.current.y;
    if (dy <= 0) {
      // Upward: the contents scroll as usual.
      if (dragging) {
        setDrag(0);
        setDragging(false);
      }
      return;
    }
    setDragging(true);
    setDrag(dy);
  };

  const onTouchEnd = () => {
    if (!start.current) return;
    const velocity = drag / Math.max(1, performance.now() - start.current.time);
    start.current = null;
    setDragging(false);
    if (drag > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) close();
    else setDrag(0);
  };

  const offset = closing ? '100%' : `${drag}px`;
  const shade = closing ? 0 : Math.max(0, 1 - drag / 400);

  return (
    <div className="reader-panel-backdrop" onClick={close} role="presentation" style={{ '--sheet-shade': shade } as CSSProperties}>
      <div
        ref={panel}
        tabIndex={-1}
        className={dragging ? 'reader-panel reader-panel-dragging' : 'reader-panel'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{ '--sheet-offset': offset } as CSSProperties}
      >
        <div className="reader-panel-head">
          <span className="reader-panel-grabber" aria-hidden />
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={close} aria-label={t.readerClose}>
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
