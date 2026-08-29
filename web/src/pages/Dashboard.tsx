import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../state/DataProvider';
import { usePrefs } from '../state/PrefsProvider';
import { useChartTheme } from '../components/chartTheme';
import { Card, CardHeader, EmptyState, ErrorNote, Spinner, Stat } from '../components/ui';
import { formatWeight, weightValue, UNIT_LABEL } from '../lib/units';
import { formatDate } from '../lib/format';
import { filterBySeason, groupBy, isHarvestLoad, totalKg, weightedMoisture } from '../lib/selectors';

/** Longer names get truncated on the axis; the tooltip shows them in full. */
function truncate(label: string, max = 16): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export default function Dashboard() {
  const { weighings, seasons, loading, error } = useData();
  const { unit, seasonId } = usePrefs();
  const theme = useChartTheme();

  const loads = useMemo(
    () => filterBySeason(weighings, seasonId).filter(isHarvestLoad),
    [weighings, seasonId],
  );

  const seasonName = useMemo(
    () => seasons.find((s) => s.id === seasonId)?.name ?? null,
    [seasons, seasonId],
  );

  const kpis = useMemo(() => {
    const kg = totalKg(loads);
    const days = new Set(
      loads
        .map((w) => (w.timestamp ? new Date(w.timestamp).toDateString() : null))
        .filter((d): d is string => d !== null),
    );
    const latest = loads.reduce<string | null>((acc, w) => {
      if (!w.timestamp) return acc;
      return !acc || w.timestamp > acc ? w.timestamp : acc;
    }, null);
    return {
      kg,
      loads: loads.length,
      average: loads.length ? kg / loads.length : 0,
      moisture: weightedMoisture(loads),
      days: days.size,
      latest,
    };
  }, [loads]);

  const byCrop = useMemo(
    () => groupBy(loads, (w) => w.crop).map((g) => ({ ...g, value: weightValue(g.kg, unit) })),
    [loads, unit],
  );

  const byField = useMemo(
    () =>
      groupBy(loads, (w) => w.zone)
        .slice(0, 10)
        .map((g) => ({ ...g, value: weightValue(g.kg, unit) })),
    [loads, unit],
  );

  if (loading) return <Spinner label="Loading your harvest data…" />;
  if (error) return <ErrorNote message={error} />;

  const tooltipStyle = {
    backgroundColor: theme.tooltipBg,
    border: `1px solid ${theme.tooltipBorder}`,
    borderRadius: 8,
    color: theme.tooltipText,
    fontSize: 12,
  };

  const weightTooltip = (v: unknown): [string, string] => [
    `${Number(v).toLocaleString()} ${UNIT_LABEL[unit]}`,
    'Harvested',
  ];

  if (loads.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No harvest records in this view"
          hint={
            seasonId
              ? 'Try switching the season selector to “All seasons”.'
              : 'Records appear here once the mobile app syncs them.'
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total harvested" value={formatWeight(kpis.kg, unit)} hint={`${kpis.loads} loads`} />
        <Stat label="Average load" value={formatWeight(kpis.average, unit)} />
        <Stat
          label="Moisture"
          value={kpis.moisture > 0 ? `${kpis.moisture.toFixed(1)}%` : '—'}
          hint="weighted by load size"
        />
        <Stat label="Harvest days" value={String(kpis.days)} />
        <Stat label="Last load" value={kpis.latest ? formatDate(kpis.latest) : '—'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={`Crops — ${seasonName ?? 'all seasons'}`}
            subtitle={`Total net weight per crop (${UNIT_LABEL[unit]})`}
          />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={Math.max(180, byCrop.length * 34)}>
              <BarChart data={byCrop} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={theme.grid} horizontal={false} />
                <XAxis type="number" tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: theme.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tickFormatter={(v: string) => truncate(v)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: theme.grid, fillOpacity: 0.4 }}
                  formatter={weightTooltip}
                />
                <Bar dataKey="value" fill={theme.series1} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Top fields"
            subtitle={`Total net weight per field (${UNIT_LABEL[unit]})`}
          />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={Math.max(180, byField.length * 34)}>
              <BarChart data={byField} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={theme.grid} horizontal={false} />
                <XAxis type="number" tick={{ fill: theme.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: theme.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tickFormatter={(v: string) => truncate(v)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: theme.grid, fillOpacity: 0.4 }}
                  formatter={weightTooltip}
                />
                <Bar dataKey="value" fill={theme.series1} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
