import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { supabase } from '../lib/supabase';
import {
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Input,
  Label,
  Modal,
  PasswordInput,
  Spinner,
} from '../components/ui';
import RemisionSettings from '../components/RemisionSettings';
import { formatDateTime, downloadCsv, relativeTime } from '../lib/format';
import { describeDevice } from '../lib/userAgent';

type DangerAction = 'account';

export default function Account() {
  const { user, signOut } = useAuth();
  const data = useData();

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [danger, setDanger] = useState<DangerAction | null>(null);

  const recordCount = data.weighings.length;

  function exportEverything() {
    // A full account snapshot, not a filtered view — this is the copy you keep
    // before doing anything in the danger zone below.
    const payload = {
      exported_at: new Date().toISOString(),
      account: { id: user?.id, email: user?.email },
      weighings: data.weighings,
      boundaries: data.boundaries,
      farms: data.farms,
      fields: data.fields,
      crops: data.crops,
      trucks: data.trucks,
      carts: data.carts,
      operators: data.operators,
      seasons: data.seasons,
      destinations: data.destinations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `virtus-harvest-account-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Account export downloaded.');
  }

  function exportWeighingsCsv() {
    const headers = [
      'Timestamp', 'Operator', 'Farm', 'Field', 'Crop', 'Truck',
      'Destination', 'Weight', 'Unit', 'Moisture', 'Notes', 'ID',
    ];
    const rows = data.weighings.map((w) => [
      w.timestamp ?? '', w.worker ?? '', w.farm ?? '', w.zone ?? '', w.crop ?? '',
      w.buggy ?? '', w.delivered_to ?? w.unload ?? '', w.weight ?? '', w.unit ?? '',
      w.moisture ?? '', w.notes ?? '', w.id,
    ]);
    const escape = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
    downloadCsv(`virtus-harvest-all-records-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setNotice('All records exported as CSV.');
  }

  if (data.loading) return <Spinner label="Loading account…" />;

  return (
    <div className="space-y-5">
      {error && <ErrorNote message={error} />}
      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
          {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-60">✕</button>
        </div>
      )}

      <Card>
        <CardHeader title="Profile" subtitle="The account every device on this farm signs in with" />
        <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
          <Detail label="Email" value={user?.email ?? '—'} />
          <Detail label="Signed in since" value={formatDateTime(user?.last_sign_in_at)} />
          <Detail label="Account created" value={formatDateTime(user?.created_at)} />
          <Detail
            label="Email confirmed"
            value={user?.email_confirmed_at ? formatDateTime(user.email_confirmed_at) : 'Not confirmed'}
          />
          <Detail label="Sign-in method" value={user?.app_metadata?.provider ?? 'email'} />
          <Detail label="Account ID" value={user?.id ?? '—'} mono />
        </dl>
      </Card>

      <SecurityCard email={user?.email ?? ''} busy={busy} setBusy={setBusy} />

      <SessionsCard onError={setError} onNotice={setNotice} onSignOut={() => void signOut()} />

      <RemisionSettings />

      <Card className="border-red-300 dark:border-red-900">
        <CardHeader
          title="Danger zone"
          subtitle="Deleting the account permanently removes all of its data"
          action={
            <div className="flex gap-2">
              <Button onClick={exportWeighingsCsv} disabled={recordCount === 0}>
                Records CSV
              </Button>
              <Button onClick={exportEverything}>Export everything</Button>
            </div>
          }
        />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <DangerRow
            title="Delete account"
            body="Permanently deletes the account and all of its data. You will be signed out of every device."
            action="Delete account"
            onClick={() => setDanger('account')}
          />
        </div>
      </Card>

      {danger && (
        <DangerModal
          email={user?.email ?? ''}
          onClose={() => setDanger(null)}
          onError={setError}
        />
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={
          mono
            ? 'mt-0.5 font-mono text-xs break-all text-slate-700 dark:text-slate-200'
            : 'mt-0.5 text-sm text-slate-900 dark:text-slate-100'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function DangerRow({
  title,
  body,
  action,
  onClick,
}: {
  title: string;
  body: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-64 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{body}</p>
      </div>
      <Button variant="danger" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function SecurityCard({
  email,
  busy,
  setBusy,
}: {
  email: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [reveal, setReveal] = useState(false);
  // Kept local so the result appears next to the control that caused it,
  // rather than at the top of a page you may have scrolled away from.
  const [status, setStatus] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const onError = (text: string | null) => setStatus(text ? { kind: 'bad', text } : null);
  const onNotice = (text: string) => setStatus({ kind: 'ok', text });

  async function changePassword() {
    if (password.length < 8) {
      onError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      onError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    onError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    setPassword('');
    setConfirm('');

    // Notify after the change succeeds, not before — an email announcing a
    // change that then failed is worse than no email. A failure to send is
    // reported but never presented as a failure to change the password.
    const { error: mailError } = await supabase.functions.invoke('notify-password-changed');
    onNotice(
      mailError
        ? 'Password updated — but the confirmation email could not be sent. ' +
            'Your new password is active.'
        : 'Password updated. A confirmation email is on its way. ' +
            'Other devices stay signed in until their session expires.',
    );
  }

  async function changeEmail() {
    const next = newEmail.trim();
    if (!next || next === email) {
      onError('Enter a different email address.');
      return;
    }
    setBusy(true);
    onError(null);
    const { error } = await supabase.auth.updateUser({ email: next });
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    setNewEmail('');

    // Warn the address currently on the account. Supabase only mails the *new*
    // address, so without this a hijacker could move the account away silently.
    const { error: warnError } = await supabase.functions.invoke('notify-password-changed', {
      body: { event: 'email_change_requested', newEmail: next },
    });

    // Supabase does not switch the address until the new one is confirmed, so
    // saying "changed" here would be a lie.
    onNotice(
      `Confirmation sent to ${next}. The address changes once you click that link.` +
        (warnError ? ' (A notice to your current address could not be sent.)' : ''),
    );
  }

  return (
    <Card>
      <CardHeader title="Security" subtitle="Changes here affect every device signed into this account" />

      {status && (
        <div className="px-4 pt-4">
          <p
            className={
              status.kind === 'ok'
                ? 'rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100'
                : 'rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
            }
          >
            {status.text}
          </p>
        </div>
      )}

      <div className="grid gap-5 p-4 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Change password</p>
          <div>
            <Label>New password</Label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              reveal={reveal}
              onToggleReveal={() => setReveal((v) => !v)}
            />
          </div>
          <div>
            <Label>Confirm new password</Label>
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              reveal={reveal}
              onToggleReveal={() => setReveal((v) => !v)}
            />
          </div>
          <Button variant="primary" disabled={busy || !password} onClick={() => void changePassword()}>
            {busy ? 'Saving…' : 'Update password'}
          </Button>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Change email</p>
          <div>
            <Label>Current</Label>
            <Input value={email} disabled />
          </div>
          <div>
            <Label>New email</Label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button variant="primary" disabled={busy || !newEmail} onClick={() => void changeEmail()}>
            {busy ? 'Sending…' : 'Send confirmation'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DangerModal({
  email,
  onClose,
  onError,
}: {
  email: string;
  onClose: () => void;
  onError: (s: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  const config = {
    title: 'Delete your account?',
    body: `This permanently deletes ${email} and all of its data. Every device is signed out. There is no way to recover it.`,
    button: 'Delete account',
  };

  async function run() {
    setBusy(true);
    onError(null);
    try {
      const { error } = await supabase.rpc('delete_own_account');
      if (error) throw error;
      await supabase.auth.signOut();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      onClose();
    }
  }

  return (
    <Modal title={config.title} onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{config.body}</p>
      <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-400">
        This cannot be undone.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose} autoFocus>
          Cancel
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void run()}>
          {busy ? 'Working…' : config.button}
        </Button>
      </div>
    </Modal>
  );
}

interface SessionRow {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  not_after: string | null;
  ip: string | null;
  user_agent: string | null;
  is_current: boolean;
}

/**
 * auth.sessions is invisible to the browser, so this reads it through the
 * my_sessions() SECURITY DEFINER function, which filters to auth.uid() itself.
 */
function SessionsCard({
  onError,
  onNotice,
  onSignOut,
}: {
  onError: (s: string | null) => void;
  onNotice: (s: string) => void;
  onSignOut: () => void;
}) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_sessions');
    if (error) {
      // The functions are a separate migration; a project without them should
      // say so plainly rather than show an empty list that looks like no devices.
      setUnavailable(true);
      setSessions([]);
      return;
    }
    setUnavailable(false);
    setSessions((data ?? []) as SessionRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(session: SessionRow) {
    setBusyId(session.id);
    onError(null);
    const { error } = await supabase.rpc('revoke_session', { target_session: session.id });
    setBusyId(null);
    if (error) {
      onError(error.message);
      return;
    }
    if (session.is_current) {
      // Revoking your own session means this browser is no longer signed in.
      onSignOut();
      return;
    }
    onNotice('That device has been signed out.');
    await load();
  }

  async function signOutEverywhere() {
    setBusyId('all');
    onError(null);
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    setBusyId(null);
    if (error) onError(error.message);
  }

  return (
    <Card>
      <CardHeader
        title="Devices"
        subtitle="Everything currently signed into this account"
        action={
          <div className="flex gap-2">
            <Button onClick={() => void load()}>Refresh</Button>
            <Button disabled={busyId !== null} onClick={() => void signOutEverywhere()}>
              Sign out everywhere
            </Button>
          </div>
        }
      />

      {sessions === null ? (
        <Spinner label="Loading devices…" />
      ) : unavailable ? (
        <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
          Device listing needs the <code className="font-mono">my_sessions()</code> function in Supabase.
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-4 text-sm text-slate-500 dark:text-slate-400">No active sessions found.</div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {sessions.map((s) => {
            const { device, browser } = describeDevice(s.user_agent);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-56 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {device}
                    {browser && <span className="font-normal text-slate-500 dark:text-slate-400"> · {browser}</span>}
                    {s.is_current && (
                      <span className="ml-2 rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-semibold text-ink">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Last active {relativeTime(s.updated_at)}
                    {s.ip && ` · ${s.ip}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Signed in {formatDateTime(s.created_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="text-red-600 dark:text-red-400"
                  disabled={busyId !== null}
                  onClick={() => void revoke(s)}
                >
                  {busyId === s.id ? 'Signing out…' : s.is_current ? 'Sign out' : 'Sign out device'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
