import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import { useWriter } from '../state/useWriter';
import { setRationEditsAllowed } from '../lib/write';
import { formatDate, formatDateTime } from '../lib/format';
import {
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Label,
  PasswordInput,
  Switch,
  TableWrap,
  Td,
  Th,
} from '../components/ui';

/** Account details, what the account contains, and a password change. */
export default function Account() {
  const t = useT();
  const { user, signOut } = useAuth();
  const {
    cycles,
    lots,
    ingredients,
    rations,
    groups,
    mixers,
    operators,
    feedings,
    deliveries,
    stockMoves,
    refresh,
  } = useData();
  const { cycleId } = usePrefs();
  const { settings } = useData();
  const { run } = useWriter();
  const [switching, setSwitching] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cycle = useMemo(() => cycles.find((c) => c.id === cycleId) ?? null, [cycles, cycleId]);
  const lastFeeding = useMemo(
    () =>
      feedings.reduce<string | null>(
        (latest, f) =>
          f.started_at && (!latest || new Date(f.started_at) > new Date(latest)) ? f.started_at : latest,
        null,
      ),
    [feedings],
  );

  async function changePassword() {
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setNotice('Contraseña actualizada. La próxima vez, ingrese con la nueva — también en la app.');
      setPassword('');
      setConfirm('');
    }
  }

  const counts: [string, number][] = [
    [t('Ciclos'), cycles.length],
    [t('Corrales'), lots.length],
    [t('Grupos de alimentación'), groups.length],
    [t('Raciones'), rations.length],
    [t('Insumos'), ingredients.length],
    [t('Mixers'), mixers.length],
    [t('Operadores'), operators.length],
    [t('Mezclas'), feedings.length],
    [t('Descargas'), deliveries.length],
    [t('Movimientos de stock'), stockMoves.length],
  ];

  async function toggleRationEdits() {
    setSwitching('rations');
    await run(
      (w) => setRationEditsAllowed(w, !settings.allowAppRationEdits),
      settings.allowAppRationEdits ? t('Raciones bloqueadas en la app') : t('La app puede editar raciones'),
    );
    setSwitching(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={t('Cuenta')} subtitle={t('La misma que usa la app del mixer')} />
        <div className="space-y-2 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">{t('Correo')}</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">{t('Última mezcla')}</span>
            <span>{formatDateTime(lastFeeding)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">{t('Ciclo seleccionado')}</span>
            <span>{cycle ? cycle.name : t('Todos')}</span>
          </div>
          {cycle?.start_date && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">{t('Inicio del ciclo')}</span>
              <span>{formatDate(cycle.start_date)}</span>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => void refresh()}>{t('Actualizar datos')}</Button>
            <Button onClick={() => void signOut()}>{t('Salir')}</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('Cambiar contraseña')} subtitle={t('Cambia también la de la app — es la misma cuenta')} />
        <div className="space-y-3 p-4">
          <div>
            <Label>{t('Nueva contraseña')}</Label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              reveal={reveal}
              onToggleReveal={() => setReveal((v) => !v)}
            />
          </div>
          <div>
            <Label>{t('Repetir')}</Label>
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
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
          <Button variant="primary" disabled={busy} onClick={() => void changePassword()}>
            {busy ? 'Guardando…' : t('Guardar contraseña')}
          </Button>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title={t('Permisos de la app')}
          subtitle={t('Los cambios llegan en la próxima sincronización de la tablet')}
        />
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          <PermissionRow
            title={t('Editar raciones desde la app')}
            description={t('Apagado, la tablet ve las raciones pero no las cambia.')}
            allowed={settings.allowAppRationEdits}
            busy={switching === 'rations'}
            onToggle={() => void toggleRationEdits()}
            // Kept where the long prose was cut: this one is a fact about the
            // account, not an explanation of the feature.
            footnote={
              settings.stored && settings.updatedAt
                ? t('Cambiado {v1}', { v1: formatDateTime(settings.updatedAt) })
                : undefined
            }
          />
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title={t('Datos en la cuenta')}
          subtitle={t('Conteos de todos los ciclos, sin el filtro de la barra superior')}
        />
        <TableWrap>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <Th>{t('Tabla')}</Th>
                <Th right>{t('Filas')}</Th>
              </tr>
            </thead>
            <tbody>
              {counts.map(([label, n]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <Td>{label}</Td>
                  <Td right>{n.toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
          La configuración —corrales, grupos, raciones, insumos, ciclos, mixers y operadores— se edita en{' '}
          <b>{t('Gestión')}</b>, y llega a cada tablet en su próxima sincronización. Lo que queda solo en la app son los
          registros de alimentación: las mezclas y descargas las escribe el mixer con la balanza, y no se editan
          desde acá.
        </p>
      </Card>
    </div>
  );
}

/** One switch, with the consequence spelled out next to it. Built as a row so
 *  the next permission slots in underneath rather than growing a second home
 *  somewhere else in the console. */
function PermissionRow({
  title,
  description,
  allowed,
  busy,
  onToggle,
  footnote,
}: {
  title: string;
  description: string;
  allowed: boolean;
  busy: boolean;
  onToggle: () => void;
  footnote?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="max-w-xl">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        {footnote && <p className="mt-1 text-xs text-slate-400">{footnote}</p>}
      </div>
      <Switch checked={allowed} busy={busy} onChange={onToggle} label={title} />
    </div>
  );
}
