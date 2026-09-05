import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCurrency, useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import {
  BUNK_LABELS,
  costPerHeadPerDay,
  deliveryDetail,
  groupSplits,
  groupsForLot,
  intakePctOfBodyweight,
  intakePerHead,
  lotGain,
  rationKgPerHead,
} from '../lib/analytics';
import {
  dayKey,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPct,
  formatWeight,
} from '../lib/format';
import { DataError } from '../components/DataError';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Spinner,
  Stat,
  TableWrap,
  Td,
  Th,
} from '../components/ui';
import { FactorChip, PctBw } from './Pens';
import { LotFormModal } from '../components/LotForm';
import { BunkScoreModal, FeedAdjustModal, WeighInModal } from '../components/penActions';

type PenAction = 'edit' | 'adjust' | 'bunk' | 'weigh' | null;

/**
 * One pen, end to end: what it is getting, what it is eating, what that costs
 * and what it is turning into. Modelled on the app's pen screen so a manager
 * and an operator are looking at the same story from two devices.
 */
export default function PenDetail() {
  const t = useT();
  const { lotId = '' } = useParams();
  const navigate = useNavigate();
  const { ix, loading, error } = useData();
  const [action, setAction] = useState<PenAction>(null);
  const { unit, windowDays } = usePrefs();
  const currency = useCurrency();

  const lot = ix.lotById.get(lotId) ?? null;

  const view = useMemo(() => {
    if (!lot) return null;
    const intake = intakePerHead(ix, lot.id, windowDays);
    const groups = groupsForLot(ix, lot.id);
    const factor = lot.feed_factor ?? 1;

    // What the pen SHOULD get per day: every group it belongs to, each group's
    // ration as written, scaled by the pen's feed factor. A pen in two groups
    // eats the sum — that is the whole reason groups are many-to-many.
    const prescribed = groups.map((g) => {
      const perHeadDay = rationKgPerHead(ix, g.ration_id);
      return {
        group: g,
        perHeadDay,
        adjusted: perHeadDay * factor,
        penTotal: perHeadDay * factor * (lot.head_count ?? 0),
        splits: groupSplits(g),
      };
    });

    const deliveries = (ix.deliveriesByLot.get(lot.id) ?? [])
      .slice()
      .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());

    // Daily kg per head across the window, for the sparkline. Bucketed by
    // local day so a 6am and a 5pm feeding land on the same bar.
    const since = Date.now() - windowDays * 86_400_000;
    const byDay = new Map<string, { kg: number; head: number }>();
    deliveries.forEach((d) => {
      if (!d.at || !d.actual_kg || new Date(d.at).getTime() < since) return;
      const k = dayKey(d.at);
      const cur = byDay.get(k) ?? { kg: 0, head: d.head_count ?? lot.head_count ?? 0 };
      cur.kg += d.actual_kg;
      cur.head = d.head_count ?? cur.head;
      byDay.set(k, cur);
    });
    const daily = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, perHead: v.head ? v.kg / v.head : 0 }));

    return {
      intake,
      pctBw: intakePctOfBodyweight(intake, lot.avg_weight_kg),
      cost: costPerHeadPerDay(ix, lot.id, windowDays),
      gain: lotGain(ix, lot.id),
      groups,
      prescribed,
      deliveries,
      daily,
      adjustments: ix.t.bunkScores
        .filter((b) => b.lot_id === lot.id)
        .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()),
      weighIns: (ix.weighInsByLot.get(lot.id) ?? []).slice().reverse(),
      returns: (ix.returnsByLot.get(lot.id) ?? [])
        .slice()
        .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()),
    };
  }, [ix, lot, windowDays]);

  if (loading) return <Spinner label={t('Cargando corral…')} />;
  if (error) return <DataError message={error} />;
  if (!lot || !view) {
    return (
      <Card>
        <EmptyState
          title={t('Corral no encontrado')}
          hint={t('Puede pertenecer a otro ciclo — pruebe cambiando el ciclo en la barra superior.')}
        />
      </Card>
    );
  }

  const daysOnFeed = lot.entry_date
    ? Math.max(0, Math.round((Date.now() - new Date(lot.entry_date).getTime()) / 86_400_000))
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/pens" className="text-sm text-brand-700 hover:underline dark:text-brand-300">
          {t('‹ Corrales')}
        </Link>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{lot.name}</h1>
        {lot.pen_code && <Badge>{lot.pen_code}</Badge>}
        {lot.category && <Badge>{t(lot.category)}</Badge>}
        {view.groups.map((g) => (
          <Badge key={g.id} tone="brand">
            {g.name}
          </Badge>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => setAction('bunk')}>{t('Lectura de comedero')}</Button>
          <Button onClick={() => setAction('weigh')}>{t('Registrar pesada')}</Button>
          <Button onClick={() => setAction('adjust')}>{t('Ajustar %')}</Button>
          <Button variant="primary" onClick={() => setAction('edit')}>
            {t('Editar corral')}
          </Button>
        </div>
      </div>

      {action === 'edit' && (
        <LotFormModal lot={lot} onClose={() => setAction(null)} onDeleted={() => navigate('/pens')} />
      )}
      {action === 'adjust' && <FeedAdjustModal lot={lot} onClose={() => setAction(null)} />}
      {action === 'bunk' && <BunkScoreModal lot={lot} onClose={() => setAction(null)} />}
      {action === 'weigh' && <WeighInModal lot={lot} onClose={() => setAction(null)} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('Cabezas')}
          value={String(lot.head_count ?? 0)}
          hint={daysOnFeed != null ? t('{v1} días en confinamiento', { v1: daysOnFeed }) : undefined}
        />
        <Stat
          label={t('Peso promedio')}
          value={lot.avg_weight_kg ? formatWeight(lot.avg_weight_kg, unit) : '—'}
          hint={lot.entry_weight_kg ? t('entrada {v1}', { v1: formatWeight(lot.entry_weight_kg, unit) }) : undefined}
        />
        <Stat
          label={t('Consumo MS / cab / día')}
          value={view.intake ? `${formatNumber(view.intake.dm, 2)} kg` : '—'}
          hint={view.intake ? t('{v1} kg como se ofrece', { v1: formatNumber(view.intake.asFed, 2) }) : undefined}
        />
        <Stat
          label={t('Costo / cab / día')}
          value={formatMoney(view.cost, currency)}
          hint={
            view.cost != null && lot.head_count
              ? t('{v1} por día', { v1: formatMoney(view.cost * lot.head_count, currency) })
              : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t('Lo que le toca por día')}
            subtitle={t('Ración como está escrita → ajustada por el factor del corral → total del corral')}
          />
          <div className="space-y-3 p-4">
            {view.prescribed.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('Este corral no pertenece a ningún grupo, así que no tiene ración asignada.')}
              </p>
            )}
            {view.prescribed.map((p) => (
              <div key={p.group.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.group.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('{v1} comidas/día · reparto {v2}', {
                      v1: p.group.meals_per_day ?? 2,
                      v2: p.splits.map((x) => Math.round(x)).join('/'),
                    })}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('Ración')}</p>
                    <p className="tabular-nums">{t('{v1} kg/cab', { v1: formatNumber(p.perHeadDay, 2) })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('Ajustada')}</p>
                    <p className="tabular-nums">{t('{v1} kg/cab', { v1: formatNumber(p.adjusted, 2) })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('Total corral')}</p>
                    <p className="tabular-nums">{formatWeight(p.penTotal, unit)}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">
                {t('Factor de alimentación')} <FactorChip factor={lot.feed_factor} />
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {t('% del peso vivo (MS)')} <PctBw value={view.pctBw} />
              </span>
              {view.intake && view.intake.refusedKg > 0 && (
                <span className="text-slate-500 dark:text-slate-400">
                  Rechazo en la ventana {formatWeight(view.intake.refusedKg, unit)}
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('Ganancia')} subtitle={t('Entre la primera y la última pesada')} />
          <div className="p-4">
            {view.gain ? (
              <dl className="space-y-2 text-sm">
                <Row label={t('GDP')} value={t('{v1} kg/día', { v1: formatNumber(view.gain.adg, 3) })} />
                <Row label={t('Ganancia total')} value={t('{v1} kg/cab', { v1: formatNumber(view.gain.gainPerHead, 1) })} />
                <Row label={t('Período')} value={t('{v1} días', { v1: Math.round(view.gain.days) })} />
                <Row label={t('Conversión (MS)')} value={formatNumber(view.gain.conversion, 2)} />
                <Row
                  label={t('Conversión (como se ofrece)')}
                  value={formatNumber(view.gain.conversionAsFed, 2)}
                />
              </dl>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Hacen falta dos pesadas para calcular ganancia y conversión. Este corral tiene{' '}
                {view.weighIns.length}.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t('Consumo diario')}
          subtitle={t('kg entregados por cabeza, últimos {v1} días', { v1: windowDays })}
        />
        <div className="p-4">
          <Sparkline points={view.daily} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('Ajustes y lecturas de comedero')} subtitle={t('Score nulo = ajuste manual')} />
          {view.adjustments.length === 0 ? (
            <EmptyState title={t('Sin ajustes')} hint={t('El corral está recibiendo la ración como está escrita.')} />
          ) : (
            <TableWrap>
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <Th>{t('Fecha')}</Th>
                    <Th>{t('Lectura')}</Th>
                    <Th right>{t('Sugerido')}</Th>
                    <Th right>{t('Aplicado')}</Th>
                    <Th right>{t('Factor')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.adjustments.slice(0, 30).map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <Td>{formatDateTime(b.at)}</Td>
                      <Td>
                        {b.score == null
                          ? t('manual')
                          : t('{score} · {label}', { score: b.score, label: t(BUNK_LABELS[b.score] ?? '') })}
                      </Td>
                      <Td right>{formatPct(b.suggested_pct)}</Td>
                      <Td right>{formatPct(b.applied_pct)}</Td>
                      <Td right>{formatNumber(b.factor_after, 2)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title={t('Pesadas')} subtitle={t('Peso promedio por cabeza')} />
          {view.weighIns.length === 0 ? (
            <EmptyState title={t('Sin pesadas')} hint={t('Registre una pesada para obtener GDP y conversión.')} />
          ) : (
            <TableWrap>
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <Th>{t('Fecha')}</Th>
                    <Th right>{t('Peso prom.')}</Th>
                    <Th right>{t('Cabezas')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.weighIns.map((w) => (
                    <tr key={w.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <Td>{formatDate(w.at)}</Td>
                      <Td right>{formatWeight(w.avg_weight_kg, unit)}</Td>
                      <Td right>{w.head_count ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      {view.returns.length > 0 && (
        <Card>
          <CardHeader
            title={t('Rechazo')}
            subtitle={t('Lo barrido del comedero: sale del consumo, vuelve al stock y baja la próxima carga')}
          />
          <TableWrap>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>{t('Fecha')}</Th>
                  <Th right>{t('kg')}</Th>
                  <Th>{t('Origen')}</Th>
                  <Th>{t('Estado')}</Th>
                  <Th>{t('Nota')}</Th>
                </tr>
              </thead>
              <tbody>
                {view.returns.slice(0, 30).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td>{formatDateTime(r.at)}</Td>
                    <Td right>{formatWeight(r.kg, unit)}</Td>
                    <Td>{ix.feedingById.get(r.feeding_id ?? '')?.group_name ?? '—'}</Td>
                    <Td>{r.consumed ? <Badge>{t('reutilizado')}</Badge> : <Badge tone="warn">{t('pendiente')}</Badge>}</Td>
                    <Td>{r.note ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}

      <Card>
        <CardHeader title={t('Entregas')} subtitle={t('Las últimas 100 descargas a este corral')} />
        <TableWrap>
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <Th>{t('Fecha')}</Th>
                <Th>{t('Grupo / ración')}</Th>
                <Th right>{t('Cab.')}</Th>
                <Th right>{t('Entregado')}</Th>
                <Th right>{t('kg/cab')}</Th>
                <Th right>{t('Costo/cab')}</Th>
                <Th>{t('Operador')}</Th>
              </tr>
            </thead>
            <tbody>
              {view.deliveries.slice(0, 100).map((d) => {
                const detail = deliveryDetail(ix, d);
                return (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td>{formatDateTime(d.at)}</Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {detail?.groupName && <Badge tone="brand">{detail.groupName}</Badge>}
                        <span className="text-slate-500 dark:text-slate-400">{detail?.ration ?? '—'}</span>
                        {detail?.meal && <Badge>{detail.meal}</Badge>}
                      </span>
                    </Td>
                    <Td right>{d.head_count ?? '—'}</Td>
                    <Td right>{formatWeight(d.actual_kg, unit)}</Td>
                    <Td right>{formatNumber(detail?.kgPerHead, 2)}</Td>
                    <Td right>{formatMoney(detail?.costPerHead, currency)}</Td>
                    <Td>{detail?.operator ?? '—'}</Td>
                  </tr>
                );
              })}
              {view.deliveries.length === 0 && (
                <tr>
                  <Td>
                    <span className="text-slate-500">{t('Todavía no se alimentó este corral.')}</span>
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

/**
 * Inline SVG rather than Recharts: this page is not lazy-loaded, and pulling
 * the chart library in for one strip of bars would cost every pen view a few
 * hundred kilobytes.
 */
function Sparkline({ points }: { points: { day: string; perHead: number }[] }) {
  const t = useT();
  if (points.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{t('Sin entregas en la ventana elegida.')}</p>;
  }
  const max = Math.max(...points.map((p) => p.perHead), 0.001);
  return (
    <div className="flex h-32 items-end gap-1 overflow-x-auto">
      {points.map((p) => (
        <div key={p.day} className="flex min-w-4 flex-1 flex-col items-center gap-1" title={t('{v1}: {v2} kg/cab', { v1: p.day, v2: p.perHead.toFixed(2) })}>
          <div
            className="w-full rounded-t bg-brand-500/80"
            style={{ height: `${Math.max(2, (p.perHead / max) * 100)}%` }}
          />
          <span className="text-[10px] text-slate-400">{p.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}
