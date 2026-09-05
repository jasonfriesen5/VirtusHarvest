import { useMemo, useState } from 'react';
import { useT } from '../../state/PrefsProvider';
import { Link } from 'react-router-dom';
import { useCurrency, useData } from '../../state/DataProvider';
import { useWriter } from '../../state/useWriter';
import { EntityForm, fnum, fstr } from '../../components/form';
import type { FormValues } from '../../components/form';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Select, TableWrap, Td, Th } from '../../components/ui';
import { formatMoney, formatNumber } from '../../lib/format';
import { rationItemRow, rationRow } from '../../lib/write';
import { uid } from '../../lib/ids';
import type { Ration, RationItem } from '../../lib/types';

interface Draft {
  id: string;
  ingredient_id: string;
  kg_per_head: string;
  /** Present on rows that already exist in the database. */
  persisted: boolean;
}

/**
 * Rations, with the formula builder inline.
 *
 * `kg_per_head` is **per head per DAY** — the group's meals-per-day is what
 * splits it into loads. Row order is the LOAD order, which matters on a real
 * mixer: forage first to get the knives working, minerals last so they are not
 * ground into the bottom.
 */
export default function RationsTab() {
  const t = useT();
  const { rations, rationItems, ingredients, groups, settings } = useData();
  const currency = useCurrency();
  const { run } = useWriter();
  const [editing, setEditing] = useState<Ration | 'new' | null>(null);
  const [items, setItems] = useState<Draft[]>([]);

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const itemsFor = (rationId: string): RationItem[] =>
    rationItems.filter((it) => it.ration_id === rationId).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  /** Per head per day, plus what that costs and its dry-matter share. */
  function summarise(drafts: { ingredient_id: string; kg_per_head: number }[]) {
    let kg = 0;
    let cost = 0;
    let dm = 0;
    drafts.forEach((d) => {
      const ing = ingredientById.get(d.ingredient_id);
      kg += d.kg_per_head;
      cost += d.kg_per_head * (ing?.cost_per_kg ?? 0);
      dm += d.kg_per_head * ((ing?.dm_pct ?? 100) / 100);
    });
    return { kg, cost, dmPct: kg ? (dm / kg) * 100 : null, dmKg: dm };
  }

  function open(r: Ration | 'new') {
    setItems(
      r === 'new'
        ? []
        : itemsFor(r.id).map((it) => ({
            id: it.id,
            ingredient_id: it.ingredient_id,
            kg_per_head: String(it.kg_per_head ?? 0),
            persisted: true,
          })),
    );
    setEditing(r);
  }

  const fields = [
    { key: 'name', label: t('Nombre'), required: true, half: true, placeholder: t('Engorde final') },
    { key: 'version', label: t('Versión'), type: 'number' as const, min: 1, step: 1, half: true,
      hint: t('Suba la versión cuando cambie la fórmula, así el historial sigue siendo legible.') },
    { key: 'mix_minutes', label: t('Minutos de mezclado'), type: 'number' as const, min: 0, step: 1, half: true },
    { key: 'active', label: t('Activa'), type: 'checkbox' as const, half: true },
    { key: 'notes', label: t('Notas'), type: 'textarea' as const },
  ];

  const toValues = (r: Ration | 'new'): FormValues =>
    r === 'new'
      ? { name: '', version: '1', mix_minutes: '', active: true, notes: '' }
      : { name: r.name, version: String(r.version ?? 1), mix_minutes: r.mix_minutes?.toString() ?? '',
          active: r.active !== false, notes: r.notes ?? '' };

  async function save(v: FormValues) {
    const parsed = items.map((d) => ({ ...d, kg: fnum(d.kg_per_head) ?? 0 }));
    if (parsed.some((d) => !d.ingredient_id)) return t('Hay una fila sin insumo elegido.');
    if (parsed.some((d) => d.kg <= 0)) return t('Cada insumo necesita kg por cabeza mayores que cero.');
    const dupes = new Set(parsed.map((d) => d.ingredient_id));
    if (dupes.size !== parsed.length) return t('Un insumo aparece dos veces: súmelos en una sola fila.');

    const base = editing === 'new' || editing == null ? ({} as Partial<Ration>) : editing;
    const row = rationRow({
      ...base,
      name: String(v.name).trim(),
      version: fnum(v.version) ?? 1,
      mix_minutes: fnum(v.mix_minutes),
      active: Boolean(v.active),
      notes: fstr(v.notes),
    });

    const existing = editing === 'new' || editing == null ? [] : itemsFor(editing.id);
    const keep = new Set(parsed.filter((d) => d.persisted).map((d) => d.id));

    return run(async (w) => {
      await w.save('vf_rations', row);
      // Sequence is rewritten from the on-screen order every save, so dragging
      // a row up really does change the load order.
      for (let i = 0; i < parsed.length; i++) {
        const d = parsed[i];
        await w.save(
          'vf_ration_items',
          rationItemRow({
            id: d.persisted ? d.id : undefined,
            ration_id: row.id,
            ingredient_id: d.ingredient_id,
            kg_per_head: d.kg,
            seq: i,
          }),
        );
      }
      for (const old of existing) {
        if (!keep.has(old.id)) await w.remove('vf_ration_items', old.id);
      }
    }, editing === 'new' ? t('Ración creada') : t('Ración guardada'));
  }

  const move = (index: number, delta: number) =>
    setItems((prev) => {
      const next = prev.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const draftSummary = summarise(items.map((d) => ({ ingredient_id: d.ingredient_id, kg_per_head: fnum(d.kg_per_head) ?? 0 })));

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader
        title={t('Raciones')}
        subtitle={t('kg por cabeza y por DÍA — el grupo reparte esa cantidad entre sus comidas')}
        action={<Button variant="primary" onClick={() => open('new')}>{t('Agregar ración')}</Button>}
      />
      {/* Read-only status. The switch itself is in Cuenta ▸ Permisos, so there
          is one place to look for what the tablet is allowed to do. */}
      {!settings.allowAppRationEdits && (
        <p className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <Badge tone="brand">{t('Solo desde el escritorio')}</Badge>
          {t('La tablet ve las raciones pero no las edita.')}
          <Link to="/account" className="text-brand-700 hover:underline dark:text-brand-300">
            {t('Cambiar en Cuenta ▸ Permisos')}
          </Link>
        </p>
      )}

      {rations.length === 0 ? (
        <EmptyState title={t('Sin raciones')} hint={t('Una ración es la fórmula; el grupo decide qué corrales la reciben.')} />
      ) : (
        <TableWrap>
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <Th>{t('Ración')}</Th>
                <Th right>{t('Ver.')}</Th>
                <Th right>{t('Insumos')}</Th>
                <Th right>{t('kg/cab/día')}</Th>
                <Th right>{t('MS')}</Th>
                <Th right>{t('Costo/cab/día')}</Th>
                <Th>{t('Grupos')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rations.map((r) => {
                const its = itemsFor(r.id);
                const s = summarise(its.map((it) => ({ ingredient_id: it.ingredient_id, kg_per_head: it.kg_per_head ?? 0 })));
                const used = groups.filter((g) => g.ration_id === r.id).map((g) => g.name);
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td>
                      <span className="font-medium">{r.name}</span>
                      {r.active === false && <span className="ml-1.5 text-xs text-slate-400">(inactiva)</span>}
                    </Td>
                    <Td right>{r.version ?? 1}</Td>
                    <Td right>{its.length}</Td>
                    <Td right>{formatNumber(s.kg, 2)}</Td>
                    <Td right>{s.dmPct == null ? '—' : `${s.dmPct.toFixed(0)}%`}</Td>
                    <Td right>{formatMoney(s.cost, currency)}</Td>
                    <Td>{used.join(', ') || <span className="text-slate-400">{t('sin usar')}</span>}</Td>
                    <Td right>
                      <Button onClick={() => open(r)}>{t('Editar')}</Button>
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
          title={editing === 'new' ? t('Nueva ración') : t('Editar {v1}', { v1: editing.name })}
          fields={fields}
          initial={toValues(editing)}
          onSave={save}
          onClose={() => setEditing(null)}
          wide
          extra={
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  {t('Fórmula · en orden de carga')}
                </p>
                <Button
                  onClick={() =>
                    setItems((prev) => [...prev, { id: uid(), ingredient_id: '', kg_per_head: '', persisted: false }])
                  }
                >
                  {t('Agregar insumo')}
                </Button>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('Sin insumos todavía. El primero de la lista es el primero que se carga al mixer.')}
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((d, i) => (
                    <div key={d.id} className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs text-slate-400">{i + 1}</span>
                      {/* The select needs its own flex child: `w-full` inside
                          a flex row collapses it to the width of its caret. */}
                      <div className="min-w-0 flex-1">
                        <Select
                          value={d.ingredient_id}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, ingredient_id: e.target.value } : x)),
                            )
                          }
                        >
                          <option value="">{t('— elegir insumo —')}</option>
                          {ingredients
                            .filter((ing) => ing.active !== false)
                            .map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name}
                              </option>
                            ))}
                        </Select>
                      </div>
                      {/* Width lives on the wrapper: Input carries `w-full`,
                          and a `w-32` on the element itself is a coin toss over
                          which rule Tailwind emits last. */}
                      <div className="w-32 shrink-0">
                        <Input
                          type="number"
                          step={0.01}
                          min={0}
                          inputMode="decimal"
                          placeholder={t('kg/cab/día')}
                          value={d.kg_per_head}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, kg_per_head: e.target.value } : x)),
                            )
                          }
                        />
                      </div>
                      <Button onClick={() => move(i, -1)} aria-label={t('Subir')} className="px-2">↑</Button>
                      <Button onClick={() => move(i, 1)} aria-label={t('Bajar')} className="px-2">↓</Button>
                      <Button
                        variant="ghost"
                        className="px-2 text-red-600"
                        aria-label={t('Quitar')}
                        onClick={() => setItems((prev) => prev.filter((_, xi) => xi !== i))}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">
                  {t('Total')} <b className="text-slate-800 dark:text-slate-100">{formatNumber(draftSummary.kg, 2)} kg/cab/día</b>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Materia seca{' '}
                  <b className="text-slate-800 dark:text-slate-100">
                    {formatNumber(draftSummary.dmKg, 2)} kg ({draftSummary.dmPct == null ? '—' : `${draftSummary.dmPct.toFixed(0)}%`})
                  </b>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {t('Costo')} <b className="text-slate-800 dark:text-slate-100">{formatMoney(draftSummary.cost, currency)}/cab/día</b>
                </span>
              </div>
            </div>
          }
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  const inUse = groups.filter((g) => g.ration_id === editing.id);
                  if (inUse.length) {
                    return t('La usan {v1} grupo(s): {v2}. Cámbieles la ración primero, o desmarque "Activa".', { v1: inUse.length, v2: inUse.map((g) => g.name).join(', ') });
                  }
                  return run(async (w) => {
                    for (const it of itemsFor(editing.id)) await w.remove('vf_ration_items', it.id);
                    await w.remove('vf_rations', editing.id);
                  }, t('Ración eliminada'));
                }
          }
          deleteWarning={t('Se elimina la ración y su fórmula. Las mezclas ya registradas conservan el nombre guardado en cada fila.')}
        />
      )}
    </Card>
    </div>
  );
}
