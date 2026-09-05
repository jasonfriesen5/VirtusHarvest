import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCurrency, useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import {
  costOf,
  deliveriesFor,
  fmtMinutesOfDay,
  groupSplits,
  groupWindows,
  isOutOfSpec,
  loadVariance,
} from '../lib/analytics';
import { dayKey, formatMoney, formatTime, formatWeight, relativeTime } from '../lib/format';
import { DataError } from '../components/DataError';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Spinner,
  Stat,
  TableWrap,
  Td,
  Th,
} from '../components/ui';

/**
 * The day as it stands: what has been mixed, what each group still owes, and
 * which pens have not been fed yet.
 *
 * "Still owed" counts today's feedings per group rather than reading the
 * clock, the same rule as the app's `nextMealIndex()` — an operator running
 * three hours late is behind, not skipping a meal.
 */
export default function Today() {
  const t = useT();
  const { ix, loading, error, liveStatus } = useData();
  const { unit } = usePrefs();
  const currency = useCurrency();

  const view = useMemo(() => {
    const today = dayKey(new Date().toISOString());
    const feedings = ix.t.feedings
      .filter((f) => dayKey(f.started_at) === today)
      .sort((a, b) => new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime());

    const loaded = feedings.reduce((s, f) => s + (f.total_loaded_kg ?? 0), 0);
    const delivered = feedings.reduce((s, f) => s + (f.total_delivered_kg ?? 0), 0);
    const cost = feedings.reduce((s, f) => s + costOf(ix, f.id), 0);
    const offSpec = feedings.reduce((s, f) => s + loadVariance(ix, f.id).filter(isOutOfSpec).length, 0);

    const fedLots = new Set<string>();
    feedings.forEach((f) => deliveriesFor(ix, f.id).forEach((d) => d.lot_id && fedLots.add(d.lot_id)));

    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const pending = ix.t.groups
      .filter((g) => g.active !== false)
      .map((g) => {
        const done = feedings.filter((f) => f.group_id === g.id && f.status === 'done').length;
        const meals = g.meals_per_day && g.meals_per_day > 0 ? Math.round(g.meals_per_day) : 1;
        const remaining = Math.max(0, meals - done);
        const windows = groupWindows(g);
        // The next meal is the one after however many are already done — the
        // same rule the app uses, counting feedings rather than reading the
        // clock, so an operator running three hours late is behind rather than
        // skipping a meal.
        const next = remaining > 0 ? windows[done] ?? null : null;
        return {
          group: g,
          done,
          meals,
          remaining,
          splits: groupSplits(g),
          windows,
          next,
          // Signed minutes: negative is time still to go, positive is overdue.
          minutesLate: next ? nowMin - next.to : null,
        };
      })
      .sort((a, b) => (a.group.route_order ?? 0) - (b.group.route_order ?? 0));

    const unfed = ix.t.lots
      .filter((l) => l.active !== false && !fedLots.has(l.id))
      .sort((a, b) => (a.route_order ?? 0) - (b.route_order ?? 0));

    const overdue = pending.filter((p) => p.minutesLate != null && p.minutesLate > 0).length;
    return { feedings, loaded, delivered, cost, offSpec, pending, unfed, overdue, fedCount: fedLots.size };
  }, [ix]);

  if (loading) return <Spinner label={t('Cargando el día…')} />;
  if (error) return <DataError message={error} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t('Cargado hoy')} value={formatWeight(view.loaded, unit)} hint={t('{v1} mezclas', { v1: view.feedings.length })} />
        <Stat
          label={t('Entregado hoy')}
          value={formatWeight(view.delivered, unit)}
          hint={t('{v1} corrales alimentados', { v1: view.fedCount })}
        />
        <Stat label={t('Costo del día')} value={formatMoney(view.cost, currency)} />
        <Stat
          label={t('Fuera de tolerancia')}
          value={String(view.offSpec)}
          hint={view.offSpec ? t('ingredientes fuera de su banda') : t('todas las cargas en rango')}
        />
        <Stat
          label={t('Comidas atrasadas')}
          value={String(view.overdue)}
          hint={view.overdue ? t('grupos pasados de su horario') : t('ningún grupo pasado de horario')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('Pendiente por grupo')}
            subtitle={t('Comidas que faltan hoy — se cuenta lo hecho, no la hora')}
          />
          {view.pending.length === 0 ? (
            <EmptyState title={t('Sin grupos')} hint={t('Cree grupos de alimentación en la app.')} />
          ) : (
            <TableWrap>
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <Th>{t('Grupo')}</Th>
                    <Th right>{t('Hechas')}</Th>
                    <Th right>{t('Faltan')}</Th>
                    <Th>{t('Próxima entrega')}</Th>
                    <Th>{t('Reparto')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.pending.map((p) => (
                    <tr key={p.group.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <Td className="font-medium">{p.group.name}</Td>
                      <Td right>
                        {p.done} / {p.meals}
                      </Td>
                      <Td right>
                        {p.remaining === 0 ? (
                          <Badge tone="good">{t('completo')}</Badge>
                        ) : (
                          <Badge tone="warn">{p.remaining}</Badge>
                        )}
                      </Td>
                      <Td>
                        {p.remaining === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : p.next ? (
                          <span className="flex items-center gap-1.5">
                            <span className="tabular-nums text-slate-600 dark:text-slate-300">
                              {fmtMinutesOfDay(p.next.from)}–{fmtMinutesOfDay(p.next.to)}
                            </span>
                            {p.minutesLate != null && p.minutesLate > 0 && (
                              <Badge tone="bad">{t('atrasada {v1} min', { v1: Math.round(p.minutesLate) })}</Badge>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t('sin horario')}</span>
                        )}
                      </Td>
                      <Td>{p.splits.map((s) => `${Math.round(s)}%`).join(' · ')}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t('Corrales sin alimentar hoy')}
            subtitle={view.unfed.length ? t('{v1} corrales', { v1: view.unfed.length }) : t('Todos recibieron al menos una descarga')}
          />
          {view.unfed.length === 0 ? (
            <EmptyState title={t('Todo el recorrido cubierto')} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {view.unfed.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <Link to={`/pens/${l.id}`} className="text-brand-700 hover:underline dark:text-brand-300">
                    {l.name}
                  </Link>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{l.head_count ?? 0} cab.</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t('Mezclas de hoy')}
          subtitle={
            liveStatus === 'live'
              ? 'Actualizando en vivo'
              : t('Realtime no está habilitado — refrescando cada 30 s')
          }
        />
        {view.feedings.length === 0 ? (
          <EmptyState title={t('Todavía no se cargó nada hoy')} hint={t('Las mezclas aparecen apenas la app sincroniza.')} />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>{t('Hora')}</Th>
                  <Th>{t('Grupo / ración')}</Th>
                  <Th>{t('Operador')}</Th>
                  <Th right>{t('Cargado')}</Th>
                  <Th right>{t('Entregado')}</Th>
                  <Th>{t('Corrales')}</Th>
                  <Th>{t('Entrega')}</Th>
                  <Th>{t('Estado')}</Th>
                </tr>
              </thead>
              <tbody>
                {view.feedings.map((f) => {
                  const pens = deliveriesFor(ix, f.id);
                  return (
                    <tr key={f.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <Td>
                        {formatTime(f.started_at)}
                        <span className="ml-1.5 text-xs text-slate-400">{relativeTime(f.started_at)}</span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-1.5">
                          {f.group_name && <Badge tone="brand">{f.group_name}</Badge>}
                          <span className="text-slate-500 dark:text-slate-400">{f.ration_name ?? '—'}</span>
                          {f.meal && <Badge>{f.meal}</Badge>}
                        </span>
                      </Td>
                      <Td>{f.operator_name ?? '—'}</Td>
                      <Td right>{formatWeight(f.total_loaded_kg, unit)}</Td>
                      <Td right>{formatWeight(f.total_delivered_kg, unit)}</Td>
                      <Td>{pens.map((d) => d.lot_name).filter(Boolean).join(', ') || '—'}</Td>
                      <Td>
                        {!f.delivery_status ? (
                          <span className="text-slate-400">{t('sin horario')}</span>
                        ) : (
                          <Badge
                            tone={
                              f.delivery_status === 'late' ? 'bad' : f.delivery_status === 'early' ? 'warn' : 'good'
                            }
                          >
                            {f.delivery_status === 'late'
                              ? t('tarde +{v1} min', { v1: Math.round(f.delivery_minutes_off ?? 0) })
                              : f.delivery_status === 'early'
                                ? t('temprano {v1} min', { v1: Math.round(f.delivery_minutes_off ?? 0) })
                                : t('en horario')}
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        {f.status === 'done' ? (
                          <Badge tone="good">{t('terminada')}</Badge>
                        ) : f.status === 'abandoned' ? (
                          <Badge tone="warn">{t('abandonada')}</Badge>
                        ) : (
                          <Badge tone="warn">{f.status === 'loading' ? 'cargando' : 'entregando'}</Badge>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
