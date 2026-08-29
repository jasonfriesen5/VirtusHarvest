import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { Button, Card, CardHeader, ErrorNote, Input, Label, PasswordInput, cx } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { fenexStatus, linkFenex, unlinkFenex } from '../lib/fenexClient';
// DEMO — remove with the trial toggle before launch.
import { isDemo, setDemo } from '../lib/fenexDemo';
import type { FenexLinkStatus } from '../lib/fenexClient';

const FENEX_URL = 'https://app.fenexpy.com';

/**
 * The issuer fields a Nota de Remisión requires, in the order they print.
 *
 * No placeholders: these are fiscal identifiers, and an example RUC or timbrado
 * sitting in the box reads as though something is already filled in.
 */
const EMISOR_FIELDS: { key: string; label: string }[] = [
  { key: 'razon_social', label: 'Legal name (razón social)' },
  { key: 'ruc', label: 'RUC (without DV)' },
  { key: 'ruc_dv', label: 'DV' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

export default function RemisionSettings() {
  const { user } = useAuth();
  const data = useData();
  const emisor = data.emisor;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of EMISOR_FIELDS) {
      const v = emisor ? (emisor as unknown as Record<string, unknown>)[f.key] : null;
      init[f.key] = v == null ? '' : String(v);
    }
    return init;
  });

  // The Fenex link lives outside the shared store: the token is server-side and
  // only the Edge Function can see it, so status is asked for directly.
  const [link, setLink] = useState<FenexLinkStatus | null>(null);
  const [fenexEmail, setFenexEmail] = useState('');
  const [fenexPassword, setFenexPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [linking, setLinking] = useState(false);
  const [demo, setDemoOn] = useState(isDemo());

  const enabled = emisor?.remision_enabled ?? false;

  useEffect(() => {
    if (!enabled) return;
    void demo; // re-read status when the trial toggle flips
    let active = true;
    fenexStatus()
      .then((s) => { if (active) setLink(s); })
      .catch(() => { if (active) setLink({ linked: false }); });
    return () => { active = false; };
  }, [enabled, demo]);

  async function connect() {
    setLinking(true);
    setError(null);
    try {
      const status = await linkFenex(fenexEmail, fenexPassword);
      setLink(status);
      // Held only long enough to exchange it for a token, then dropped.
      setFenexPassword('');
      setNotice(`Connected to Fenex as ${status.fenex_email ?? fenexEmail}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  async function disconnect() {
    setLinking(true);
    setError(null);
    try {
      await unlinkFenex();
      setLink({ linked: false });
      setNotice('Fenex account disconnected. No documents can be issued until it is linked again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
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
        ? 'Remisión enabled. Fill in your issuer details below, then link your Fenex account.'
        : 'Remisión turned off. Nothing related to it will appear in the app.',
    );
  }

  async function saveEmisor() {
    const patch: Record<string, unknown> = {};
    for (const f of EMISOR_FIELDS) patch[f.key] = form[f.key].trim() || null;
    await save(patch, 'Issuer details saved.');
  }

  return (
    <Card>
      <CardHeader
        title="Nota de Remisión"
        subtitle="Paraguay only — the legal transport document for a loaded truck"
        action={
          <Button variant={enabled ? 'secondary' : 'primary'} disabled={busy} onClick={() => void toggle()}>
            {busy ? 'Saving…' : enabled ? 'Turn off' : 'Turn on'}
          </Button>
        }
      />

      <div className="p-4">
        {error && <ErrorNote message={error} />}
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
              <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                1 · Your details as the issuer (emisor)
              </p>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Your RUC, timbrado and document numbering all live in your Fenex account — the
                remisión is issued under whoever is linked below, so none of that is retyped here.
                These few details are only used to fill in the <em>transportista</em> block when you
                haul your own grain.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {EMISOR_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label>{f.label}</Label>
                    <Input
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  </div>
                ))}

              </div>
              <div className="mt-3">
                <Button variant="primary" disabled={busy} onClick={() => void saveEmisor()}>
                  {busy ? 'Saving…' : 'Save issuer details'}
                </Button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                2 · Link your Fenex account
              </p>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Fenex is the accredited provider that signs the document and files it with SET. You
                need your own account and subscription with them.
              </p>

              {link?.linked ? (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      Connected as <strong>{link.fenex_email}</strong>
                    </span>
                    {link.subscription_status && (
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          link.subscription_status.toLowerCase() === 'active'
                            ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                            : 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
                        )}
                      >
                        {link.subscription_status}
                      </span>
                    )}
                    <Button className="ml-auto" disabled={linking} onClick={() => void disconnect()}>
                      Disconnect
                    </Button>
                  </div>
                  {link.paid_until && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Subscription paid until {link.paid_until}
                      {link.linked_at ? ` · linked ${formatDateTime(link.linked_at)}` : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
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
                    Your password is used once to obtain a token and is never stored — not here, and
                    not in the database. Fenex tokens last about six months, so this is a twice-a-year
                    step.
                  </p>
                </div>
              )}

              <div className="mt-3 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2.5 dark:border-violet-800 dark:bg-violet-950">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={demo}
                    onChange={(e) => {
                      setDemo(e.target.checked);
                      setDemoOn(e.target.checked);
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
                    account. Buyers, geography and the issued document are all simulated locally.
                    Nothing reaches Fenex or SET, and no timbrado number is used.
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
