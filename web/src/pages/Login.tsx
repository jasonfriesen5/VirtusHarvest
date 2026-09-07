import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../state/AuthProvider';
import { Button, Card, ErrorNote, Input, Label, PasswordInput } from '../components/ui';

export default function Login() {
  const { signIn, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: err } = await signIn(email, password);
      // On success the auth listener swaps this page out, so there is nothing
      // to do here but surface a failure.
      if (err) setError(err);
    } catch {
      setError('Could not reach the sign-in service. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!email.trim()) {
      setError('Enter your email address first, then choose Forgot password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await sendPasswordReset(email);
      if (err) setError(err);
      else setNotice(`If an account exists for ${email.trim()}, a reset link is on its way.`);
    } catch {
      setError('Could not reach the password-reset service. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img
            src="/virtus-icon.png"
            alt="Virtus Harvest"
            width={160}
            height={160}
            className="h-40 w-40 rounded-2xl object-cover shadow-sm ring-1 ring-black/5 dark:ring-white/10"
          />
          {/* The artwork already carries the wordmark, so a visible heading
              would just repeat it — kept for screen readers and the document
              outline instead. */}
          <h1 className="sr-only">Virtus Harvest</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sign in with the same account you use in the app.
          </p>
        </div>

        <Card className="p-5">
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <Label>Password</Label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                required
                reveal={reveal}
                onToggleReveal={() => setReveal((v) => !v)}
              />
            </div>

            {error && <ErrorNote message={error} />}
            {notice && (
              <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-200">
                {notice}
              </p>
            )}

            <Button type="submit" variant="primary" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>

            <button
              type="button"
              onClick={() => void onReset()}
              disabled={busy}
              className="w-full text-center text-xs text-slate-500 hover:text-brand-600 disabled:opacity-60 dark:text-slate-400"
            >
              Forgot password?
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
