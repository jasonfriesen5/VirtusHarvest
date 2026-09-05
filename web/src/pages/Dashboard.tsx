import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCurrency, useData } from '../state/DataProvider';
import { usePrefs, useT } from '../state/PrefsProvider';
import { costOf, deliveryDetail, isOutOfSpec, loadVariance, mixDryMatterFraction, onTimeShare } from '../lib/analytics';
import { convertKg, dayKey, formatMoney, formatNumber, formatWeight } from '../lib/format';
import { Card, CardHeader, EmptyState, Spinner, Stat } from '../components/ui';
import { DataError } from '../components/DataError';
import { tooltipProps, useChartTheme } from '../components/chartTheme';

/**
 * The yard at a glance, over the window chosen in the header.
 *
 * Every figure here is a window average over days ACTUALLY FED, matching the
 * app. The one number a feedlot manager checks first is cost per head per day,
 * so it leads; the one that pays for the app is load accuracy, so it sits
 * beside it.
 */
export default function Dashboard() {
  const t = useT();
  const { ix, loading, error } = useData();
  const { unit, windowDays } = usePrefs();
  const currency = useCurrency();
  const theme = useChartTheme();

  const view = useMemo(() => {
    const since = Date.now() - windowDays * 86_400_000;

    // ── Deliveries in the window, bucketed by local day ──
    interface Day {
      day: string;
      kg: number;
      cost: number;
      dmKg: number;
      /** Head fed that day, counted once per pen however often it was fed. */
      headByPen: Map<string, number>;
    }
    const days = new Map<string, Day>();

    ix.t.deliveries.forEach((d) => {
      if (!d.at || !d.actual_kg) return;
      const t = new Date(d.at).getTime();
      if (t < since) return;
      const detail = deliveryDetail(ix, d);
      if (!detail) return;
      const k = dayKey(d.at);
      const bucket = days.get(k) ?? { day: k, kg: 0, cost: 0, dmKg: 0, headByPen: new Map() };
      bucket.kg += detail.kg;
      bucket.cost += detail.cost;
      // Prefer the DM snapshot taken at unload; fall back to the mix's DM
      // fraction only when an older row predates that column.
      const dm =
        d.dm_kg_per_head != null && d.head_count
          ? d.dm_kg_per_head * d.head_count
          : detail.kg * (mixDryMatterFraction(ix, d.feeding_id) ?? 1);
      bucket.dmKg += dm;
      if (d.lot_id) bucket.headByPen.set(d.lot_id, d.head_count ?? bucket.headByPen.get(d.lot_id) ?? 0);
      days.set(k, bucket);
    });

    const daily = Array.from(days.values())
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => {
        const head = Array.from(d.headByPen.values()).reduce((s, h) => s + h, 0);
        return {
          day: d.day.slice(5), // MM-DD; the year is never in question here
          kg: convertKg(d.kg, unit),
          cost: d.cost,
          costPerHead: head ? d.cost / head : 0,
          dmPerHead: head ? d.dmKg / head : 0,
          head,
        };
      });

    // ── Feedings in the window: accuracy and ingredient use ──
    const feedings = ix.t.feedings.filter((f) => f.started_at && new Date(f.started_at).getTime() >= since);
    let loadRows = 0;
    let offSpecRows = 0;
    const byIngredient = new Map<string, { name: string; kg: number; cost: number; devSum: number; devN: number }>();

    feedings.forEach((f) => {
      loadVariance(ix, f.id).forEach((v) => {
        if (v.actualKg == null) return;
        loadRows++;
        if (isOutOfSpec(v)) offSpecRows++;
        const name = v.name ?? '—';
        const cur = byIngredient.get(name) ?? { name, kg: 0, cost: 0, devSum: 0, devN: 0 };
        cur.kg += v.actualKg;
        if (v.pct != null) {
          cur.devSum += v.pct;
          cur.devN++;
        }
        byIngredient.set(name, cur);
      });
    });

    ix.t.loads.forEach((l) => {
      if (!l.at || new Date(l.at).getTime() < since) return;
      const cur = byIngredient.get(l.ingredient_name ?? '—');
      if (!cur) return;
      cur.cost += (l.actual_kg ?? 0) * (ix.ingredientById.get(l.ingredient_id ?? '')?.cost_per_kg ?? 0);
    });

    const ingredients = Array.from(byIngredient.values())
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 8)
      .map((i) => ({ ...i, kg: convertKg(i.kg, unit), dev: i.devN ? i.devSum / i.devN : 0 }));

    // Kept in kilos: `daily.kg` is already converted for the chart's axis, and
    // formatWeight() converts again.
    const totalKg = Array.from(days.values()).reduce((s, d) => s + d.kg, 0);
    const totalCost = daily.reduce((s, d) => s + d.cost, 0);
    const headDays = daily.reduce((s, d) => s + d.head, 0);
    const dmTotal = daily.reduce((s, d) => s + d.dmPerHead * d.head, 0);
    const mixCost = feedings.reduce((s, f) => s + costOf(ix, f.id), 0);

    return {
      daily,
      ingredients,
      // Punctuality is judged over the same window as everything else on this
      // page, so the tile moves with the selector rather than quoting a fixed
      // 30 days like the Operarios page does.
      onTime: onTimeShare(ix, windowDays),
      totalKg,
      totalCost,
      mixCost,
      feedings: feedings.length,
      daysFed: daily.length,
      costPerHeadDay: headDays ? totalCost / headDays : null,
      dmPerHeadDay: headDays ? dmTotal / headDays : null,
      accuracy: loadRows ? ((loadRows - offSpecRows) / loadRows) * 100 : null,
      offSpecRows,
      headNow: ix.t.lots.filter((l) => l.active !== false).reduce((s, l) => s + (l.head_count ?? 0), 0),
    };
  }, [ix, unit, windowDays]);

  if (loading) return <Spinner label={t('Cargando el panel…')} />;
  if (error) return <DataError message={error} />;

  if (!view.daily.length) {
    return (
      <Card>
        <EmptyState
          title={t('Sin datos en esta ventana')}
          hint={t('Amplíe la ventana en la barra superior, cambie de ciclo, o alimente y sincronice desde la app.')}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label={t('Costo / cab / día')}
          value={formatMoney(view.costPerHeadDay, currency)}
          hint={t('{v1} días con entregas', { v1: view.daysFed })}
        />
        <Stat
          label={t('Consumo MS / cab / día')}
          value={view.dmPerHeadDay == null ? '—' : `${formatNumber(view.dmPerHeadDay, 2)} kg`}
          hint={t('base materia seca')}
        />
        <Stat
          label={t('Entregado')}
          value={formatWeight(view.totalKg, unit)}
          hint={t('{v1} mezclas · {v2}', { v1: view.feedings, v2: formatMoney(view.totalCost, currency) })}
        />
        <Stat
          label={t('Precisión de carga')}
          value={view.accuracy == null ? '—' : `${view.accuracy.toFixed(0)}%`}
          hint={
            view.accuracy == null
              ? t('sin filas de carga')
              : t('{v1} ingredientes fuera de tolerancia', { v1: view.offSpecRows })
          }
        />
        <Stat
          label={t('Entregas en horario')}
          value={view.onTime == null ? '—' : `${view.onTime.pct.toFixed(0)}%`}
          hint={view.onTime == null ? t('ningún grupo tiene horario') : t('{v1} entregas con horario', { v1: view.onTime.total })}
        />
      </div>

      <Card>
        <CardHeader
          title={t('Entregado por día')}
          subtitle={t('Barras: kilos entregados (eje izquierdo). Línea: costo de esos kilos (eje derecho, {v1}).', {
            v1: currency,
          })}
        />
        <div className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={view.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="day" stroke={theme.axis} fontSize={11} tickLine={false} />
              <YAxis yAxisId="kg" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} width={56} />
              <YAxis
                yAxisId="cost"
                orientation="right"
                stroke={theme.axis}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
              />
              <Tooltip
                {...tooltipProps(theme)}
                formatter={(value, name) =>
                  name === t('Costo') ? formatMoney(Number(value), currency) : `${formatNumber(Number(value), 0)} ${unit}`
                }
              />
              {/* A two-axis chart with no legend is a puzzle: a blue line
                  appears with nothing saying what it is, and the tooltip only
                  helps if you happen to hover it. */}
              <Legend
                verticalAlign="top"
                align="right"
                height={24}
                iconType="plainline"
                wrapperStyle={{ fontSize: 11, color: theme.axis }}
              />
              <Bar yAxisId="kg" dataKey="kg" name={t('Entregado ({v1})', { v1: unit })} fill={theme.series1} radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="cost"
                type="monotone"
                dataKey="cost"
                name={t('Costo')}
                stroke={theme.series2}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('Costo y consumo por cabeza')}
            subtitle={t('Costo por cabeza (eje izquierdo, {v1}) y kg de materia seca por cabeza (eje derecho), por día', {
              v1: currency,
            })}
          />
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={view.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="day" stroke={theme.axis} fontSize={11} tickLine={false} />
                <YAxis
                  yAxisId="cost"
                  stroke={theme.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
                />
                <YAxis
                  yAxisId="dm"
                  orientation="right"
                  stroke={theme.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  {...tooltipProps(theme)}
                  formatter={(value, name) =>
                    name === t('Costo/cab') ? formatMoney(Number(value), currency) : `${formatNumber(Number(value), 2)} kg`
                  }
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={24}
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 11, color: theme.axis }}
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="costPerHead"
                  name={t('Costo/cab')}
                  stroke={theme.series2}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="dm"
                  type="monotone"
                  dataKey="dmPerHead"
                  name={t('kg MS/cab')}
                  stroke={theme.series3}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('Insumos más usados')} subtitle={t('Kilos cargados en {v1} días', { v1: windowDays })} />
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={view.ingredients}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid stroke={theme.grid} horizontal={false} />
                <XAxis type="number" stroke={theme.axis} fontSize={11} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={theme.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip
                  {...tooltipProps(theme)}
                  formatter={(value) => `${formatNumber(Number(value), 0)} ${unit}`}
                />
                <Bar dataKey="kg" name={t('Cargado ({v1})', { v1: unit })} radius={[0, 3, 3, 0]}>
                  {view.ingredients.map((i) => (
                    // Coloured by how far that ingredient's loads sat from
                    // target: the point of the chart is spotting the one that
                    // is habitually over-loaded, not ranking silage first.
                    <Cell
                      key={i.name}
                      fill={Math.abs(i.dev) > 10 ? theme.over : Math.abs(i.dev) > 5 ? theme.under : theme.series1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="px-4 pb-4 text-xs text-slate-500 dark:text-slate-400">
            {t('Naranja: más de 10% de desvío promedio contra lo formulado. Amarillo: más de 5%.')}
          </p>
        </Card>
      </div>
    </div>
  );
}
