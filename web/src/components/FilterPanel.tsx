import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../state/PrefsProvider';
import { Button, cx } from './ui';

/**
 * Filters folded behind a button, because on most days nobody is filtering —
 * the table is the page, and a permanent row of empty inputs pushes it down
 * the screen for no return.
 *
 * The one rule a collapsed filter has to obey: **it must never hide that it is
 * filtering.** A table showing 12 of 900 rows with the reason folded away is a
 * bug report waiting to happen, so the count of active filters sits on the
 * button, clearing them is reachable without opening the panel, and the panel
 * opens by itself when something is already set.
 */
export function FilterPanel({
  activeCount,
  onClear,
  children,
}: {
  /** How many filters currently narrow the data. */
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(activeCount > 0);

  return (
    <div className="border-t border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="mr-1.5 inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : undefined }}>
            ›
          </span>
          {t('Filtros')}
          {activeCount > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </Button>

        {activeCount > 0 && (
          <>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('{v1} filtro(s) activo(s)', { v1: activeCount })}
            </span>
            <Button variant="ghost" onClick={onClear} className="text-xs">
              {t('Limpiar')}
            </Button>
          </>
        )}
      </div>

      <div className={cx(open ? 'block' : 'hidden')}>{children}</div>
    </div>
  );
}
