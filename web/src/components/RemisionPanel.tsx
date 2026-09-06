import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { buildFenexRequest, routeKeyFor } from '../lib/fenexMapping';
import { isFenexRequest, normalise, validate } from '../lib/fenexPayload';
import type { MappingContext } from '../lib/fenexMapping';
import type { FenexRequest } from '../lib/fenexPayload';
import {
  canSendApproval,
  fetchRemissionPdf,
  sendDraftForApproval,
  syncFenexRemissions,
} from '../lib/fenexClient';
import { truckloadCropError } from '../lib/truckloadCrop';
import { useIssuers } from '../state/useIssuers';
import RemisionForm from './RemisionForm';
import type { Truckload } from '../lib/truckloads';
import type { Remision } from '../lib/types';
import { Button, Modal } from './ui';
import { remisionState, remisionLabels, remisionLocked } from '../lib/remisionWorkflow';
import {
  refreshDraftSources,
  requestFromStored,
  sourceFromStored,
  sourcesChanged,
  storeDraft,
} from '../lib/draftSources';

/**
 * Issuing a Nota de Remisión for one truckload. The document is created by an
 * accredited provider — this only assembles the data, shows what is missing,
 * and records what came back.
 */
export default function RemisionPanel({ load }: { load: Truckload }) {
  const { user } = useAuth();
  const data = useData();
  const [confirmation, setConfirmation] = useState<FenexRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [refreshedDraft, setRefreshedDraft] = useState<FenexRequest | null>(null);
  const { issuers, defaultIssuer } = useIssuers();
  // Which issuer this document goes out under. Null until the list arrives,
  // then the one already recorded on the draft, else the account default.
  const [pickedIssuerId, setPickedIssuerId] = useState<string | null>(null);

  const closingId = load.closedBy?.id ?? null;
  const remision: Remision | undefined = closingId
    ? data.remisiones.find((r) => r.closing_weighing_id === closingId)
    : undefined;

  const destination = load.destination
    ? data.destinations.find((d) => d.name === load.destination)
    : undefined;

  const issuerId = pickedIssuerId ?? remision?.issuer_id ?? defaultIssuer?.id ?? null;
  const issuer = issuers.find((i) => i.id === issuerId && i.connection_status === 'APPROVED') ?? null;

  const ctx: MappingContext = useMemo(
    () => ({
      issuer,
      destinations: data.destinations,
      trucks: data.trucks,
      crops: data.crops,
      fields: data.fields,
      farms: data.farms,
      routes: data.routes,
    }),
    [issuer, data.destinations, data.trucks, data.crops, data.fields, data.farms, data.routes],
  );

  /**
   * The draft as it stands: what was saved, or a fresh prefill.
   *
   * A saved payload is only reused when it matches the current shape. Drafts
   * written before the payload was rebuilt for Fenex have no `remission` key,
   * and reaching into it threw — which blanked the page instead of showing the
   * truckload.
   */
  const savedPayload = remision?.request_payload;
  const legacyDraft = savedPayload != null && !isFenexRequest(savedPayload);
  const sourceDraft = useMemo<FenexRequest>(
    () => buildFenexRequest(load, ctx),
    [load, ctx],
  );
  const savedRequest = requestFromStored(savedPayload);
  const oldSource = sourceFromStored(savedPayload);
  const sourceChanged = sourcesChanged(savedPayload, sourceDraft);
  const currentDraft = refreshedDraft ?? savedRequest ?? sourceDraft;

  // The same rules Fenex enforces, applied here first. With no sandbox and no
  // cancellation, a payload that fails here is a document that never existed.
  const missing = useMemo(
    () => validate(normalise(currentDraft)).map((i) => `${i.field} — ${i.message}`),
    [currentDraft],
  );
  const savedDraft = isFenexRequest(savedPayload);

  useEffect(() => {
    if (!user || !remision?.fenex_remission_id
        || ['APPROVED', 'REJECTED', 'CANCELLED'].includes(remision.fenex_status ?? '')) return;
    let active = true;
    let syncing = false;
    const pull = async () => {
      if (syncing) return;
      syncing = true;
      try {
        await syncFenexRemissions();
        if (active) await data.refresh();
      } catch {
        // A temporary poll failure does not undo a successfully delivered draft.
      } finally {
        syncing = false;
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user, remision?.fenex_remission_id, remision?.fenex_status, data.refresh]);

  // Off means invisible: a farm that doesn't issue remisiones should never see
  // a button, a warning, or a mention of the feature.
  if (!data.emisor?.remision_enabled) return null;
  // Destinations that aren't sales — your own bins — never need a document.
  if (!closingId || !destination?.requires_remision) return null;

  /**
   * Distances are learned rather than configured: whatever is entered for this
   * farm-and-buyer pair is remembered and prefilled next time that route comes
   * up, so nobody has to maintain a table of kilometres by hand.
   */
  async function rememberRoute(draft: FenexRequest) {
    if (!user) return;
    const key = routeKeyFor(load, ctx);
    const km = draft.remission.estimatedDistanceKm;
    if (!key || km == null) return;
    await supabase.from('ht_routes').upsert(
      {
        user_id: user.id,
        farm_id: key.farmId,
        destination_id: key.destinationId,
        distance_km: km,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,farm_id,destination_id' },
    );
  }

  /** Writes the draft without sending, so typed corrections survive a reload. */
  async function saveDraft(draft: FenexRequest) {
    if (!user || !closingId || (remision && remisionLocked(remision))) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('ht_remisiones').upsert(
      {
        closing_weighing_id: closingId,
        user_id: user.id,
        status: 'draft',
        request_payload: storeDraft(
          draft,
          sourceChanged && !refreshedDraft && oldSource ? oldSource : sourceDraft,
        ),
        issuer_id: issuerId,
        issuer_name: issuer?.label ?? issuer?.razon_social ?? null,
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
    await rememberRoute(draft);
    setRefreshedDraft(null);
    setFormOpen(false);
    await data.refresh();
  }

  async function createRemision(draft: FenexRequest) {
    if (!user || !closingId || busy || sourceChanged || !canSendApproval() || (remision && remisionLocked(remision))) return;
    const payload = normalise(draft);
    if (validate(payload).length || !issuer || truckloadCropError(load.loads)) return;
    setBusy(true); setError(null); setConfirmation(null); setFormOpen(false);
    try {
      const { error: saveError } = await supabase.from('ht_remisiones').upsert(
        {
          closing_weighing_id: closingId,
          user_id: user.id,
          status: 'sending',
          request_payload: payload,
          response_payload: null,
          issuer_id: issuerId,
          issuer_name: issuer.label ?? issuer.razon_social ?? null,
          fenex_status: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'closing_weighing_id' },
      );
      if (saveError) throw new Error(saveError.message);
      await data.refresh();
      const result = await sendDraftForApproval(payload, issuerId);
      const { error: resultError } = await supabase.from('ht_remisiones').update({
        fenex_remission_id: result.id,
        fenex_status: result.status,
        response_payload: result,
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq('closing_weighing_id', closingId).eq('user_id', user.id);
      if (resultError) throw new Error(resultError.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase.from('ht_remisiones').update({
        error_message: message,
        updated_at: new Date().toISOString(),
      }).eq('closing_weighing_id', closingId).eq('user_id', user.id);
      setError(message);
    } finally { setBusy(false); await data.refresh(); }
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

  const status = remisionState(remision);
  const frozen = !!remision && remisionLocked(remision);
  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Nota de Remisión · {remisionLabels[status]}</span>
        {!frozen && <>
          <Button disabled={busy} onClick={() => setFormOpen(true)}>{savedDraft ? 'Edit details' : 'Fill in details'}</Button>
          <Button variant="primary" disabled={busy || sourceChanged || !canSendApproval() || missing.length > 0 || !issuer}
            onClick={() => setConfirmation(currentDraft)}>Send for approval</Button>
        </>}
        {status === 'approved' && remision?.pdf_url && <>
          <a href={remision.pdf_url} target="_blank" rel="noopener noreferrer">View PDF</a>
          <Button onClick={() => void share()}>Share</Button>
        </>}
        {status === 'approved' && !remision?.pdf_url && remision?.fenex_remission_id &&
          <Button onClick={async () => {
            try {
              const pdf = await fetchRemissionPdf(remision.fenex_remission_id!, remision.issuer_id);
              if (pdf.url) window.open(pdf.url, '_blank', 'noopener,noreferrer');
            } catch (e) { setError(String(e)); }
          }}>Get PDF</Button>}
      </div>
      {sourceChanged && !frozen && oldSource && savedRequest && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="flex-1 text-xs text-amber-900 dark:text-amber-100">
            Destination, truck, field, crop or weight details changed after this draft was saved.
          </p>
          <Button onClick={() => {
            setRefreshedDraft(refreshDraftSources(savedRequest, oldSource, sourceDraft));
            setFormOpen(true);
          }}>Refresh draft</Button>
        </div>
      )}
      {frozen && status !== 'approved' && <p className="mt-2 text-xs text-slate-500">This truckload is locked to keep its transactions consistent with the details sent to Fenex.</p>}
      {(error || remision?.error_message) && <p role="alert" className="mt-2 text-sm text-red-600">{error || remision?.error_message}</p>}
      {legacyDraft && !frozen && <p className="text-xs">Open and check the details rebuilt from this truckload before saving.</p>}
      {!frozen && missing.length > 0 && <p className="mt-2 text-xs text-amber-700">{missing.length} fields still needed — open Fill in details.</p>}
      {formOpen && !frozen && <RemisionForm initial={currentDraft} busy={busy} issuers={issuers.filter(i => i.connection_status === 'APPROVED')}
        issuerId={issuerId} onIssuerChange={setPickedIssuerId} onClose={() => setFormOpen(false)}
        onSaveDraft={d => void saveDraft(d)} onSend={d => { setFormOpen(false); setConfirmation(d); }} />}
      {confirmation && <Modal title="Send for approval?" onClose={() => setConfirmation(null)}>
        <p>Send this draft to {issuer?.label || issuer?.razon_social} (RUC {issuer?.ruc}{issuer?.ruc_dv ? '-' + issuer.ruc_dv : ''}) for review in Fenex? They will review it and create the remisión there.</p>
        <p className="mt-3">{confirmation.remission.receiverName} · {confirmation.remission.vehiclePlate} · {confirmation.remission.cargoWeight?.toLocaleString()} kg wet weight</p>
        <div className="mt-4 flex gap-2"><Button onClick={() => setConfirmation(null)}>Back</Button>
          <Button variant="primary" disabled={busy || !canSendApproval()} onClick={() => void createRemision(confirmation)}>Send for approval</Button></div>
      </Modal>}
    </div>
  );
}
