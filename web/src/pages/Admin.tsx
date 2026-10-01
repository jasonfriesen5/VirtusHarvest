import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Card, CardHeader, EmptyState, ErrorNote, Input, Spinner, cx } from '../components/ui';

/**
 * Scale licences, managed by hand: pick an account, see every scale tied to it,
 * set each one with a button.
 *
 * The safety rule lives in the database and the app, not here — only a demo
 * scale can ever stop weighing — but this page is where it could be broken by a
 * slip, so the one action that puts a timer on a paying customer (turning a paid
 * scale into a demo) asks first. Dates are computed by the server.
 */

type Account = {
  user_id: string;
  email: string;
  name: string;
  created_at: string;
  last_sign_in_at: string | null;
  scale_count: number;
};

type Scale = {
  serial: string;
  cart_name: string | null;
  last_seen: string | null;
  kind: 'demo' | 'paid' | null;
  valid_until: string | null;
  licence_email: string | null;
  note: string | null;
  server_now: string;
};

type Action = 'demo_30' | 'paid_1y' | 'extend_1y' | 'clear';

const DAY = 86_400_000;

function daysLeft(s: Scale): number | null {
  if (!s.valid_until) return null;
  return Math.ceil((new Date(s.valid_until).getTime() - new Date(s.server_now).getTime()) / DAY);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function Pill({ tone, children }: { tone: 'grey' | 'amber' | 'red' | 'green' | 'blue'; children: string }) {
  const tones = {
    grey: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  };
  return (
    <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  );
}

function Status({ scale }: { scale: Scale }) {
  if (!scale.kind) return <Pill tone="grey">Not registered — weighs freely</Pill>;
  const d = daysLeft(scale) ?? 0;
  if (scale.kind === 'demo') {
    if (d <= 0) return <Pill tone="red">Demo ended — stopped</Pill>;
    return <Pill tone={d <= 3 ? 'red' : 'amber'}>{`Demo · ${d} day${d === 1 ? '' : 's'} left`}</Pill>;
  }
  if (d <= 0) return <Pill tone="blue">{`Renewal due since ${fmtDate(scale.valid_until)} — still weighs`}</Pill>;
  return <Pill tone="green">{`Paid until ${fmtDate(scale.valid_until)}`}</Pill>;
}

export default function Admin() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Account | null>(null);
  const [scales, setScales] = useState<Scale[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_list_accounts');
    if (err) throw err;
    setAccounts((data ?? []) as Account[]);
  }, []);

  const loadScales = useCallback(async (acct: Account) => {
    setScales(null);
    const { data, error: err } = await supabase.rpc('admin_account_scales', { p_user_id: acct.user_id });
    if (err) throw err;
    setScales((data ?? []) as Scale[]);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error: err } = await supabase.rpc('admin_whoami');
        if (err) throw err;
        setIsAdmin(data === true);
        if (data === true) await loadAccounts();
      } catch (e) {
        setIsAdmin(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [loadAccounts]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => a.email.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [accounts, filter]);

  async function choose(acct: Account) {
    setSelected(acct);
    setError(null);
    setNotice(null);
    try {
      await loadScales(acct);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function apply(scale: Scale, action: Action) {
    if (!selected) return;

    // The guard rails. Each of these is a slip that would hurt a real customer.
    if (action === 'demo_30' && scale.kind === 'paid') {
      const ok = window.confirm(
        `Scale ${scale.serial} is PAID.\n\nAs a demo it will stop weighing in 30 days. ` +
          `Only do this if it was never sold. Continue?`,
      );
      if (!ok) return;
    }
    if ((action === 'demo_30' || action === 'paid_1y') && scale.licence_email) {
      const ok = window.confirm(
        `Scale ${scale.serial} is currently licensed to ${scale.licence_email}.\n\n` +
          `This moves it to ${selected.email}. Continue?`,
      );
      if (!ok) return;
    }
    if (action === 'clear') {
      const ok = window.confirm(
        `Remove the licence for ${scale.serial}?\n\nIt goes back to "not registered", which weighs freely.`,
      );
      if (!ok) return;
    }

    setBusy(scale.serial + action);
    setError(null);
    setNotice(null);
    try {
      const { error: err } = await supabase.rpc('admin_apply_scale_action', {
        p_serial: scale.serial,
        p_user_id: selected.user_id,
        p_action: action,
      });
      if (err) throw err;
      const label = {
        demo_30: 'lent as a 30-day demo',
        paid_1y: 'marked paid for one year',
        extend_1y: 'extended by one year',
        clear: 'licence removed',
      }[action];
      setNotice(`${scale.serial}: ${label}.`);
      await Promise.all([loadScales(selected), loadAccounts()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (isAdmin === null) return <Spinner label="Checking access…" />;
  if (!isAdmin) {
    return (
      <Card>
        <EmptyState title="Admin only" hint="This page is for managing scale licences." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">Scale licences</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Only demo scales can ever stop weighing. Paid, lapsed and unregistered scales always weigh.
        </p>
      </div>

      {error && <ErrorNote message={error} />}
      {notice && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Accounts" subtitle={`${accounts.length} total`} />
          <div className="p-3">
            <Input
              placeholder="Search by email or name"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {shown.map((a) => (
              <li key={a.user_id}>
                <button
                  type="button"
                  onClick={() => void choose(a)}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-left text-sm transition-colors dark:border-slate-800',
                    selected?.user_id === a.user_id
                      ? 'bg-brand-50 dark:bg-brand-900/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{a.email}</span>
                    {a.name && <span className="block truncate text-xs text-slate-500">{a.name}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {a.scale_count} scale{a.scale_count === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <EmptyState title="No matching accounts" />}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title={selected ? selected.email : 'Select an account'}
            subtitle={selected ? `Last signed in ${fmtDate(selected.last_sign_in_at)}` : undefined}
          />
          {!selected && <EmptyState title="Pick an account on the left" hint="Its scales and their state appear here." />}
          {selected && scales === null && <Spinner label="Loading scales…" />}
          {selected && scales && scales.length === 0 && (
            <EmptyState
              title="No scales linked to this account yet"
              hint="A scale appears here once it is paired to one of their carts or connects while they are signed in."
            />
          )}
          {selected && scales && scales.length > 0 && (
            <ul>
              {scales.map((s) => (
                <li key={s.serial} className="border-t border-slate-100 px-4 py-3 first:border-t-0 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{s.serial}</p>
                      <p className="text-xs text-slate-500">
                        {s.cart_name ? `Cart: ${s.cart_name}` : 'No cart on this account'}
                        {' · '}
                        {s.last_seen ? `last seen ${fmtDate(s.last_seen)}` : 'not seen connecting yet'}
                      </p>
                      {s.licence_email && (
                        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                          Licensed to another account: {s.licence_email}
                        </p>
                      )}
                    </div>
                    <Status scale={s} />
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => void apply(s, 'demo_30')}
                    >
                      {busy === s.serial + 'demo_30' ? 'Saving…' : '30-day demo'}
                    </Button>
                    <Button variant="primary" disabled={busy !== null} onClick={() => void apply(s, 'paid_1y')}>
                      {busy === s.serial + 'paid_1y' ? 'Saving…' : 'Paid · 1 year'}
                    </Button>
                    {s.kind && (
                      <Button variant="secondary" disabled={busy !== null} onClick={() => void apply(s, 'extend_1y')}>
                        {busy === s.serial + 'extend_1y' ? 'Saving…' : '+1 year'}
                      </Button>
                    )}
                    {s.kind && (
                      <Button variant="ghost" disabled={busy !== null} onClick={() => void apply(s, 'clear')}>
                        {busy === s.serial + 'clear' ? 'Saving…' : 'Remove'}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
