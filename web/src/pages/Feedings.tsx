import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrency, useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import {
  costOf,
  deliveriesFor,
  loadsFor,
  fmtMinutesOfDay,
  groupWindows,
  isOutOfSpec,
  loadVariance,
  mixDryMatterFraction,
} from '../lib/analytics';
import {
  downloadCsv,
  exactDigits,
  formatDateTime,
  formatDuration,
  formatTime,
  formatMoney,
  formatNumber,
  formatPct,
  formatWeight,
  toCsv,
} from '../lib/format';
import { FeedingTimeline, deliveryGaps, feedingPhases, loadGaps } from '../components/FeedingTimeline';
import { FilterPanel } from '../components/FilterPanel';
import { DataError } from '../components/DataError';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Label,
  LoadBar,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
  cx,
} from '../components/ui';

/**
 * One row per mixer load. The column that matters is the last one: how many
 * ingredients landed outside their own tolerance band. Formulated-vs-loaded is
 * the variance the product is sold on, and it is invisible on the phone once
 * the load is finished.
 */
export default function Feedings() {
  const t = useT();
  const { ix, loading, error } = useData();
  const { unit } = usePrefs();
  const currency = useCurrency();
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  const rows = useMemo(
    () =>
      ix.t.feedings
        .slice()
        .sort((a, b) => new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime())
        .map((f) => {
          const variance = loadVariance(ix, f.id);
          const offSpec = variance.filter(isOutOfSpec).length;
          const loaded = f.total_loaded_kg ?? 0;
          const delivered = f.total_delivered_kg ?? 0;
          const group = ix.t.groups.find((g) => g.id === f.group_id) ?? null;
          const loads = loadsFor(ix, f.id);
          const pens = deliveriesFor(ix, f.id);
          // Computed once per feeding: the detail panel reads the phases from
          // three places, and recomputing them per cell scales with the table.
          const phases = feedingPhases(f, loads, pens);
          const window = group ? groupWindows(group)[Math.max(0, (f.meal_index ?? 1) - 1)] : null;
          return {
            f,
            group,
            window,
            variance,
            offSpec,
            loaded,
            delivered,
            // What went in but never came out: mixer residue, spillage, or an
            // unfinished route. Shown as kilos, not hidden in a percentage.
            leftInMixer: loaded && delivered ? loaded - delivered : null,
            cost: costOf(ix, f.id),
            dm: mixDryMatterFraction(ix, f.id),
            loads,
            pens,
            phases,
            loadGapList: loadGaps(loads, phases.loadStart),
            deliveryGapList: deliveryGaps(pens, phases.deliveryStart),
          };
        }),
    [ix],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && (r.f.status ?? '') !== status) return false;
      if (!q) return true;
      return `${r.f.group_name ?? ''} ${r.f.ration_name ?? ''} ${r.f.operator_name ?? ''} ${r.f.mixer_name ?? ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, status]);

  function exportCsv() {
    const csv = toCsv(
      [t('Fecha'), 'Grupo', 'Ración', 'Comida', 'Mixer', 'Operador', 'Estado', 'Cargado kg', 'Entregado kg', 'Costo', 'MS %', 'Fuera de tolerancia', 'Horario', 'Entrega iniciada', 'Puntualidad', 'Minutos fuera', 'Carga inicio', 'Carga fin', 'Carga seg', 'Mezclado seg', 'Mezclado pedido seg', 'Descargó antes', 'Entrega seg', 'Total seg'],
      filtered.map((r) => [
        r.f.started_at ?? '',
        r.f.group_name ?? '',
        r.f.ration_name ?? '',
        r.f.meal ?? '',
        r.f.mixer_name ?? '',
        r.f.operator_name ?? '',
        r.f.status ?? '',
        r.loaded.toFixed(1),
        r.delivered.toFixed(1),
        Math.round(r.cost),
        r.dm != null ? (r.dm * 100).toFixed(1) : '',
        r.offSpec,
        r.window ? `${fmtMinutesOfDay(r.window.from)}-${fmtMinutesOfDay(r.window.to)}` : '',
        r.f.delivery_started_at ?? '',
        r.f.delivery_status ?? '',
        r.f.delivery_minutes_off ?? '',
        r.phases.loadStart ?? '',
        r.phases.loadEnd ?? '',
        r.phases.loadSec == null ? '' : Math.round(r.phases.loadSec),
        r.phases.mixActualSec == null ? '' : Math.round(r.phases.mixActualSec),
        r.phases.mixRequiredSec ?? '',
        r.phases.unloadedEarly ? 'sí' : '',
        r.phases.deliverySec == null ? '' : Math.round(r.phases.deliverySec),
        r.phases.totalSec == null ? '' : Math.round(r.phases.totalSec),
      ]),
    );
    downloadCsv(`virtus-feed-mezclas-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (loading) return <Spinner label={t('Cargando mezclas…')} />;
  if (error) return <DataError message={error} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t('Mezclas')}
          subtitle={t('{v1} cargas · toque una fila para ver formulado vs cargado', { v1: filtered.length })}
          action={
            <Button onClick={exportCsv} disabled={!filtered.length}>
              {t('Exportar CSV')}
            </Button>
          }
        />
        <FilterPanel
          activeCount={[query.trim(), status].filter(Boolean).length}
          onClear={() => {
            setQuery('');
            setStatus('');
          }}
        >
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label>{t('Buscar')}</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Grupo, ración, mixer, operador')}
            />
          </div>
          <div>
            <Label>{t('Estado')}</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('Todos')}</option>
              <option value="done">{t('Terminada')}</option>
              <option value="loading">{t('Cargando')}</option>
              <option value="delivering">{t('Entregando')}</option>
              <option value="abandoned">{t('Abandonada')}</option>
            </Select>
          </div>
        </div>
        </FilterPanel>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title={t('Sin mezclas')} hint={t('Cada carga del mixer aparece aquí al sincronizar.')} />
        ) : (
          <TableWrap>
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>{t('Fecha')}</Th>
                  <Th>{t('Grupo / ración')}</Th>
                  <Th>{t('Operador')}</Th>
                  <Th right>{t('Cargado')}</Th>
                  <Th right>{t('Entregado')}</Th>
                  <Th right>{t('Queda')}</Th>
                  <Th right>{t('MS')}</Th>
                  <Th right>{t('Costo')}</Th>
                  <Th>{t('Mezclado')}</Th>
                  <Th>{t('Entrega')}</Th>
                  <Th>{t('Tolerancia')}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((r) => (
                  <Fragment key={r.f.id}>
                    <tr
                      onClick={() => setOpen(open === r.f.id ? null : r.f.id)}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                    >
                      <Td>{formatDateTime(r.f.started_at)}</Td>
                      <Td>
                        <span className="flex items-center gap-1.5">
                          {r.f.group_name && <Badge tone="brand">{r.f.group_name}</Badge>}
                          <span className="text-slate-500 dark:text-slate-400">{r.f.ration_name ?? '—'}</span>
                          {r.f.meal && <Badge>{r.f.meal}</Badge>}
                        </span>
                      </Td>
                      <Td>{r.f.operator_name ?? '—'}</Td>
                      <Td right className="font-medium">
                        {formatWeight(r.loaded, unit)}
                      </Td>
                      <Td right>{formatWeight(r.delivered, unit)}</Td>
                      <Td right className={cx(!!r.leftInMixer && r.leftInMixer > r.loaded * 0.02 && 'text-amber-600 dark:text-amber-400')}>
                        {r.leftInMixer == null ? '—' : formatWeight(r.leftInMixer, unit)}
                      </Td>
                      <Td right>{r.dm == null ? '—' : `${(r.dm * 100).toFixed(0)}%`}</Td>
                      <Td right>{formatMoney(r.cost, currency)}</Td>
                      <Td>
                        {r.f.mix_actual_sec == null ? (
                          '—'
                        ) : (
                          <span className="flex items-center gap-1.5">
                            {formatDuration(r.f.mix_actual_sec)}
                            {r.f.unloaded_early && <Badge tone="warn">{t('salió antes')}</Badge>}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <DeliveryTimingCell
                          status={r.f.delivery_status}
                          minutesOff={r.f.delivery_minutes_off}
                          startedAt={r.f.delivery_started_at}
                          windowText={r.window ? `${fmtMinutesOfDay(r.window.from)}–${fmtMinutesOfDay(r.window.to)}` : null}
                          abandoned={r.f.status === 'abandoned'}
                        />
                      </Td>
                      <Td>
                        {r.variance.length === 0 ? (
                          '—'
                        ) : r.offSpec ? (
                          <Badge tone="bad">{r.offSpec} fuera</Badge>
                        ) : (
                          <Badge tone="good">{t('en rango')}</Badge>
                        )}
                      </Td>
                    </tr>

                    {open === r.f.id && (
                      <tr className="border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/60">
                        <td colSpan={11} className="px-4 py-4">
                          <FeedingTimeline feeding={r.f} loads={r.loads} deliveries={r.pens} />
                          <div className="mt-6 grid gap-6 lg:grid-cols-2">
                            <div>
                              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                                {t('Formulado vs cargado · en orden de carga')}
                              </h3>
                              <table className="w-full">
                                <tbody>
                                  {r.variance.map((v, i) => (
                                    <tr key={`${r.f.id}-v-${i}`}>
                                      <td className="py-1 pr-2 text-right text-xs tabular-nums text-slate-400">
                                        {formatTime(r.loads[i]?.at)}
                                      </td>
                                      <td className="py-1 pr-3 text-xs tabular-nums text-slate-400" title={t('Tiempo desde el producto anterior')}>
                                        {r.loadGapList[i] == null ? '' : `+${formatDuration(r.loadGapList[i] as number)}`}
                                      </td>
                                      <td className="py-1 pr-3 text-sm text-slate-700 dark:text-slate-200">{v.name ?? '—'}</td>
                                      <td className="w-40 py-1 pr-3">
                                        <LoadBar actualKg={v.actualKg} targetKg={v.targetKg} tolPct={v.tolPct} />
                                      </td>
                                      {/* The scale reading, not a tidy total: this row exists
                                          to answer "how much of that product actually went in".
                                          Follows the header's unit toggle, like the pen table
                                          beside it — the two used to disagree. */}
                                      <td className="py-1 pr-3 text-right text-sm tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">
                                        <span className="font-medium">
                                          {formatWeight(v.actualKg, unit, exactDigits(unit))}
                                        </span>
                                        <span className="text-slate-400 dark:text-slate-500">
                                          {' / '}
                                          {formatWeight(v.targetKg, unit)}
                                        </span>
                                      </td>
                                      <td
                                        className={cx(
                                          'py-1 text-right text-sm font-medium tabular-nums',
                                          isOutOfSpec(v)
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-slate-500 dark:text-slate-400',
                                        )}
                                      >
                                        {formatPct(v.pct)}
                                      </td>
                                    </tr>
                                  ))}
                                  {r.variance.length === 0 && (
                                    <tr>
                                      <td className="py-1 text-sm text-slate-500">{t('Sin filas de carga.')}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>

                            <div>
                              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                                {t('Reparto por corral · en orden del recorrido')}
                              </h3>
                              <table className="w-full">
                                <tbody>
                                  {r.pens.map((d, i) => (
                                    <tr key={d.id}>
                                      <td className="py-1 pr-2 text-right text-xs tabular-nums text-slate-400">
                                        {formatTime(d.at)}
                                      </td>
                                      <td className="py-1 pr-3 text-xs tabular-nums text-slate-400" title={t('Tiempo desde el corral anterior')}>
                                        {r.deliveryGapList[i] == null ? '' : `+${formatDuration(r.deliveryGapList[i] as number)}`}
                                      </td>
                                      <td className="py-1 pr-3 text-sm">
                                        {d.lot_id ? (
                                          <Link
                                            to={`/pens/${d.lot_id}`}
                                            className="text-brand-700 hover:underline dark:text-brand-300"
                                          >
                                            {d.lot_name ?? '—'}
                                          </Link>
                                        ) : (
                                          (d.lot_name ?? '—')
                                        )}
                                      </td>
                                      <td className="py-1 pr-3 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                                        {t('{v1} cab.', { v1: d.head_count ?? '—' })}
                                      </td>
                                      <td className="py-1 pr-3 text-right text-sm tabular-nums text-slate-700 dark:text-slate-200">
                                        {formatWeight(d.actual_kg, unit)}
                                      </td>
                                      <td className="py-1 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                                        {formatNumber(d.kg_per_head, 2)} kg/cab
                                      </td>
                                    </tr>
                                  ))}
                                  {r.pens.length === 0 && (
                                    <tr>
                                      <td className="py-1 text-sm text-slate-500">{t('Todavía no se descargó.')}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

/**
 * How the delivery landed against its group's window. An untimed group shows
 * the window as absent rather than as "on time" — nothing was promised, so
 * nothing can be judged, and blurring those two is how a punctuality figure
 * starts lying.
 */
function DeliveryTimingCell({
  status,
  minutesOff,
  startedAt,
  windowText,
  abandoned,
}: {
  status: string | null;
  minutesOff: number | null;
  startedAt: string | null;
  windowText: string | null;
  abandoned: boolean;
}) {
  const t = useT();
  if (abandoned) return <Badge tone="warn">{t('abandonada')}</Badge>;
  if (!windowText) return <span className="text-slate-400">{t('sin horario')}</span>;

  const off = minutesOff ?? 0;
  const label =
    status === 'late'
      ? t('tarde +{v1} min', { v1: Math.round(off) })
      : status === 'early'
        ? t('temprano {v1} min', { v1: Math.round(off) })
        : t('en horario');

  return (
    <span className="flex items-center gap-1.5">
      <Badge tone={status === 'late' ? 'bad' : status === 'early' ? 'warn' : 'good'}>{label}</Badge>
      <span className="text-xs text-slate-400">
        {startedAt ? formatTime(startedAt) : '—'} · {windowText}
      </span>
    </span>
  );
}
