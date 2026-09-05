import { useMemo, useState } from 'react';
import { useData } from '../../state/DataProvider';
import { usePrefs, useT } from '../../state/PrefsProvider';
import { useWriter } from '../../state/useWriter';
import { EntityForm, fnum, fstr } from '../../components/form';
import type { FormValues } from '../../components/form';
import { Badge, Button, Card, CardHeader, EmptyState, Input, TableWrap, Td, Th, cx } from '../../components/ui';
import { fmtMinutesOfDay, groupSplits, groupWindows, rationKgPerHead } from '../../lib/analytics';
import { formatNumber, formatWeight } from '../../lib/format';
import { buildMealWindows, deleteGroup, groupRow, setLotInGroup } from '../../lib/write';
import type { FeedGroup } from '../../lib/types';

/**
 * Feed groups: one group is ONE MIXER LOAD — a ration plus the pens that get
 * it. Membership is many-to-many on purpose, because a pen can take a forage
 * load and a concentrate load on the same day, and its intake is the sum
 * across its groups.
 *
 * The two numbers that bite if they are wrong live here: meals per day (the
 * ration is per DAY, a load is per MEAL) and the meal split, which is uneven
 * on purpose — cattle eat better in the cool of the evening.
 */
export default function GroupsTab() {
  const t = useT();
  const { groups, rations, lots, lotGroups, cycles, ix } = useData();
  const { cycleId } = usePrefs();
  const { run } = useWriter();
  const [editing, setEditing] = useState<FeedGroup | 'new' | null>(null);
  const [members, setMembers] = useState<Set<string>>(new Set());
  // Meals, splits and windows live here rather than in the form's own values:
  // all three are per-meal, so changing the meal count has to reshape the other
  // two at the same moment. The app's group sheet works the same way.
  const [meals, setMeals] = useState(2);
  const [splits, setSplits] = useState<string[]>([]);
  const [windows, setWindows] = useState<{ from: string; to: string }[]>([]);

  const rows = useMemo(
    () =>
      groups
        .filter((g) => !cycleId || !g.cycle_id || g.cycle_id === cycleId)
        .slice()
        .sort((a, b) => (a.route_order ?? 0) - (b.route_order ?? 0) || a.name.localeCompare(b.name)),
    [groups, cycleId],
  );

  const penOptions = useMemo(
    () =>
      lots
        .filter((l) => l.active !== false && (!cycleId || l.cycle_id === cycleId))
        .slice()
        .sort((a, b) => (a.route_order ?? 0) - (b.route_order ?? 0)),
    [lots, cycleId],
  );

  const defaultCycle = cycleId || cycles.find((c) => c.active !== false)?.id || cycles[0]?.id || '';

  function open(g: FeedGroup | 'new') {
    setMembers(new Set(g === 'new' ? [] : lotGroups.filter((m) => m.group_id === g.id).map((m) => m.lot_id)));
    const n = g === 'new' ? 2 : g.meals_per_day && g.meals_per_day > 0 ? Math.round(g.meals_per_day) : 1;
    setMeals(n);
    setSplits(
      groupSplits(
        g === 'new'
          ? ({ meals_per_day: n, meal_splits: null } as FeedGroup)
          : g,
      ).map((p) => String(Math.round(p * 10) / 10)),
    );
    setWindows(
      groupWindows(g === 'new' ? { meals_per_day: n, meal_windows: null } : g).map((w) => {
        if (!w) return { from: '', to: '' };
        const [from, to] = w.text.split('-');
        return { from: (from ?? '').trim(), to: (to ?? '').trim() };
      }),
    );
    setEditing(g);
  }

  /** Changing the meal count reshapes the splits and windows with it: an even
   *  split for the new count, and windows carried over where they exist. */
  function setMealCount(n: number) {
    const next = Math.max(1, Math.min(4, n));
    setMeals(next);
    setSplits(Array.from({ length: next }, () => String(Math.round((100 / next) * 10) / 10)));
    setWindows((prev) => Array.from({ length: next }, (_, i) => prev[i] ?? { from: '', to: '' }));
  }

  const fields = [
    { key: 'name', label: t('Nombre'), required: true, half: true, placeholder: t('Engorde') },
    { key: 'ration_id', label: t('Ración'), type: 'select' as const, half: true, required: true,
      options: [{ value: '', label: t('— elegir —') }, ...rations.filter((r) => r.active !== false).map((r) => ({ value: r.id, label: r.name }))] },
    { key: 'route_order', label: t('Orden de recorrido'), type: 'number' as const, min: 0, step: 1, half: true },
    { key: 'cycle_id', label: t('Ciclo'), type: 'select' as const, half: true,
      options: [{ value: '', label: t('— sin ciclo —') }, ...cycles.map((c) => ({ value: c.id, label: c.name }))] },
    { key: 'active', label: t('Activo'), type: 'checkbox' as const, half: true },
    { key: 'notes', label: t('Notas'), type: 'textarea' as const },
  ];

  const toValues = (g: FeedGroup | 'new'): FormValues =>
    g === 'new'
      ? { name: '', ration_id: '', route_order: String(rows.length + 1), cycle_id: defaultCycle, active: true, notes: '' }
      : { name: g.name, ration_id: g.ration_id ?? '', route_order: String(g.route_order ?? 0),
          cycle_id: g.cycle_id ?? '', active: g.active !== false, notes: g.notes ?? '' };

  async function save(v: FormValues) {
    const parts = splits.map((p) => parseFloat(p));
    if (parts.some((p) => !Number.isFinite(p) || p < 0)) return t('Cada comida necesita un porcentaje válido.');
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum <= 0) return t('El reparto entre comidas no puede sumar cero.');

    const built = buildMealWindows(windows.slice(0, meals));
    if (built && typeof built === 'object') return built.error;

    const base = editing === 'new' || editing == null ? ({} as Partial<FeedGroup>) : editing;
    const row = groupRow({
      ...base,
      name: String(v.name).trim(),
      ration_id: fstr(v.ration_id),
      meals_per_day: meals,
      // Normalised to percentages of 100, so a 45/50 typed in a hurry still
      // stores something trustworthy.
      meal_splits: parts.map((p) => Math.round((p / sum) * 1000) / 10).join(','),
      meal_windows: built as string | null,
      route_order: fnum(v.route_order) ?? 0,
      cycle_id: fstr(v.cycle_id),
      active: Boolean(v.active),
      notes: fstr(v.notes),
    });

    return run(async (w) => {
      await w.save('vf_feed_groups', row);
      // Membership is written after the group exists, so a brand-new group's
      // rows never point at an id that isn't there yet.
      for (const lot of penOptions) {
        const should = members.has(lot.id);
        const already = lotGroups.some((m) => m.lot_id === lot.id && m.group_id === row.id);
        if (should !== already) await setLotInGroup(w, lot.id, row.id, should, lotGroups);
      }
    }, editing === 'new' ? t('Grupo creado') : t('Grupo guardado'));
  }

  return (
    <Card>
      <CardHeader
        title={t('Grupos de alimentación')}
        subtitle={t('Un grupo es una carga del mixer: una ración y los corrales que la reciben')}
        action={<Button variant="primary" onClick={() => open('new')}>{t('Agregar grupo')}</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState title={t('Sin grupos')} hint={t('Sin un grupo la app no sabe qué cargar: cree uno con su ración y sus corrales.')} />
      ) : (
        <TableWrap>
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <Th right>#</Th>
                <Th>{t('Grupo')}</Th>
                <Th>{t('Ración')}</Th>
                <Th>{t('Corrales')}</Th>
                <Th right>{t('Cab.')}</Th>
                <Th right>{t('Comidas')}</Th>
                <Th>{t('Reparto')}</Th>
                <Th>{t('Horarios de entrega')}</Th>
                <Th right>{t('Carga/comida')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const pens = lotGroups
                  .filter((m) => m.group_id === g.id)
                  .map((m) => lots.find((l) => l.id === m.lot_id))
                  .filter(Boolean);
                const head = pens.reduce((s, l) => s + (l?.head_count ?? 0), 0);
                const perHeadDay = rationKgPerHead(ix, g.ration_id);
                const meals = g.meals_per_day && g.meals_per_day > 0 ? g.meals_per_day : 1;
                // Per meal, and weighted by each pen's own factor — the same
                // arithmetic the app does when it builds the load sheet.
                const perMeal =
                  pens.reduce((s, l) => s + perHeadDay * (l?.feed_factor ?? 1) * (l?.head_count ?? 0), 0) / meals;
                return (
                  <tr key={g.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td right className="text-slate-400">{g.route_order ?? 0}</Td>
                    <Td>
                      <span className="font-medium">{g.name}</span>
                      {g.active === false && <span className="ml-1.5 text-xs text-slate-400">(inactivo)</span>}
                    </Td>
                    <Td>{rations.find((r) => r.id === g.ration_id)?.name ?? <span className="text-amber-600">{t('sin ración')}</span>}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {pens.map((l) => (
                          <Badge key={l!.id}>{l!.name}</Badge>
                        ))}
                        {pens.length === 0 && <span className="text-amber-600">{t('sin corrales')}</span>}
                      </span>
                    </Td>
                    <Td right>{head}</Td>
                    <Td right>{meals}</Td>
                    <Td>{groupSplits(g).map((s) => `${Math.round(s)}%`).join(' · ')}</Td>
                    <Td>
                      {groupWindows(g).every((w) => !w) ? (
                        <span className="text-slate-400">{t('sin horario')}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {groupWindows(g).map((w, i) => (
                            <Badge key={i}>
                              {w ? `${fmtMinutesOfDay(w.from)}–${fmtMinutesOfDay(w.to)}` : '—'}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </Td>
                    <Td right>{perMeal ? formatWeight(perMeal, 'kg') : '—'}</Td>
                    <Td right>
                      <Button onClick={() => open(g)}>{t('Editar')}</Button>
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
          title={editing === 'new' ? t('Nuevo grupo') : t('Editar {v1}', { v1: editing.name })}
          fields={fields}
          initial={toValues(editing)}
          onSave={save}
          onClose={() => setEditing(null)}
          wide
          extra={
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  {t('Alimentaciones por día')}
                </p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMealCount(n)}
                      aria-pressed={meals === n}
                      className={cx(
                        'w-12 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                        meals === n
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('La ración es por DÍA; cada carga es una comida. Con 2, cada carga lleva su parte del total.')}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  {t('Reparto y horario de cada comida')}
                </p>
                <div className="space-y-2">
                  {Array.from({ length: meals }, (_, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                      <span className="w-20 text-sm text-slate-600 dark:text-slate-300">Comida {i + 1}</span>
                      <div className="w-20 shrink-0">
                        <Input
                          type="number"
                          step={1}
                          min={0}
                          inputMode="decimal"
                          value={splits[i] ?? ''}
                          onChange={(e) =>
                            setSplits((prev) => {
                              const next = prev.slice();
                              next[i] = e.target.value;
                              return next;
                            })
                          }
                        />
                      </div>
                      <span className="text-sm text-slate-500">%</span>
                      {/* The window sits with its share: both describe the same
                          feeding, and splitting them across two screens is how
                          one of them ends up stale. */}
                      <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">{t('entrega')}</span>
                      <div className="w-28 shrink-0">
                        <Input
                          type="time"
                          value={windows[i]?.from ?? ''}
                          onChange={(e) =>
                            setWindows((prev) => {
                              const next = prev.slice();
                              next[i] = { from: e.target.value, to: next[i]?.to ?? '' };
                              return next;
                            })
                          }
                        />
                      </div>
                      <span className="text-slate-400">–</span>
                      <div className="w-28 shrink-0">
                        <Input
                          type="time"
                          value={windows[i]?.to ?? ''}
                          onChange={(e) =>
                            setWindows((prev) => {
                              const next = prev.slice();
                              next[i] = { from: next[i]?.from ?? '', to: e.target.value };
                              return next;
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Suma {splits.slice(0, meals).reduce((a, b) => a + (parseFloat(b) || 0), 0).toFixed(0)}% — se guarda
                  normalizado a 100. El ganado come mejor con fresco: es normal cargar más a la tarde. El horario es
                  opcional; sin él la entrega no se juzga ni tarde ni temprano.
                </p>
              </div>

              <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {t('Corrales en este grupo')}
              </p>
              {penOptions.length === 0 ? (
                <p className="text-sm text-slate-500">{t('No hay corrales activos en este ciclo.')}</p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {penOptions.map((l) => {
                    const on = members.has(l.id);
                    return (
                      <label
                        key={l.id}
                        className={cx(
                          'flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
                          on
                            ? 'border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/30'
                            : 'border-slate-200 dark:border-slate-800',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setMembers((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(l.id);
                                else next.delete(l.id);
                                return next;
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          {l.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {t('{v1} cab. · factor {v2}', {
                            v1: l.head_count ?? 0,
                            v2: formatNumber(l.feed_factor ?? 1, 2),
                          })}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t('Un corral puede estar en varios grupos — su consumo es la suma de todos.')}
              </p>
              </div>
            </div>
          }
          onDelete={
            editing === 'new'
              ? undefined
              : async () => run((w) => deleteGroup(w, editing.id, lotGroups), t('Grupo eliminado'))
          }
          deleteWarning={t('Se elimina el grupo y la pertenencia de sus corrales. Las mezclas ya registradas conservan el nombre del grupo guardado en cada fila.')}
        />
      )}
    </Card>
  );
}
