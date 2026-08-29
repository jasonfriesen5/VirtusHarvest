import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { buildFenexRequest } from '../lib/fenexMapping';
import { normalise, validate } from '../lib/fenexPayload';
import type { MappingContext } from '../lib/fenexMapping';
import type { FenexRequest } from '../lib/fenexPayload';
import { createRemission, fetchRemissionPdf } from '../lib/fenexClient';
import RemisionForm from './RemisionForm';
import type { Truckload } from '../lib/truckloads';
import type { Remision } from '../lib/types';
import { Button, cx } from './ui';
import { formatDateTime } from '../lib/format';

/**
 * Issuing a Nota de Remisión for one truckload. The document is created by an
 * accredited provider — this only assembles the data, shows what is missing,
 * and records what came back.
 */
export default function RemisionPanel({ load }: { load: Truckload }) {
  const { user } = useAuth();
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const closingId = load.closedBy?.id ?? null;
  const remision: Remision | undefined = closingId
    ? data.remisiones.find((r) => r.closing_weighing_id === closingId)
    : undefined;

  const destination = load.destination
    ? data.destinations.find((d) => d.name === load.destination)
    : undefined;

  const ctx: MappingContext = useMemo(
    () => ({
      emisor: data.emisor,
      destinations: data.destinations,
      trucks: data.trucks,
      crops: data.crops,
      fields: data.fields,
      farms: data.farms,
    }),
    [data.emisor, data.destinations, data.trucks, data.crops, data.fields, data.farms],
  );

  /** The draft as it stands: what was saved, or a fresh prefill if nothing is. */
  const currentDraft = useMemo<FenexRequest>(
    () => (remision?.request_payload as FenexRequest) ?? buildFenexRequest(load, ctx),
    [remision, load, ctx],
  );

  // The same rules Fenex enforces, applied here first. With no sandbox and no
  // cancellation, a payload that fails here is a document that never existed.
  const missing = useMemo(
    () => validate(normalise(currentDraft)).map((i) => `${i.field} — ${i.message}`),
    [currentDraft],
  );
  const savedDraft = Boolean(remision?.request_payload);

  // Off means invisible: a farm that doesn't issue remisiones should never see
  // a button, a warning, or a mention of the feature.
  if (!data.emisor?.remision_enabled) return null;
  // Destinations that aren't sales — your own bins — never need a document.
  if (!closingId || !destination?.requires_remision) return null;

  /** Writes the draft without sending, so typed corrections survive a reload. */
  async function saveDraft(draft: FenexRequest) {
    if (!user || !closingId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('ht_remisiones').upsert(
      {
        closing_weighing_id: closingId,
        user_id: user.id,
        status: 'draft',
        request_payload: draft,
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'closing_weighing_id' },
    );
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setFormOpen(false);
    await data.refresh();
  }

  async function createRemision(draft: FenexRequest) {
    if (!user || !closingId) return;
    setBusy(true);
    setError(null);

    const payload = normalise(draft);

    // Claim the row as `sending` first. If the tab closes or the network dies
    // mid-flight the truckload shows as in-progress rather than untouched,
    // which is the state that tempts someone into pressing the button again.
    const { error: claimError } = await supabase.from('ht_remisiones').upsert(
      {
        closing_weighing_id: closingId,
        user_id: user.id,
        status: 'sending',
        request_payload: payload,
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'closing_weighing_id' },
    );
    if (claimError) {
      setBusy(false);
      setError(claimError.message);
      return;
    }

    try {
      const result = await createRemission(payload);

      // The KuDE lives behind Fenex's token, so a copy is pulled into our own
      // storage — that is what makes a link the driver can actually open.
      let pdfUrl: string | null = null;
      let pdfPath: string | null = null;
      try {
        const pdf = await fetchRemissionPdf(result.id);
        pdfUrl = pdf.url;
        pdfPath = pdf.path;
      } catch {
        // The document exists either way; the PDF can be fetched again later.
      }

      await supabase.from('ht_remisiones').upsert(
        {
          closing_weighing_id: closingId,
          user_id: user.id,
          // READY means Fenex created it but SET has not accepted it yet —
          // retrying the same key is safe and is what resolves it.
          status: result.status === 'APPROVED' || result.status === 'SUBMITTED' ? 'issued' : 'sending',
          fenex_remission_id: result.id,
          fenex_status: result.status,
          numero: result.remissionNumber,
          cdc: result.cdc,
          pdf_url: pdfUrl,
          pdf_path: pdfPath,
          issued_at: result.issuedAt ?? new Date().toISOString(),
          response_payload: result as never,
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'closing_weighing_id' },
      );
      setFormOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Back to `draft`, not `failed`: the typed data is intact and no document
      // was issued, so this is unsent work rather than a broken record.
      await supabase.from('ht_remisiones').upsert(
        {
          closing_weighing_id: closingId,
          user_id: user.id,
          status: 'draft',
          request_payload: payload,
          error_message: message,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'closing_weighing_id' },
      );
      setError(message);
    } finally {
      setBusy(false);
      await data.refresh();
    }
  }

  async function share() {
    if (!remision?.pdf_url) return;
    const text = `Nota de Remisión ${remision.numero ?? ''} — ${load.truck} → ${load.destination ?? ''}`;
    // The Web Share API is how this reaches WhatsApp on a phone, which is how
    // the driver actually receives it. Desktop falls back to copying the link.
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url: remision.pdf_url });
        return;
      } catch {
        // Cancelled by the user — nothing to report.
        return;
      }
    }
    await navigator.clipboard.writeText(remision.pdf_url);
    setError(null);
  }

  const status = remision?.status ?? 'draft';

  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Nota de Remisión
        </span>
        <StatusChip status={status} />

        {status === 'issued' && remision?.numero && (
          <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
            {remision.numero}
          </span>
        )}

        <span className="ml-auto flex flex-wrap gap-2">
          {status === 'issued' ? (
            <>
              {remision?.pdf_url ? (
                <>
                  <a
                    href={remision.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg bg-gold-500 px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-600"
                  >
                    View PDF
                  </a>
                  <Button onClick={() => void share()}>Share</Button>
                </>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Issued, but the provider returned no PDF link.
                </span>
              )}
            </>
          ) : (
            <>
              {/* Always available: this is where missing details get typed in,
                  so it must never be blocked by the details being missing. */}
              <Button
                disabled={busy || status === 'sending'}
                onClick={() => {
                  setError(null);
                  setFormOpen(true);
                }}
              >
                {savedDraft ? 'Edit details' : 'Fill in details'}
              </Button>
              <Button
                variant="primary"
                disabled={busy || status === 'sending' || missing.length > 0}
                title={
                  missing.length > 0
                    ? `${missing.length} field${missing.length === 1 ? '' : 's'} still needed`
                    : undefined
                }
                onClick={() => {
                  setError(null);
                  void createRemision(currentDraft);
                }}
              >
                {busy || status === 'sending' ? 'Sending…' : 'Create remisión'}
              </Button>
            </>
          )}
        </span>
      </div>

      {status === 'issued' && remision?.cdc && (
        <p className="mt-1.5 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
          CDC {remision.cdc}
          {remision.issued_at && (
            <span className="font-sans"> · issued {formatDateTime(remision.issued_at)}</span>
          )}
        </p>
      )}

      {status === 'sending' && (
        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
          Waiting for the provider. Don&rsquo;t press again — if a document was created, retrying
          with the same key returns it rather than issuing a second one.
        </p>
      )}

      {(error || remision?.error_message) && status !== 'issued' && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error ?? remision?.error_message}
        </p>
      )}

      {formOpen && (
        <RemisionForm
          initial={currentDraft}
          busy={busy}
          onClose={() => setFormOpen(false)}
          onSaveDraft={(d) => void saveDraft(d)}
          onSend={(d) => void createRemision(d)}
        />
      )}

      {status === 'draft' && Boolean(remision?.request_payload) && !formOpen && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          A filled draft is saved for this truckload. Nothing has been issued yet.
        </p>
      )}

      {missing.length > 0 && status !== 'issued' && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
            {missing.length} field{missing.length === 1 ? '' : 's'} still needed
            {savedDraft ? '' : ' — press “Fill in details” to complete them'}:
          </p>
          <ul className="mt-1 space-y-0.5">
            {missing.map((m) => (
              <li key={m} className="text-xs text-amber-800 dark:text-amber-200">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const style = {
    draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    sending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    issued: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  }[status] ?? 'bg-slate-100 text-slate-600';

  const label = { draft: 'not issued', sending: 'sending', issued: 'issued', failed: 'failed' }[status] ?? status;

  return (
    <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-semibold', style)}>{label}</span>
  );
}
