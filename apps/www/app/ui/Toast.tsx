import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastAction {
  label: string;
  run: () => void;
}
type Show = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<Show>(() => {});

/** How long a message stays: long enough to read it and press Undo. */
const STAY_MS = 5000;

/**
 * One short message at a time at the foot of the screen ("התיקון עלה לאתר"),
 * with at most one action, usually Undo. Screen readers hear it as it comes.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback<Show>((message, action) => setToast({ message, action, id: Date.now() }), []);
  useEffect(() => {
    clearTimeout(timer.current);
    if (toast) timer.current = setTimeout(() => setToast(null), STAY_MS);
    return () => clearTimeout(timer.current);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={toast ? 'toast on' : 'toast'} role="status" aria-live="polite">
        <span>{toast?.message}</span>
        <span className="sp" />
        {toast?.action && (
          <button
            type="button"
            onClick={() => {
              // Cleared first, so the action may show a message of its own ("בוטל").
              setToast(null);
              toast.action?.run();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/** `toast(message, { label: 'בטל', run: undo })` from anywhere inside the app. */
export const useToast = () => useContext(ToastContext);
