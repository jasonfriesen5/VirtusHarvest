import { useState } from 'react';
import { useT } from '../../state/PrefsProvider';
import { useData } from '../../state/DataProvider';
import { useWriter } from '../../state/useWriter';
import { EntityForm, fnum, fstr } from '../../components/form';
import { Button, Card, CardHeader, EmptyState, TableWrap, Td, Th } from '../../components/ui';
import { formatWeight } from '../../lib/format';
import { mixerRow, operatorRow } from '../../lib/write';
import type { Mixer, Operator } from '../../lib/types';

/**
 * Mixers and operators. The console owns a mixer's identity — name, capacity,
 * serial — but never its BLE binding: which scale is paired to which tablet is
 * a fact about the tablet, not about the wagon, and the app keeps it local for
 * exactly that reason.
 */
export default function TeamTab() {
  const t = useT();
  const { mixers, operators, feedings } = useData();
  const { run } = useWriter();
  const [mixer, setMixer] = useState<Mixer | 'new' | null>(null);
  const [op, setOp] = useState<Operator | 'new' | null>(null);

  const mixerFields = [
    { key: 'name', label: t('Nombre'), required: true, half: true, placeholder: t('Mixer 1') },
    { key: 'capacity_kg', label: t('Capacidad (kg)'), type: 'number' as const, min: 0, step: 100, half: true },
    { key: 'serial', label: t('Serie de la balanza'), half: true,
      hint: t('Identifica el equipo. El vínculo Bluetooth se hace en cada tablet.') },
  ];

  const opFields = [
    { key: 'name', label: t('Nombre'), required: true, half: true },
    { key: 'role', label: t('Rol'), type: 'select' as const, half: true, options: [
      { value: '', label: '—' },
      { value: t('mixer'), label: t('Mixero') },
      { value: 'encargado', label: t('Encargado') },
      { value: 'admin', label: t('Administración') },
    ] },
    { key: 'active', label: t('Activo'), type: 'checkbox' as const, half: true },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={t('Mixers')}
          action={<Button variant="primary" onClick={() => setMixer('new')}>{t('Agregar')}</Button>}
        />
        {mixers.length === 0 ? (
          <EmptyState title={t('Sin mixers')} />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>{t('Mixer')}</Th>
                  <Th right>{t('Capacidad')}</Th>
                  <Th>{t('Serie')}</Th>
                  <Th right>{t('Mezclas')}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {mixers.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td className="font-medium">{m.name}</Td>
                    <Td right>{m.capacity_kg ? formatWeight(m.capacity_kg, 'kg') : '—'}</Td>
                    <Td>{m.serial ?? '—'}</Td>
                    <Td right className="text-slate-400">{feedings.filter((f) => f.mixer_id === m.id).length}</Td>
                    <Td right>
                      <Button onClick={() => setMixer(m)}>{t('Editar')}</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t('Operadores')}
          subtitle={t('Quién carga y descarga; queda guardado en cada mezcla')}
          action={<Button variant="primary" onClick={() => setOp('new')}>{t('Agregar')}</Button>}
        />
        {operators.length === 0 ? (
          <EmptyState title={t('Sin operadores')} />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>{t('Operador')}</Th>
                  <Th>{t('Rol')}</Th>
                  <Th right>{t('Mezclas')}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {operators.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td>
                      <span className="font-medium">{o.name}</span>
                      {o.active === false && <span className="ml-1.5 text-xs text-slate-400">(inactivo)</span>}
                    </Td>
                    <Td>{o.role ?? '—'}</Td>
                    <Td right className="text-slate-400">
                      {feedings.filter((f) => f.operator_name === o.name).length}
                    </Td>
                    <Td right>
                      <Button onClick={() => setOp(o)}>{t('Editar')}</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {mixer && (
        <EntityForm
          title={mixer === 'new' ? t('Nuevo mixer') : t('Editar {v1}', { v1: mixer.name })}
          fields={mixerFields}
          initial={
            mixer === 'new'
              ? { name: '', capacity_kg: '', serial: '' }
              : { name: mixer.name, capacity_kg: mixer.capacity_kg?.toString() ?? '', serial: mixer.serial ?? '' }
          }
          onSave={(v) =>
            run(
              (w) =>
                w.save('vf_mixers', mixerRow({
                  ...(mixer === 'new' ? {} : mixer),
                  name: String(v.name).trim(),
                  capacity_kg: fnum(v.capacity_kg),
                  serial: fstr(v.serial),
                })),
              mixer === 'new' ? t('Mixer creado') : t('Mixer guardado'),
            )
          }
          onClose={() => setMixer(null)}
          onDelete={mixer === 'new' ? undefined : async () => run((w) => w.remove('vf_mixers', mixer.id), t('Mixer eliminado'))}
          deleteWarning={t('Las mezclas ya registradas conservan el nombre del mixer guardado en cada fila.')}
        />
      )}

      {op && (
        <EntityForm
          title={op === 'new' ? t('Nuevo operador') : t('Editar {v1}', { v1: op.name })}
          fields={opFields}
          initial={
            op === 'new'
              ? { name: '', role: '', active: true }
              : { name: op.name, role: op.role ?? '', active: op.active !== false }
          }
          onSave={(v) =>
            run(
              (w) =>
                w.save('vf_operators', operatorRow({
                  ...(op === 'new' ? {} : op),
                  name: String(v.name).trim(),
                  role: fstr(v.role),
                  active: Boolean(v.active),
                })),
              op === 'new' ? t('Operador creado') : t('Operador guardado'),
            )
          }
          onClose={() => setOp(null)}
          onDelete={op === 'new' ? undefined : async () => run((w) => w.remove('vf_operators', op.id), t('Operador eliminado'))}
          deleteWarning={t('El nombre queda escrito en las mezclas que ya hizo; borrarlo no las cambia.')}
        />
      )}
    </div>
  );
}
