import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { useIssuers } from '../state/useIssuers';
import {
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Input,
  Label,
  cx,
} from './ui';
import RemisionHistory from './RemisionHistory';
import { requestFenexConnection, setDefaultIssuer, unlinkFenex } from '../lib/fenexClient';
import type { Issuer } from '../lib/fenexClient';

/** RUC connections are approved by the issuer; no credentials are collected. */
export default function RemisionSettings() {
  const { user } = useAuth();
  const data = useData();
  const { issuers, loading, error: issuerError, reload } = useIssuers();

  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [ruc, setRuc] = useState('');

  const enabled = data.emisor?.remision_enabled ?? false;

  async function saveFeature(on: boolean) {
    if (!user) return;
    setBusy(true);
    setError(null);
    const { error: saveError } = await supabase.from('ht_emisor').upsert(
      { user_id: user.id, remision_enabled: on, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setNotice(on ? 'Nota de Remisión enabled.' : 'Nota de Remisión turned off.');
    await data.refresh();
  }

  async function connect() {
    setLinking(true);
    setError(null);
    try {
      await requestFenexConnection(label.trim(), ruc.trim());
      setRuc('');
      setLabel('');
      setAdding(false);
      await reload();
      setNotice('Connection request received by Fenex. The issuer must approve it in Fenex.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  async function remove(issuer: Issuer) {
    setLinking(true);
    setError(null);
    try {
      await unlinkFenex(issuer.id);
      await reload();
      setNotice(`${issuer.label ?? issuer.fenex_email ?? 'Fenex profile'} disconnected.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  async function makeDefault(issuer: Issuer) {
    setError(null);
    try {
      await setDefaultIssuer(issuer.id);
      await reload();
      setNotice(`${issuer.label ?? issuer.fenex_email} is now selected by default.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Nota de Remisión"
        subtitle="Paraguay only — the legal transport document for a loaded truck"
        action={
          <div className="flex gap-2">
            {enabled && (
              <Button onClick={() => setHistoryOpen(true)}>
                Remisiones{data.remisiones.length ? ` (${data.remisiones.length})` : ''}
              </Button>
            )}
            <Button
              variant={enabled ? 'secondary' : 'primary'}
              disabled={busy}
              onClick={() => void saveFeature(!enabled)}
            >
              {busy ? 'Saving…' : enabled ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
        }
      />

      <div className="p-4">
        {error && <ErrorNote message={error} />}
        {issuerError && !error && <ErrorNote message={issuerError} />}
        {notice && (
          <p className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
            {notice}
          </p>
        )}

        {!enabled ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Off. Nothing related to remisiones appears elsewhere in the app.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Fenex profiles ({issuers.length})
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Select the issuing account on each remisión. Its legal identity, timbrado and
                  numbering come from Fenex.
                </p>
              </div>
              <Button disabled={loading || linking} onClick={() => void reload()}>Refresh connections</Button>
              {!adding && <Button variant="primary" onClick={() => setAdding(true)}>Add profile</Button>}
            </div>

            {loading && issuers.length === 0 ? (
              <p className="text-sm text-slate-500">Loading profiles…</p>
            ) : issuers.length === 0 && !adding ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                No Fenex profile connected yet.
              </p>
            ) : (
              <div className="space-y-3">
                {issuers.map((issuer) => (
                  <IssuerRow
                    key={issuer.id}
                    issuer={issuer}
                    busy={linking}
                    onDefault={() => void makeDefault(issuer)}
                    onRemove={() => void remove(issuer)}
                  />
                ))}
              </div>
            )}

            {adding && (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Profile name</Label>
                    <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Dad's account" />
                  </div>
                  <div>
                    <Label>RUC (including DV)</Label>
                    <Input value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="80012345-6" maxLength={10} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    disabled={linking || !label.trim() || !/^[0-9]{3,8}-[0-9]$/.test(ruc.trim())}
                    onClick={() => void connect()}
                  >
                    {linking ? 'Requesting…' : 'Request connection'}
                  </Button>
                  <Button disabled={linking} onClick={() => setAdding(false)}>Cancel</Button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  The issuer approves inside Fenex. No password is needed.
                  The updated Fenex backend and its app inbox must be deployed first.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {historyOpen && <RemisionHistory onClose={() => setHistoryOpen(false)} />}
    </Card>
  );
}

function IssuerRow({
  issuer,
  busy,
  onDefault,
  onRemove,
}: {
  issuer: Issuer;
  busy: boolean;
  onDefault: () => void;
  onRemove: () => void;
}) {
  const active = issuer.connection_status === 'APPROVED';
  const status = { PENDING: 'Awaiting approval', APPROVED: 'Connected', REJECTED: 'Declined', REVOKED: 'Disconnected', UNAVAILABLE: 'Not connected' }[issuer.connection_status ?? 'UNAVAILABLE'];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {issuer.label ?? issuer.fenex_email}
          {issuer.is_default && (
            <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
              default
            </span>
          )}
          {status && (
            <span className={cx(
              'ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              active
                ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                : 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
            )}>
              {status}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {issuer.ruc}{issuer.ruc_dv ? `-${issuer.ruc_dv}` : ''}
        </p>
      </div>
      {active && !issuer.is_default && <Button onClick={onDefault}>Make default</Button>}
      {['PENDING', 'APPROVED'].includes(issuer.connection_status ?? '') && <Button variant="danger" disabled={busy} onClick={onRemove}>{active ? 'Disconnect' : 'Cancel request'}</Button>}
    </div>
  );
}
