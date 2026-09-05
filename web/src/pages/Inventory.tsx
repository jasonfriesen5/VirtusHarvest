import { useMemo, useState } from 'react';
import { useCurrency, useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import { costRunway, ingredientRunway, ingredientValue, shrinkFor } from '../lib/analytics';
import type { CostStep } from '../lib/analytics';
import type { Layer } from '../lib/costing';
import type { Ingredient, StockMove } from '../lib/types';
import { downloadCsv, formatDate, formatDateTime, formatMoney, formatNumber, formatPct, formatTime, formatWeight, toCsv } from '../lib/format';
import { StockMoveModal } from '../components/StockMoveModal';
import { InvoicePhoto } from '../components/InvoicePhoto';
import type { MoveKind } from '../components/StockMoveModal';
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

const KIND_LABEL: Record<string, string> = {
  receipt: 'Ingreso',
  count: 'Conteo',
  adjust: 'Ajuste',
  feed: 'Consumo',
  return: 'Devolución',
};

/**
 * Stock is a ledger, and this page shows it as one. The balance on an
 * ingredient is only the running total of vf_stock_moves — so a number that
 * looks wrong is always explainable by the movements underneath it.
 *
 * Two deliberate choices carried over from the app:
 *   · a negative balance is shown as negative. It means feed went out that no
 *     receipt explains, and hiding it at zero hides the problem.
 *   · shrink with no physical count in the window reads "sin conteo", not 0%.
 *     An unmeasured figure must never look like a measured one.
 */
export default function Inventory() {
  const t = useT();
  const { ix, ingredients, loading, error } = useData();
  const { unit, windowDays } = usePrefs();
  const currency = useCurrency();
  const [selected, setSelected] = useState<string | null>(null);
  const [move, setMove] = useState<{ ingredient: Ingredient; kind: MoveKind } | null>(null);

  const rows = useMemo(
    () =>
      ingredients
        .filter((i) => i.active !== false)
        .map((ing) => {
          // What was PAID for the stock on hand, layer by layer — not
          // stock_kg * cost_per_kg, which prices the leftovers at what it
          // would cost to replace them and marks up old stock every time a
          // dearer load arrives.
          const valued = ingredientValue(ix, ing.id);
          return {
            ing,
            runway: ingredientRunway(ix, ing.id, windowDays),
            shrink: shrinkFor(ix, ing.id, Math.max(30, windowDays)),
            step: costRunway(ix, ing.id, windowDays),
            layers: valued.layers,
            avgCostPerKg: valued.avgCostPerKg,
            value: valued.value,
          };
        }),
    [ingredients, ix, windowDays],
  );

  const totals = useMemo(
    () => ({
      value: rows.reduce((s, r) => s + r.value, 0),
      negative: rows.filter((r) => (r.ing.stock_kg ?? 0) < 0).length,
      // "Short" is under a week of cover, the horizon a feedlot buys on.
      short: rows.filter((r) => r.runway && r.runway.daysLeft < 7).length,
    }),
    [rows],
  );

  const moves = useMemo(() => {
    if (!selected) return [];
    return (ix.movesByIngredient.get(selected) ?? []).slice().reverse();
  }, [ix, selected]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.ing.id === selected) ?? null,
    [rows, selected],
  );

  function exportCsv() {
    const csv = toCsv(
      [t('Insumo'), 'Categoría', 'MS %', 'Costo/kg promedio', 'Última compra/kg', 'Tolerancia %', 'Stock kg', 'Valor', 'Uso/día kg', 'Días restantes', 'Días al cambio de precio', 'Próximo costo/kg', 'Merma %'],
      rows.map((r) => [
        r.ing.name,
        r.ing.category ?? '',
        r.ing.dm_pct ?? '',
        Math.round(r.avgCostPerKg),
        r.ing.cost_per_kg ?? '',
        r.ing.tol_pct ?? '',
        (r.ing.stock_kg ?? 0).toFixed(1),
        Math.round(r.value),
        r.runway?.perDayKg.toFixed(1) ?? '',
        r.runway?.daysLeft.toFixed(1) ?? '',
        r.step?.daysUntilStep.toFixed(1) ?? '',
        r.step ? Math.round(r.step.nextCostPerKg) : '',
        r.shrink?.pct?.toFixed(2) ?? '',
      ]),
    );
    downloadCsv(`virtus-feed-insumos-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (loading) return <Spinner label={t('Cargando insumos…')} />;
  if (error) return <DataError message={error} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('Valor en stock')} value={formatMoney(totals.value, currency)} hint={t('{v1} insumos activos', { v1: rows.length })} />
        <Stat
          label={t('Por agotarse')}
          value={String(totals.short)}
          hint={t('menos de 7 días de cobertura al ritmo actual')}
        />
        <Stat
          label={t('Saldo negativo')}
          value={String(totals.negative)}
          hint={totals.negative ? t('¿entrega sin registrar?') : t('todo cuadra')}
        />
      </div>

      <Card>
        <CardHeader
          title={t('Insumos')}
          subtitle={t('Consumo y cobertura sobre {v1} días alimentados · toque un insumo para ver su libro', { v1: windowDays })}
          action={
            <Button onClick={exportCsv} disabled={!rows.length}>
              {t('Exportar CSV')}
            </Button>
          }
        />
        {rows.length === 0 ? (
          <EmptyState title={t('Sin insumos')} hint={t('Cargue los insumos en la app y sincronice.')} />
        ) : (
          <TableWrap>
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>{t('Insumo')}</Th>
                  <Th>{t('Categoría')}</Th>
                  <Th right>{t('MS')}</Th>
                  <Th right>{t('Costo/kg')}</Th>
                  <Th right>{t('Tol.')}</Th>
                  <Th right>{t('Stock')}</Th>
                  <Th right>{t('Valor')}</Th>
                  <Th right>{t('Uso/día')}</Th>
                  <Th right>{t('Cobertura')}</Th>
                  <Th right>{t('Merma')}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.ing.id}
                    onClick={() => setSelected(selected === r.ing.id ? null : r.ing.id)}
                    className={cx(
                      'cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40',
                      selected === r.ing.id && 'bg-brand-50/60 dark:bg-brand-900/20',
                    )}
                  >
                    <Td className="font-medium">{r.ing.name}</Td>
                    <Td>{r.ing.category ? t(r.ing.category) : '—'}</Td>
                    <Td right>{r.ing.dm_pct == null ? '—' : `${r.ing.dm_pct}%`}</Td>
                    <Td right>
                      <span
                        title={t('Promedio ponderado de lo que se pagó por el stock en mano. Última compra: {v1}', {
                          v1: formatMoney(r.ing.cost_per_kg, currency),
                        })}
                      >
                        {formatMoney(r.avgCostPerKg, currency)}
                      </span>
                      {r.step && <CostStepHint step={r.step} currency={currency} />}
                    </Td>
                    <Td right>{r.ing.tol_pct ? `${r.ing.tol_pct}%` : '120%'}</Td>
                    <Td right className={cx((r.ing.stock_kg ?? 0) < 0 && 'font-semibold text-red-600 dark:text-red-400')}>
                      {formatWeight(r.ing.stock_kg ?? 0, unit)}
                    </Td>
                    <Td right>{formatMoney(r.value, currency)}</Td>
                    <Td right>{r.runway ? formatWeight(r.runway.perDayKg, unit) : '—'}</Td>
                    <Td right>
                      <Runway days={r.runway?.daysLeft ?? null} />
                    </Td>
                    <Td right>
                      {r.shrink == null ? (
                        <span className="text-slate-400">—</span>
                      ) : r.shrink.counted ? (
                        `${formatNumber(r.shrink.pct, 1)}%`
                      ) : (
                        <span
                          className="text-slate-400"
                          title={t('La merma es libro contra medición física. Alimentar no la mide: hace falta un conteo con el botón Conteo.')}
                        >
                          {t('falta conteo')}
                        </span>
                      )}
                    </Td>
                    <Td right>
                      {/* The row itself opens the ledger, so these must not
                          bubble — a click on "Ingreso" should not also toggle
                          the book open underneath the modal. */}
                      <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button onClick={() => setMove({ ingredient: r.ing, kind: 'receipt' })}>{t('Ingreso')}</Button>
                        <Button onClick={() => setMove({ ingredient: r.ing, kind: 'count' })}>{t('Conteo')}</Button>
                        <Button onClick={() => setMove({ ingredient: r.ing, kind: 'adjust' })}>{t('Ajuste')}</Button>
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {move && (
        <StockMoveModal ingredient={move.ingredient} kind={move.kind} onClose={() => setMove(null)} />
      )}

      {selected && (
        <Card>
          <CardHeader
            title={t('Libro de {v1}', { v1: ix.ingredientById.get(selected)?.name ?? '' })}
            subtitle={t('Ingresos, conteos, ajustes y consumo — el saldo es la suma de estas filas')}
            action={<Button onClick={() => setSelected(null)}>{t('Cerrar')}</Button>}
          />
          <LayerPanel
            layers={selectedRow?.layers ?? []}
            step={selectedRow?.step ?? null}
            avgCostPerKg={selectedRow?.avgCostPerKg ?? 0}
            value={selectedRow?.value ?? 0}
            currency={currency}
            unit={unit}
          />
          {moves.length === 0 ? (
            <EmptyState title={t('Sin movimientos')} hint={t('Este insumo todavía no tiene ingresos ni consumo registrado.')} />
          ) : (
            <TableWrap>
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <Th>{t('Fecha')}</Th>
                    <Th>{t('Tipo')}</Th>
                    <Th right>{t('Movimiento')}</Th>
                    <Th right>{t('Saldo')}</Th>
                    <Th right>{t('Contado')}</Th>
                    <Th right>{t('Costo')}</Th>
                    <Th>{t('Proveedor / nota')}</Th>
                    <Th>{t('Factura')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {moves.slice(0, 200).map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <Td>{formatDateTime(m.at)}</Td>
                      <Td>
                        <Badge tone={m.kind === 'receipt' ? 'good' : m.kind === 'count' ? 'brand' : 'neutral'}>
                          {t(KIND_LABEL[m.kind] ?? m.kind)}
                        </Badge>
                      </Td>
                      <Td right className={cx(m.delta_kg < 0 ? 'text-slate-600 dark:text-slate-300' : 'text-brand-700 dark:text-brand-300')}>
                        {m.delta_kg > 0 ? '+' : ''}
                        {formatWeight(m.delta_kg, unit)}
                      </Td>
                      <Td right>{m.balance_kg == null ? '—' : formatWeight(m.balance_kg, unit)}</Td>
                      <Td right>{m.counted_kg == null ? '—' : formatWeight(m.counted_kg, unit)}</Td>
                      {/* Frozen when the move happened, against the layers it
                          drew from — so a later purchase cannot rewrite it. */}
                      <Td right>
                        <span title={m.unit_cost ? t('{v1} por kg', { v1: formatMoney(m.unit_cost, currency) }) : undefined}>
                          {m.cost == null
                            ? m.kind === 'receipt' && m.total_cost != null
                              ? formatMoney(m.total_cost, currency)
                              : '—'
                            : formatMoney(m.cost, currency)}
                        </span>
                      </Td>
                      <Td>
                        {/* The app stores the feeding id in `note` on a
                            consumption move. Printed raw it is line noise, so
                            resolve it to the batch it fed. */}
                        <MoveNote move={m} />
                      </Td>
                      {/* The paper the figures came from. Only receipts carry
                          one, so every other row is an em dash, not a gap. */}
                      <Td>
                        <InvoicePhoto path={m.photo_path} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * A price change coming down the line, shown next to the price it will replace.
 * Only appears when there is actually a step — one price, or several loads all
 * bought at the same price, is not news.
 */
function CostStepHint({ step, currency }: { step: CostStep; currency: string }) {
  const t = useT();
  const dearer = step.pctChange > 0;
  return (
    <span
      className={cx(
        'mt-0.5 block text-xs tabular-nums whitespace-nowrap',
        dearer ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
      )}
      title={t('Al ritmo actual, en {v1} días pasa a {v2} por kg', {
        v1: formatNumber(step.daysUntilStep, 0),
        v2: formatMoney(step.nextCostPerKg, currency),
      })}
    >
      → {formatMoney(step.nextCostPerKg, currency)} {t('en {v1} d', { v1: formatNumber(step.daysUntilStep, 0) })}
    </span>
  );
}

/**
 * The FIFO layers still on hand: what each load cost, how much of it is left,
 * and what it is worth. This is the answer to "why is the average what it is" —
 * an ingredient does not have a price, it has a stack of loads bought on
 * different days, and feeding draws from the oldest first.
 */
function LayerPanel({
  layers,
  step,
  avgCostPerKg,
  value,
  currency,
  unit,
}: {
  layers: Layer[];
  step: CostStep | null;
  avgCostPerKg: number;
  value: number;
  currency: string;
  unit: 'kg' | 't' | 'lb';
}) {
  const t = useT();
  if (layers.length === 0) return null;

  return (
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {t('Lotes en stock · se consume el más viejo primero')}
      </h3>
      <TableWrap>
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <Th>{t('Comprado')}</Th>
              <Th right>{t('Costo/kg')}</Th>
              <Th right>{t('Queda del lote')}</Th>
              <Th right>{t('De')}</Th>
              <Th right>{t('Valor')}</Th>
            </tr>
          </thead>
          <tbody>
            {layers.map((l, i) => (
              <tr key={l.moveId} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                <Td>
                  {formatDate(l.at)}
                  {/* The layer being drawn from right now — the price the next
                      kilo actually costs. */}
                  {i === 0 && <Badge tone="brand">{t('en uso')}</Badge>}
                  {l.correction && (
                    <Badge tone="neutral">{t('hallado en conteo')}</Badge>
                  )}
                </Td>
                <Td right>{formatMoney(l.costPerKg, currency)}</Td>
                <Td right className="font-medium">{formatWeight(l.remaining, unit)}</Td>
                <Td right className="text-slate-400">{formatWeight(l.kg, unit)}</Td>
                <Td right>{formatMoney(l.remaining * l.costPerKg, currency)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-300 dark:border-slate-700">
              <Td className="font-medium">{t('Promedio ponderado')}</Td>
              <Td right className="font-medium">{formatMoney(avgCostPerKg, currency)}</Td>
              <Td right className="font-medium">
                {formatWeight(layers.reduce((s, l) => s + l.remaining, 0), unit)}
              </Td>
              <Td right>{''}</Td>
              <Td right className="font-medium">{formatMoney(value, currency)}</Td>
            </tr>
          </tfoot>
        </table>
      </TableWrap>

      {step && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          {t('Al ritmo actual quedan {v1} a {v2} por kg — unos {v3} días. Después pasa a {v4} ({v5}).', {
            v1: formatWeight(step.kgAtCurrent, unit),
            v2: formatMoney(step.currentCostPerKg, currency),
            v3: formatNumber(step.daysUntilStep, 0),
            v4: formatMoney(step.nextCostPerKg, currency),
            v5: formatPct(step.pctChange, 1),
          })}
        </p>
      )}
    </div>
  );
}

function Runway({ days }: { days: number | null }) {
  const t = useT();
  if (days == null) return <span className="text-slate-400">—</span>;
  const tone = days < 3 ? 'bad' : days < 7 ? 'warn' : 'neutral';
  return <Badge tone={tone}>{days < 1 ? t('<1 día') : t('{v1} días', { v1: Math.round(days) })}</Badge>;
}

/** Supplier, free note, or — for a consumption row — the batch that ate it. */
function MoveNote({ move }: { move: StockMove }) {
  const t = useT();
  const { ix } = useData();

  if (move.supplier) return <>{move.supplier}</>;

  // A refusal credit stores the vf_feed_returns id. Printed raw it is the same
  // line noise as the feeding id was — say which pen sent it back.
  if (move.kind === 'return' && move.note) {
    const ret = ix.returnById.get(move.note);
    if (ret) {
      return (
        <span className="text-slate-500 dark:text-slate-400">
          {t('Rechazo de {v1} · {v2}', { v1: ret.lot_name ?? '—', v2: formatTime(ret.at) })}
        </span>
      );
    }
    return <span className="text-slate-400">{t('rechazo fuera del ciclo')}</span>;
  }

  if (move.kind === 'feed' && move.note) {
    const feeding = ix.feedingById.get(move.note);
    if (feeding) {
      return (
        <span className="text-slate-500 dark:text-slate-400">
          {t('Mezcla')} {feeding.group_name ?? feeding.ration_name ?? ''} · {formatTime(feeding.started_at)}
        </span>
      );
    }
    // An id with no batch behind it: the feeding was deleted, or belongs to a
    // cycle that is filtered out. Saying so beats printing the raw id.
    return <span className="text-slate-400">{t('mezcla fuera del ciclo')}</span>;
  }

  return <>{move.note ?? '—'}</>;
}
