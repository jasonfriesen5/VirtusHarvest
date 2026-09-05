import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCurrency, useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import {
  costPerHeadPerDay,
  groupsForLot,
  intakePctOfBodyweight,
  intakePerHead,
  latestBunkScore,
  lotGain,
  BUNK_LABELS,
} from '../lib/analytics';
import { downloadCsv, formatMoney, formatNumber, formatWeight, relativeTime, toCsv } from '../lib/format';
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
  cx,
} from '../components/ui';

/**
 * Every pen on one screen, in route order — the view a manager wants at 6am.
 *
 * Intake is quoted on a dry-matter basis and as a percentage of bodyweight,
 * because that is the pair a nutritionist reads: 2.0–2.5% of BW is normal, and
 * a pen drifting below it is the earliest sign something is wrong. As-fed
 * kilos of a wet ration would read roughly double and mean nothing.
 */
export default function Pens() {
  const t = useT();
  const { ix, loading, error } = useData();
  const { unit, windowDays } = usePrefs();
  const currency = useCurrency();

  const rows = useMemo(
    () =>
      ix.t.lots
        .filter((l) => l.active !== false)
        .slice()
        .sort((a, b) => (a.route_order ?? 0) - (b.route_order ?? 0) || a.name.localeCompare(b.name))
        .map((lot) => {
          const intake = intakePerHead(ix, lot.id, windowDays);
          return {
            lot,
            intake,
            pctBw: intakePctOfBodyweight(intake, lot.avg_weight_kg),
            cost: costPerHeadPerDay(ix, lot.id, windowDays),
            gain: lotGain(ix, lot.id),
            bunk: latestBunkScore(ix, lot.id),
            groups: groupsForLot(ix, lot.id),
          };
        }),
    [ix, windowDays],
  );

  const totals = useMemo(() => {
    const head = rows.reduce((s, r) => s + (r.lot.head_count ?? 0), 0);
    const withCost = rows.filter((r) => r.cost != null);
    // Weighted by head: a 200-head pen should not count the same as a 20-head
    // one in the yard's average.
    const costHead = withCost.reduce((s, r) => s + (r.cost ?? 0) * (r.lot.head_count ?? 0), 0);
    const costHeadDen = withCost.reduce((s, r) => s + (r.lot.head_count ?? 0), 0);
    const withIntake = rows.filter((r) => r.intake);
    const dm = withIntake.reduce((s, r) => s + (r.intake?.dm ?? 0) * (r.lot.head_count ?? 0), 0);
    const dmDen = withIntake.reduce((s, r) => s + (r.lot.head_count ?? 0), 0);
    return {
      pens: rows.length,
      head,
      costPerHead: costHeadDen ? costHead / costHeadDen : null,
      dmPerHead: dmDen ? dm / dmDen : null,
      dailyCost: costHeadDen ? costHead : null,
    };
  }, [rows]);

  function exportCsv() {
    const csv = toCsv(
      [t('Corral'), 'Cabezas', 'Peso prom. kg', 'Factor', 'kg/cab (como se ofrece)', 'kg MS/cab', '% PV', 'Costo/cab/día', 'GDP kg', 'Conversión MS'],
      rows.map((r) => [
        r.lot.name,
        r.lot.head_count ?? '',
        r.lot.avg_weight_kg ?? '',
        r.lot.feed_factor ?? 1,
        r.intake?.asFed.toFixed(2) ?? '',
        r.intake?.dm.toFixed(2) ?? '',
        r.pctBw?.toFixed(2) ?? '',
        r.cost != null ? Math.round(r.cost) : '',
        r.gain?.adg.toFixed(3) ?? '',
        r.gain?.conversion?.toFixed(2) ?? '',
      ]),
    );
    downloadCsv(`virtus-feed-corrales-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (loading) return <Spinner label={t('Cargando corrales…')} />;
  if (error) return <DataError message={error} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('Corrales activos')} value={String(totals.pens)} />
        <Stat label={t('Cabezas')} value={totals.head.toLocaleString()} />
        <Stat
          label={t('Consumo MS / cab / día')}
          value={totals.dmPerHead == null ? '—' : `${formatNumber(totals.dmPerHead, 2)} kg`}
          hint={t('promedio ponderado, {v1} días', { v1: windowDays })}
        />
        <Stat
          label={t('Costo / cab / día')}
          value={formatMoney(totals.costPerHead, currency)}
          hint={totals.dailyCost != null ? t('{v1} por día en total', { v1: formatMoney(totals.dailyCost, currency) }) : undefined}
        />
      </div>

      <Card>
        <CardHeader
          title={t('Corrales')}
          subtitle={t('En orden de recorrido · promedios sobre {v1} días alimentados', { v1: windowDays })}
          action={
            <Button onClick={exportCsv} disabled={!rows.length}>
              {t('Exportar CSV')}
            </Button>
          }
        />
        {rows.length === 0 ? (
          <EmptyState title={t('Sin corrales')} hint={t('Cree los corrales en la app y sincronice.')} />
        ) : (
          <TableWrap>
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>{t('Corral')}</Th>
                  <Th>{t('Grupos')}</Th>
                  <Th right>{t('Cab.')}</Th>
                  <Th right>{t('Peso')}</Th>
                  <Th right>{t('Factor')}</Th>
                  <Th right>{t('kg MS/cab')}</Th>
                  <Th right>{t('% PV')}</Th>
                  <Th right>{t('Costo/cab/día')}</Th>
                  <Th right>{t('GDP')}</Th>
                  <Th right>{t('Conv.')}</Th>
                  <Th>{t('Lectura')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.lot.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <Td>
                      <Link
                        to={`/pens/${r.lot.id}`}
                        className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                      >
                        {r.lot.name}
                      </Link>
                      {r.lot.pen_code && (
                        <span className="ml-1.5 text-xs text-slate-400">{r.lot.pen_code}</span>
                      )}
                    </Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {r.groups.map((g) => (
                          <Badge key={g.id} tone="brand">
                            {g.name}
                          </Badge>
                        ))}
                        {r.groups.length === 0 && <span className="text-slate-400">{t('sin grupo')}</span>}
                      </span>
                    </Td>
                    <Td right>{r.lot.head_count ?? '—'}</Td>
                    <Td right>{r.lot.avg_weight_kg ? formatWeight(r.lot.avg_weight_kg, unit) : '—'}</Td>
                    <Td right>
                      <FactorChip factor={r.lot.feed_factor} />
                    </Td>
                    <Td right>{formatNumber(r.intake?.dm, 2)}</Td>
                    <Td right>
                      <PctBw value={r.pctBw} />
                    </Td>
                    <Td right>{formatMoney(r.cost, currency)}</Td>
                    <Td right>{r.gain ? `${formatNumber(r.gain.adg, 2)} kg` : '—'}</Td>
                    <Td right>{formatNumber(r.gain?.conversion, 2)}</Td>
                    <Td>
                      {r.bunk ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {r.bunk.score == null
                            ? t('ajuste manual')
                            : t('{score} · {label}', {
                                score: r.bunk.score,
                                label: t(BUNK_LABELS[r.bunk.score]),
                              })}
                          <span className="ml-1 text-slate-400">{relativeTime(r.bunk.at)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">{t('sin lectura')}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

/** 1.00 is the ration as written; anything else says a person or a bunk score
 *  moved this pen, and by how much. */
export function FactorChip({ factor }: { factor: number | null | undefined }) {
  const f = factor ?? 1;
  if (Math.abs(f - 1) < 0.005) return <span className="text-slate-400">1.00</span>;
  return (
    <span
      className={cx(
        'font-medium tabular-nums',
        f > 1 ? 'text-brand-700 dark:text-brand-300' : 'text-amber-700 dark:text-amber-400',
      )}
    >
      {f.toFixed(2)}
    </span>
  );
}

/**
 * Dry-matter intake as a share of bodyweight. Below 1.8% is worth a look and
 * above 3.0% usually means the head count or the average weight is stale, so
 * both ends are flagged rather than only the low one.
 */
export function PctBw({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const tone = value < 1.8 || value > 3.0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200';
  return <span className={cx('tabular-nums', tone)}>{value.toFixed(2)}%</span>;
}
