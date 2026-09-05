import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../state/DataProvider';
import { usePrefs, useT } from '../../state/PrefsProvider';
import { LotFormModal } from '../../components/LotForm';
import { Badge, Button, Card, CardHeader, EmptyState, TableWrap, Td, Th } from '../../components/ui';
import { formatWeight } from '../../lib/format';
import type { Lot } from '../../lib/types';

/**
 * Pens. Everything about a pen except its feed rate, which belongs to the pen
 * page next to the bunk-reading ledger that also moves it, and its ration,
 * which belongs to the feed group — `lot.ration_id` is legacy and groups own
 * the ration now.
 */
export default function LotsTab() {
  const t = useT();
  const { lots, deliveries, lotGroups, groups } = useData();
  const { cycleId } = usePrefs();
  const [editing, setEditing] = useState<Lot | 'new' | null>(null);

  const rows = useMemo(
    () =>
      lots
        .filter((l) => !cycleId || l.cycle_id === cycleId)
        .slice()
        .sort((a, b) => (a.route_order ?? 0) - (b.route_order ?? 0) || a.name.localeCompare(b.name)),
    [lots, cycleId],
  );

  const deliveriesFor = (id: string) => deliveries.filter((d) => d.lot_id === id).length;

  return (
    <Card>
      <CardHeader
        title={t('Corrales')}
        subtitle={t('La ración la define el grupo de alimentación; el factor se ajusta en la página del corral')}
        action={<Button variant="primary" onClick={() => setEditing('new')}>{t('Agregar corral')}</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState title={t('Sin corrales')} hint={t('Agregue el primero para empezar a armar los grupos.')} />
      ) : (
        <TableWrap>
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <Th right>#</Th>
                <Th>{t('Corral')}</Th>
                <Th>{t('Grupos')}</Th>
                <Th right>{t('Cab.')}</Th>
                <Th>{t('Conteo')}</Th>
                <Th right>{t('Peso prom.')}</Th>
                <Th>{t('Categoría')}</Th>
                <Th right>{t('Descargas')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const memberOf = lotGroups
                  .filter((m) => m.lot_id === l.id)
                  .map((m) => groups.find((g) => g.id === m.group_id)?.name)
                  .filter(Boolean) as string[];
                return (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td right className="text-slate-400">{l.route_order ?? 0}</Td>
                    <Td>
                      <Link to={`/pens/${l.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                        {l.name}
                      </Link>
                      {l.pen_code && <span className="ml-1.5 text-xs text-slate-400">{l.pen_code}</span>}
                      {l.active === false && <span className="ml-1.5 text-xs text-slate-400">(inactivo)</span>}
                    </Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {memberOf.map((n) => (
                          <Badge key={n} tone="brand">{n}</Badge>
                        ))}
                        {memberOf.length === 0 && <span className="text-slate-400">{t('sin grupo')}</span>}
                      </span>
                    </Td>
                    <Td right>{l.head_count ?? 0}</Td>
                    {/* Worth a column rather than only living inside the edit
                        sheet: the useful question is which pens ask, and that
                        is only answerable by seeing them all at once. */}
                    <Td>
                      {l.confirm_head_count ? (
                        <Badge tone="brand">{t('pregunta')}</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td right>{l.avg_weight_kg ? formatWeight(l.avg_weight_kg, 'kg') : '—'}</Td>
                    <Td>{l.category ? t(l.category) : '—'}</Td>
                    <Td right className="text-slate-400">{deliveriesFor(l.id)}</Td>
                    <Td right>
                      <Button onClick={() => setEditing(l)}>{t('Editar')}</Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {editing && <LotFormModal lot={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}
