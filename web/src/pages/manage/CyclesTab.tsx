import { useState } from 'react';
import { useT } from '../../state/PrefsProvider';
import { useData } from '../../state/DataProvider';
import { useWriter } from '../../state/useWriter';
import { EntityForm, fstr } from '../../components/form';
import type { FormValues } from '../../components/form';
import { Badge, Button, Card, CardHeader, EmptyState, TableWrap, Td, Th } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { cycleRow } from '../../lib/write';
import type { Cycle } from '../../lib/types';

/**
 * Cycles scope corrales, grupos y registros — Harvest's seasons under another
 * name. One caveat worth stating in the UI: which cycle a tablet is working in
 * is a per-device setting in the app, not this `active` column, so creating a
 * cycle here does not switch anybody's app over to it.
 */
export default function CyclesTab() {
  const t = useT();
  const { cycles, lots, feedings } = useData();
  const { run } = useWriter();
  const [editing, setEditing] = useState<Cycle | 'new' | null>(null);

  const fields = [
    { key: 'name', label: t('Nombre'), required: true, half: true, placeholder: '2026',
      hint: t('Un año o un lote de entrada. Los datos no se traducen, así que evite palabras de un idioma.') },
    { key: 'active', label: t('Activo'), type: 'checkbox' as const, half: true },
    { key: 'start_date', label: t('Inicio'), type: 'date' as const, half: true },
    { key: 'end_date', label: t('Fin'), type: 'date' as const, half: true },
  ];

  const toValues = (c: Cycle | 'new'): FormValues =>
    c === 'new'
      ? { name: String(new Date().getFullYear()), active: true, start_date: '', end_date: '' }
      : { name: c.name, active: c.active !== false, start_date: c.start_date ?? '', end_date: c.end_date ?? '' };

  async function save(v: FormValues) {
    const base = editing === 'new' || editing == null ? ({} as Partial<Cycle>) : editing;
    return run(
      (w) =>
        w.save('vf_cycles', cycleRow({
          ...base,
          name: String(v.name).trim(),
          start_date: fstr(v.start_date),
          end_date: fstr(v.end_date),
          active: Boolean(v.active),
        })),
      editing === 'new' ? t('Ciclo creado') : t('Ciclo guardado'),
    );
  }

  return (
    <Card>
      <CardHeader
        title={t('Ciclos')}
        subtitle={t('Cada tablet elige su ciclo en la app; crear uno acá no cambia el de nadie')}
        action={<Button variant="primary" onClick={() => setEditing('new')}>{t('Agregar ciclo')}</Button>}
      />
      {cycles.length === 0 ? (
        <EmptyState title={t('Sin ciclos')} />
      ) : (
        <TableWrap>
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <Th>{t('Ciclo')}</Th>
                <Th>{t('Inicio')}</Th>
                <Th>{t('Fin')}</Th>
                <Th right>{t('Corrales')}</Th>
                <Th right>{t('Mezclas')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => {
                const penCount = lots.filter((l) => l.cycle_id === c.id).length;
                const feedCount = feedings.filter((f) => f.cycle_id === c.id).length;
                return (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td>
                      <span className="font-medium">{c.name}</span>{' '}
                      {c.active !== false ? <Badge tone="good">{t('activo')}</Badge> : <Badge>{t('cerrado')}</Badge>}
                    </Td>
                    <Td>{formatDate(c.start_date)}</Td>
                    <Td>{formatDate(c.end_date)}</Td>
                    <Td right>{penCount}</Td>
                    <Td right>{feedCount}</Td>
                    <Td right>
                      <Button onClick={() => setEditing(c)}>{t('Editar')}</Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {editing && (
        <EntityForm
          title={editing === 'new' ? t('Nuevo ciclo') : t('Editar {v1}', { v1: editing.name })}
          fields={fields}
          initial={toValues(editing)}
          onSave={save}
          onClose={() => setEditing(null)}
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  const pens = lots.filter((l) => l.cycle_id === editing.id).length;
                  const feeds = feedings.filter((f) => f.cycle_id === editing.id).length;
                  if (pens || feeds) {
                    return t('El ciclo tiene {v1} corral(es) y {v2} mezcla(s). Ciérrelo desmarcando "Activo" en lugar de borrarlo — al eliminarlo esos registros quedarían sin ciclo.', { v1: pens, v2: feeds });
                  }
                  return run((w) => w.remove('vf_cycles', editing.id), t('Ciclo eliminado'));
                }
          }
        />
      )}
    </Card>
  );
}
