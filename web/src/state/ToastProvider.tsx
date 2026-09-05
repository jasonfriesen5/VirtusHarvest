import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../components/ui';

/**
 * Confirmation that a write landed. The app has the same thing for the same
 * reason: a save that produces no visible response is indistinguishable from a
 * dead button, and the table it changed may be scrolled off screen.
 */
type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

const ToastContext = createContext<((text: string, tone?: Tone) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((text: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    // Errors stay up longer: they usually need reading, not just noticing.
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto max-w-md rounded-lg border px-3 py-2 text-sm shadow-lg',
              t.tone === 'error'
                ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                : t.tone === 'info'
                  ? 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  : 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-900/50 dark:text-brand-100',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
