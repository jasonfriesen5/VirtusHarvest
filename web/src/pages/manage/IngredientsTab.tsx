import { useState } from 'react';
import { useT } from '../../state/PrefsProvider';
import { useCurrency, useData } from '../../state/DataProvider';
import { useWriter } from '../../state/useWriter';
import { EntityForm, fnum, fstr } from '../../components/form';
import type { FormValues } from '../../components/form';
import { Button, Card, CardHeader, EmptyState, TableWrap, Td, Th, cx } from '../../components/ui';
import { formatMoney, formatWeight } from '../../lib/format';
import { ingredientRow } from '../../lib/write';
import type { Ingredient } from '../../lib/types';

/**
 * The ingredient's own record. Stock is deliberately NOT editable here — it is
 * the running balance of the ledger, and typing over it would erase the very
 * discrepancy the ledger exists to show. Movements are entered on the Insumos
 * page as receipts, counts and adjustments.
 */
export default function IngredientsTab() {
  const t = useT();
  const { ingredients, rationItems } = useData();
  const currency = useCurrency();
  const { run } = useWriter();
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);

  const fields = [
    { key: 'name', label: t('Nombre'), required: true, half: true, placeholder: t('Ensilaje de maíz') },
    { key: 'category', label: t('Categoría'), type: 'select' as const, half: true, options: [
      { value: '', label: '—' },
      { value: 'forraje', label: t('Forraje') },
      { value: 'concentrado', label: t('Concentrado') },
      { value: 'mineral', label: t('Mineral') },
      { value: 'aditivo', label: t('Aditivo') },
    ] },
    { key: 'dm_pct', label: t('Materia seca %'), type: 'number' as const, min: 1, max: 100, step: 0.1, half: true,
      hint: t('Ensilaje ~32, grano ~87. De acá salen el consumo de MS y la conversión.') },
    { key: 'cost_per_kg', label: t('Costo por kg ({v1})', { v1: currency }), type: 'number' as const, min: 0, step: 1, half: true,
      hint: t('Se actualiza solo al registrar un ingreso con precio.') },
    { key: 'tol_pct', label: t('Tolerancia de carga %'), type: 'number' as const, min: 100, max: 200, step: 1, half: true,
      hint: t('Cuánto de más se acepta al cargar. Ensilaje 120, mineral 105 — vacío usa 120.') },
    { key: 'active', label: t('Activo'), type: 'checkbox' as const, half: true },
  ];

  const toValues = (i: Ingredient | 'new'): FormValues =>
    i === 'new'
      ? { name: '', category: '', dm_pct: '100', cost_per_kg: '0', tol_pct: '', active: true }
      : { name: i.name, category: i.category ?? '', dm_pct: String(i.dm_pct ?? 100),
          cost_per_kg: String(i.cost_per_kg ?? 0), tol_pct: i.tol_pct?.toString() ?? '', active: i.active !== false };

  async function save(v: FormValues) {
    const base = editing === 'new' || editing == null ? ({} as Partial<Ingredient>) : editing;
    return run(
      (w) =>
        w.save(
          'vf_ingredients',
          ingredientRow({
            ...base,
            name: String(v.name).trim(),
            category: fstr(v.category),
            dm_pct: fnum(v.dm_pct) ?? 100,
            cost_per_kg: fnum(v.cost_per_kg) ?? 0,
            tol_pct: fnum(v.tol_pct),
            currency: base.currency ?? currency,
            active: Boolean(v.active),
          }),
        ),
      editing === 'new' ? t('Insumo creado') : t('Insumo guardado'),
    );
  }

  const usedIn = (id: string) => rationItems.filter((it) => it.ingredient_id === id).length;

  return (
    <Card>
      <CardHeader
        title={t('Insumos')}
        subtitle={t('El stock no se edita acá: se mueve con ingresos, conteos y ajustes en la página Insumos')}
        action={<Button variant="primary" onClick={() => setEditing('new')}>{t('Agregar insumo')}</Button>}
      />
      {ingredients.length === 0 ? (
        <EmptyState title={t('Sin insumos')} hint={t('Cargue los insumos antes de armar una ración.')} />
      ) : (
        <TableWrap>
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <Th>{t('Insumo')}</Th>
                <Th>{t('Categoría')}</Th>
                <Th right>{t('MS')}</Th>
                <Th right>{t('Costo/kg')}</Th>
                <Th right>{t('Tolerancia')}</Th>
                <Th right>{t('Stock')}</Th>
                <Th right>{t('En raciones')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {ingredients.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <Td>
                    <span className="font-medium">{i.name}</span>
                    {i.active === false && <span className="ml-1.5 text-xs text-slate-400">(inactivo)</span>}
                  </Td>
                  <Td>{i.category ? t(i.category) : '—'}</Td>
                  <Td right>{i.dm_pct == null ? '—' : `${i.dm_pct}%`}</Td>
                  <Td right>{formatMoney(i.cost_per_kg, currency)}</Td>
                  <Td right>{i.tol_pct ? `${i.tol_pct}%` : '120%'}</Td>
                  <Td right className={cx((i.stock_kg ?? 0) < 0 && 'font-semibold text-red-600 dark:text-red-400')}>
                    {formatWeight(i.stock_kg ?? 0, 'kg')}
                  </Td>
                  <Td right className="text-slate-400">{usedIn(i.id)}</Td>
                  <Td right>
                    <Button onClick={() => setEditing(i)}>{t('Editar')}</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {editing && (
        <EntityForm
          title={editing === 'new' ? t('Nuevo insumo') : t('Editar {v1}', { v1: editing.name })}
          fields={fields}
          initial={toValues(editing)}
          onSave={save}
          onClose={() => setEditing(null)}
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  const n = usedIn(editing.id);
                  if (n) return t('Este insumo está en {v1} ración(es). Sáquelo de la fórmula primero, o desmarque "Activo".', { v1: n });
                  return run((w) => w.remove('vf_ingredients', editing.id), t('Insumo eliminado'));
                }
          }
          deleteWarning={t('Se elimina el insumo. Sus movimientos de stock quedan en el libro con el nombre guardado en cada fila.')}
        />
      )}
    </Card>
  );
}
