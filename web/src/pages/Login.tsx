import { useState } from 'react';
import { useT } from '../state/PrefsProvider';
import type { FormEvent } from 'react';
import { useAuth } from '../state/AuthProvider';
import { Button, Card, ErrorNote, Input, Label, PasswordInput } from '../components/ui';

export default function Login() {
  const t = useT();
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
    const { error: err } = await signIn(email, password);
    // On success the auth listener swaps this page out, so there is nothing
    // to do here but surface a failure.
    if (err) setError(err);
    setBusy(false);
  }

  async function onReset() {
    if (!email.trim()) {
      setError('Escriba su correo primero, luego elija ¿Olvidó su contraseña?');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await sendPasswordReset(email);
    setBusy(false);
    if (err) setError(err);
    else setNotice(t('Si existe una cuenta para {v1}, le enviamos un enlace para restablecerla.', { v1: email.trim() }));
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          {/* The same wordmark the app signs in with — Feed has no icon
              artwork of its own, and Harvest's says HARVEST on it. */}
          <div className="leading-none">
            <p className="text-4xl font-extrabold tracking-[0.16em] text-slate-900 dark:text-slate-50">{t('VIRTUS')}</p>
            <p className="mt-1 text-sm font-semibold tracking-[0.34em] text-brand-500">{t('FEED')}</p>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t('Ingrese con la misma cuenta que usa en la app del mixer.')}
          </p>
        </div>

        <Card className="p-5">
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>{t('Correo')}</Label>
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('you@example.com')}
              />
            </div>
            <div>
              <Label>{t('Contraseña')}</Label>
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
              {busy ? 'Ingresando…' : 'Ingresar'}
            </Button>

            <button
              type="button"
              onClick={() => void onReset()}
              disabled={busy}
              className="w-full text-center text-xs text-slate-500 hover:text-brand-600 disabled:opacity-60 dark:text-slate-400"
            >
              {t('¿Olvidó su contraseña?')}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
