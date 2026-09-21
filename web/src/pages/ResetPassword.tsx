import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorNote, Label, PasswordInput } from '../components/ui';

/**
 * Where a password-reset email lands.
 *
 * Supabase consumes the recovery token on load and creates a session, so
 * without this page the console simply treated the visitor as signed in and
 * showed the dashboard — the reset link appeared to do nothing. App.tsx routes
 * here on path alone, before the session gate, so that still works.
 */
export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      // An expired or already-used link fails here rather than on arrival,
      // so say which it is instead of a bare error code.
      if (err) {
        setError(
          /session|jwt|token/i.test(err.message)
            ? 'This reset link has expired or was already used. Request a new one from the app.'
            : err.message,
        );
      } else {
        setDone(true);
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Virtus Cart
        </h1>
        <Card>
          {done ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Password updated.
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Open Virtus Cart on your phone or tablet and sign in with your new password.
              </p>
              <Button variant="primary" className="w-full" onClick={() => { window.location.href = '/'; }}>
                Go to the web console
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Choose a new password for your Virtus Cart account.
              </p>
              <div>
                <Label>New password</Label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  reveal={reveal}
                  onToggleReveal={() => setReveal((v) => !v)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label>Confirm new password</Label>
                <PasswordInput
                  value={confirm}
                  onChange={setConfirm}
                  reveal={reveal}
                  onToggleReveal={() => setReveal((v) => !v)}
                  autoComplete="new-password"
                />
              </div>
              {error && <ErrorNote message={error} />}
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy ? 'Saving…' : 'Set new password'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
