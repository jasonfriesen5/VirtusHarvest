import { useMemo, useState } from 'react';
import { useData } from '../state/DataProvider';
import { fetchRemissionPdf } from '../lib/fenexClient';
import { isFenexRequest } from '../lib/fenexPayload';
import type { FenexRequest } from '../lib/fenexPayload';
import type { Remision } from '../lib/types';
import { formatDate } from '../lib/format';
import { Button, EmptyState, ErrorNote, Modal, cx } from './ui';

/**
 * Every remisión this account has raised, newest first.
 *
 * The point is retrieval: months later somebody needs the document for a load
 * that left in March, and the useful handles are the date, the buyer and the
 * number — not an internal id.
 */

interface Row {
  remision: Remision;
  date: string | null;
  numero: string;
  receptor: string;
  plate: string;
  kg: number;
}

function summarise(r: Remision): Row {
  const payload = isFenexRequest(r.request_payload) ? (r.request_payload as FenexRequest) : null;
  return {
    remision: r,
    // issued_at is the moment SET accepted it; the payload's issueDate is what
    // the document itself says, and is the better label when both exist.
    date: payload?.remission.issueDate ?? r.issued_at ?? r.created_at,
    numero: r.numero ?? '—',
    receptor: payload?.remission.receiverName || '—',
    plate: payload?.remission.vehiclePlate || '',
    kg: payload?.items.reduce((s, i) => s + (i.quantity || 0), 0) ?? 0,
  };
}

const monthOf = (iso: string | null): string => {
  if (!iso) return 'Undated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Undated';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

export default function RemisionHistory({ onClose }: { onClose: () => void }) {
  const { remisiones, refresh } = useData();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const rows = remisiones
      .map(summarise)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    const out = new Map<string, Row[]>();
    for (const row of rows) {
      const key = monthOf(row.date);
      const list = out.get(key);
      if (list) list.push(row);
      else out.set(key, [row]);
    }
    return [...out.entries()];
  }, [remisiones]);

  /** Signed links expire; this mints a fresh one from the stored PDF. */
  async function openPdf(row: Row) {
    if (row.remision.pdf_url) {
      window.open(row.remision.pdf_url, '_blank', 'noopener');
      return;
    }
    const id = row.remision.fenex_remission_id;
    if (!id) {
      setError('No PDF was stored for this remisión.');
      return;
    }
    setBusyId(row.remision.closing_weighing_id);
    setError(null);
    try {
      const pdf = await fetchRemissionPdf(id);
      if (pdf.url) window.open(pdf.url, '_blank', 'noopener');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Remisiones" onClose={onClose} wide>
      {error && <ErrorNote message={error} />}

      {grouped.length === 0 ? (
        <EmptyState
          title="No remisiones yet"
          hint="They appear here once a truckload has one raised against it."
        />
      ) : (
        <div className="space-y-5">
          {grouped.map(([month, rows]) => (
            <section key={month}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {month}
              </h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {rows.map((row) => {
                  const issued = row.remision.status === 'issued' || Boolean(row.remision.cdc);
                  return (
                    <li
                      key={row.remision.closing_weighing_id}
                      className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-48 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {row.receptor}
                          <span
                            className={cx(
                              'ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              issued
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                            )}
                          >
                            {issued ? 'issued' : (row.remision.status ?? 'draft')}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(row.date)}
                          {row.numero !== '—' && ` · ${row.numero}`}
                          {row.plate && ` · ${row.plate}`}
                          {row.kg > 0 && ` · ${row.kg.toLocaleString()} kg`}
                        </p>
                        {row.remision.cdc && (
                          <p className="mt-0.5 font-mono text-[10px] break-all text-slate-400 dark:text-slate-500">
                            {row.remision.cdc}
                          </p>
                        )}
                      </div>

                      {issued ? (
                        <Button
                          variant="primary"
                          disabled={busyId === row.remision.closing_weighing_id}
                          onClick={() => void openPdf(row)}
                        >
                          {busyId === row.remision.closing_weighing_id ? 'Fetching…' : 'Open PDF'}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          not issued
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        {remisiones.length} record{remisiones.length === 1 ? '' : 's'}. Issued documents cannot be
        amended, and the loads behind them are locked to match.
      </p>
    </Modal>
  );
}
