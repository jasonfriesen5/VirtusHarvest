import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { useIssuers, setIssuers } from '../state/useIssuers';
import { Button, Card, CardHeader, ErrorNote, Input, Label, PasswordInput, cx } from '../components/ui';
import { formatDateTime } from '../lib/format';
import RemisionHistory from './RemisionHistory';
import { linkFenex, saveIssuer, setDefaultIssuer, unlinkFenex } from '../lib/fenexClient';
import type { Issuer } from '../lib/fenexClient';
import type { Emisor } from '../lib/types';
// DEMO — remove with the trial toggle before launch.
import { isDemo, setDemo } from '../lib/fenexDemo';

const FENEX_URL = 'https://app.fenexpy.com';

/**
 * The details that name an issuer as the hauler, in the order they print.
 *
 * These do NOT appear in the document's header — Fenex fills that from the
 * account the document is sent with. They fill the transportista block for the
 * common case where the issuer carries their own grain.
 *
 * No placeholders: these are fiscal identifiers, and an example RUC sitting in
 * the box reads as though something is already filled in.
 */
const ISSUER_FIELDS: { key: keyof Issuer; label: string }[] = [
  { key: 'razon_social', label: 'Legal name (razón social)' },
  { key: 'ruc', label: 'RUC (without DV)' },
  { key: 'ruc_dv', label: 'DV' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

/**
 * Nota de Remisión settings: whether the feature is on, and which issuers the
 * account can file under.
 *
 * An issuer IS a Fenex login. Fenex takes no issuer fields — it reads who
 * issued a document from the token the request carries — so filing under
 * someone else's name means holding their credentials, which is theirs to
 * give. There is deliberately no way to type a stranger's RUC and issue as
 * them: a timbrado belongs to the person it was granted to.
 */
export default function RemisionSettings() {
  const { user } = useAuth();
  const data = useData();
  const emisor = data.emisor;
  const { issuers, loading, error: issuerError, reload } = useIssuers();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [fenexEmail, setFenexEmail] = useState('');
  const [fenexPassword, setFenexPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [linking, setLinking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [demo, setDemoOn] = useState(isDemo());

  const enabled = emisor?.remision_enabled ?? false;

  async function connect() {
    setLinking(true);
    setError(null);
    try {
      const status = await linkFenex(fenexEmail, fenexPassword, label);
      // Held only long enough to exchange it for a token, then dropped.
      setFenexPassword('');
      setFenexEmail('');
      setLabel('');
      setAdding(false);
      await reload();
      setNotice(`Connected to Fenex as ${status.fenex_email ?? fenexEmail}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  async function disconnect(issuer: Issuer) {
    setLinking(true);
    setError(null);
    try {
      await unlinkFenex(issuer.id);
      await reload();
      setNotice(`${issuer.label ?? issuer.fenex_email} disconnected. Nothing can be issued under it.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  async function makeDefault(issuer: Issuer) {
    setError(null);
    try {
      setIssuers(await setDefaultIssuer(issuer.id));
      setNotice(`New remisiones start as ${issuer.label ?? issuer.fenex_email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save(patch: Record<string, unknown>, message: string) {
    if (!user) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('ht_emisor').upsert(
      { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice(message);
    await data.refresh();
  }

  async function toggle() {
    await save(
      { remision_enabled: !enabled },
      !enabled
        ? 'Remisión enabled. Link the Fenex account that will issue the documents.'
        : 'Remisión turned off. Nothing related to it will appear in the app.',
    );
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
                Remisiones{data.remisiones.length > 0 ? ` (${data.remisiones.length})` : ''}
              </Button>
            )}
            <Button variant={enabled ? 'secondary' : 'primary'} disabled={busy} onClick={() => void toggle()}>
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
            Off. Turn this on only if you haul grain in Paraguay and need a Nota de Remisión
            Electrónica before a truck can leave the field. It requires a Fenex account, which is
            billed separately. While it&rsquo;s off, nothing related to it appears anywhere in the app.
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Issuers ({issuers.length})
                </p>
                {!adding && (
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    Add an issuer
                  </Button>
                )}
              </div>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Each issuer is a Fenex login. The RUC, timbrado and document numbering on the
                document come from that account — none of it is retyped here. Add more than one if
                you also file remisiones on someone else&rsquo;s behalf; you will need their Fenex
                login, which is the only thing that lets a document be issued in their name.
              </p>

              {loading && issuers.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading issuers…</p>
              ) : issuers.length === 0 && !adding ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  No issuer linked yet, so nothing can be issued. Add one to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {issuers.map((issuer) => (
                    <IssuerCard
                      key={issuer.id}
                      issuer={issuer}
                      // The account used to hold ONE set of hauler details,
                      // before issuers existed. Offered as a starting point so
                      // nobody has to retype what they already entered.
                      fallback={emisor}
                      busy={linking}
                      onMakeDefault={() => void makeDefault(issuer)}
                      onDisconnect={() => void disconnect(issuer)}
                      onError={setError}
                      onSaved={(message) => setNotice(message)}
                    />
                  ))}
                </div>
              )}

              {adding && (
                <div className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Name it</Label>
                      <Input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Mi empresa"
                      />
                    </div>
                    <div>
                      <Label>Fenex email</Label>
                      <Input
                        type="email"
                        value={fenexEmail}
                        onChange={(e) => setFenexEmail(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <Label>Fenex password</Label>
                      <PasswordInput
                        value={fenexPassword}
                        onChange={setFenexPassword}
                        autoComplete="off"
                        reveal={reveal}
                        onToggleReveal={() => setReveal((v) => !v)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      disabled={linking || !fenexEmail || !fenexPassword}
                      onClick={() => void connect()}
                    >
                      {linking ? 'Connecting…' : 'Connect'}
                    </Button>
                    <Button disabled={linking} onClick={() => setAdding(false)}>Cancel</Button>
                    <a
                      href={FENEX_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-brand-700 underline dark:text-brand-300"
                    >
                      Create a Fenex account ↗
                    </a>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    The password is used once to obtain a token and is never stored — not here, and
                    not in the database. Fenex tokens last about six months, so this is a
                    twice-a-year step. Connecting an email that is already listed refreshes its
                    token rather than adding a duplicate.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2.5 dark:border-violet-800 dark:bg-violet-950">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={demo}
                  onChange={(e) => {
                    setDemo(e.target.checked);
                    setDemoOn(e.target.checked);
                    void reload();
                    setNotice(
                      e.target.checked
                        ? 'Trial mode on. Nothing will reach Fenex or SET.'
                        : 'Trial mode off.',
                    );
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-violet-600"
                />
                <span className="text-sm text-violet-900 dark:text-violet-100">
                  <strong>Trial mode</strong> — walk through the whole flow without a Fenex
                  account. Issuers, buyers, geography and the issued document are all simulated
                  locally. Nothing reaches Fenex or SET, and no timbrado number is used.
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
      {historyOpen && <RemisionHistory onClose={() => setHistoryOpen(false)} />}
    </Card>
  );
}

/**
 * One issuer: its Fenex connection, and the details that name it as the hauler.
 *
 * The hauler details are editable here; the Fenex identity is not. Everything
 * fiscal about the issuer lives in their Fenex account, and letting it be
 * retyped would create a second version of the truth that quietly disagrees
 * with the document.
 */
function IssuerCard({
  issuer,
  fallback,
  busy,
  onMakeDefault,
  onDisconnect,
  onError,
  onSaved,
}: {
  issuer: Issuer;
  /** Pre-issuer hauler details, used only where this issuer has none of its own. */
  fallback: Emisor | null;
  busy: boolean;
  onMakeDefault: () => void;
  onDisconnect: () => void;
  onError: (message: string) => void;
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    // The issuer's own value wins; the old account-wide one only fills a gap.
    // Nothing is written until Save is pressed, so this is a suggestion rather
    // than a silent migration of one person's details onto another's profile.
    const old = fallback as unknown as Record<string, unknown> | null;
    for (const f of ISSUER_FIELDS) {
      const own = issuer[f.key];
      const prior = old ? old[f.key as string] : null;
      const v = own ?? prior;
      init[f.key as string] = v == null ? '' : String(v);
    }
    return init;
  });

  const usingFallback =
    fallback != null && ISSUER_FIELDS.every((f) => issuer[f.key] == null) &&
    Boolean(fallback.razon_social || fallback.ruc || fallback.address);

  const active = (issuer.subscription_status ?? '').toLowerCase() === 'active';

  async function saveDetails() {
    setSaving(true);
    try {
      const patch: Record<string, string | null> = {};
      for (const f of ISSUER_FIELDS) patch[f.key as string] = form[f.key as string].trim() || null;
      setIssuers(await saveIssuer(issuer.id, patch as Partial<Issuer>));
      onSaved('Hauler details saved.');
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {issuer.label ?? issuer.fenex_email}
            {issuer.is_default && (
              <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                default
              </span>
            )}
            {issuer.subscription_status && (
              <span
                className={cx(
                  'ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  active
                    ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                    : 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
                )}
              >
                {issuer.subscription_status}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {issuer.fenex_email}
            {issuer.razon_social ? ` · ${issuer.razon_social}` : ''}
            {issuer.linked_at ? ` · linked ${formatDateTime(issuer.linked_at)}` : ''}
            {issuer.paid_until ? ` · paid until ${issuer.paid_until}` : ''}
          </p>
        </div>
        {!issuer.is_default && (
          <Button onClick={onMakeDefault}>Make default</Button>
        )}
        <Button onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Hauler details'}</Button>
        <Button variant="danger" disabled={busy} onClick={onDisconnect}>
          Disconnect
        </Button>
      </div>

      {open && (
        <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-800">
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Used only for the <em>transportista</em> block, and only when no third-party hauler is
            set on the truck. The header of the document — RUC, timbrado, number — comes from Fenex
            and cannot be set here.
          </p>
          {usingFallback && (
            <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              Filled in from the details this account held before it could have more than one
              issuer. Check they belong to this issuer, then save — nothing is stored until you do.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {ISSUER_FIELDS.map((f) => (
              <div key={String(f.key)}>
                <Label>{f.label}</Label>
                <Input
                  value={form[f.key as string]}
                  onChange={(e) => setForm({ ...form, [f.key as string]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Button variant="primary" disabled={saving} onClick={() => void saveDetails()}>
              {saving ? 'Saving…' : 'Save hauler details'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
