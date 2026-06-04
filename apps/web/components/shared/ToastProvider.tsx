'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Toast } from './Toast';

type ToastTone = 'success' | 'error' | 'warning';

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  pushToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * App-wide toast queue. Mounted in AppShell so every authenticated surface
 * shares one stack. The visual is the same `Toast` component every inline
 * usage already renders; this provider just adds the queue + the auto-dismiss
 * timer + the fixed-position container.
 *
 * Fail-open contract: callers outside the provider receive a no-op
 * `pushToast`. The bell uses this so an SSR render or an auth-page mount
 * can't crash trying to push a toast — silence beats an exception when the
 * provider hasn't yet wrapped the tree.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return { pushToast: () => undefined };
  }
  return context;
}

const DEFAULT_DISMISS_MS = 4000;

type ToastProviderProps = {
  children: ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // Track timer ids so unmount cancels pending dismissals. Without this, a
  // toast pushed right before navigation could fire setItems on a torn-down
  // tree. Initialized empty so React Compiler doesn't treat it as tracking
  // some prop's initial value.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const pushToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev, { id, message, tone }]);

      const handle = setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
        timersRef.current.delete(id);
      }, DEFAULT_DISMISS_MS);
      timersRef.current.set(id, handle);
    },
    []
  );

  useEffect(() => {
    return () => {
      // Cancel any pending dismiss timers on unmount.
      for (const handle of timersRef.current.values()) {
        clearTimeout(handle);
      }
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      {items.length ? (
        // aria-live="polite" so SR users get the message without interrupting
        // any other speech. The container itself is pointer-events-none so it
        // never blocks clicks on the page behind it; each toast re-enables
        // pointer events on its own row.
        <div
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed inset-x-4 bottom-6 z-[200] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6"
        >
          {items.map((item) => (
            <div key={item.id} className="pointer-events-auto animate-enter w-full max-w-sm">
              <Toast message={item.message} tone={item.tone} />
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
