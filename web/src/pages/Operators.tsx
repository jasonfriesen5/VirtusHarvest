import { useMemo } from 'react';
import { useT } from '../state/PrefsProvider';
import { useData } from '../state/DataProvider';
import { operatorMixStats, operatorPunctuality } from '../lib/analytics';
import type { Punctuality } from '../lib/analytics';
import { downloadCsv, formatDuration, formatNumber, toCsv } from '../lib/format';
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

const DAYS = 30;

/**
 * Two disciplines that only show up across many feedings: arriving inside the
 * delivery window, and letting the mixer run its time.
 *
 * Framing matters here, so the page says it: a drifting feeding time is a
 * husbandry problem first — cattle settle into a routine and eat worse when it
 * moves — and under-mixed feed sorts in the bunk. The names are on the rows
 * because somebody has to be asked about it, not so the table can be a
 * scoreboard.
 */
export default function Operators() {
  const t = useT();
  const { ix, loading, error } = useData();

  const punctuality = useMemo(() => operatorPunctuality(ix, DAYS), [ix]);
  const mixing = useMemo(() => operatorMixStats(ix, DAYS), [ix]);

  const summary = useMemo(() => {
    const total = punctuality.reduce((s, p) => s + p.total, 0);
    const onTime = punctuality.reduce((s, p) => s + p.ontime, 0);
    const late = punctuality.reduce((s, p) => s + p.late, 0);
    const earlyUnloads = mixing.reduce((s, m) => s + m.early, 0);
    const mixed = mixing.reduce((s, m) => s + m.feedings, 0);
    return {
      total,
      onTimePct: total ? (onTime / total) * 100 : null,
      late,
      earlyUnloads,
      earlyUnloadPct: mixed ? (earlyUnloads / mixed) * 100 : null,
    };
  }, [punctuality, mixing]);

  function exportCsv() {
    const csv = toCsv(
      [t('Operador'), 'Entregas', 'Temprano', 'En horario', 'Tarde', '% en horario', 'Prom. minutos tarde', 'Mezclas', 'Descargas anticipadas', '% anticipadas', 'Prom. mezclado (s)'],
      punctuality.map((p) => {
        const m = mixing.find((x) => x.operator === p.operator);
        return [
          p.operator,
          p.total,
          p.early,
          p.ontime,
          p.late,
          p.onTimePct.toFixed(1),
          p.avgLateMin.toFixed(1),
          m?.feedings ?? '',
          m?.early ?? '',
          m ? m.earlyPct.toFixed(1) : '',
          m ? Math.round(m.avgMixSec) : '',
        ];
      }),
    );
    downloadCsv(`virtus-feed-operarios-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  if (loading) return <Spinner label={t('Cargando operarios…')} />;
  if (error) return <DataError message={error} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t('Entregas en horario')}
          value={summary.onTimePct == null ? '—' : `${summary.onTimePct.toFixed(0)}%`}
          hint={summary.total ? t('{v1} entregas con horario definido', { v1: summary.total }) : t('ningún grupo tiene horario')}
        />
        <Stat label={t('Entregas tarde')} value={String(summary.late)} hint={t('últimos {v1} días', { v1: DAYS })} />
        <Stat
          label={t('Descargas antes de terminar la mezcla')}
          value={String(summary.earlyUnloads)}
          hint={summary.earlyUnloadPct == null ? t('ninguna ración tiene tiempo de mezclado') : t('{v1}% de las mezclas', { v1: summary.earlyUnloadPct.toFixed(0) })}
        />
      </div>

      <Card>
        <CardHeader
          title={t('Puntualidad · últimos {v1} días', { v1: DAYS })}
          subtitle={t('El ganado come peor cuando el horario se mueve: esto es manejo antes que control del personal')}
          action={
            <Button onClick={exportCsv} disabled={!punctuality.length}>
              {t('Exportar CSV')}
            </Button>
          }
        />
        {punctuality.length === 0 ? (
          <EmptyState
            title={t('Sin datos de puntualidad')}
            hint={t('Ningún grupo tiene horario de entrega cargado todavía. Póngale uno en Gestión ▸ Grupos y la app empezará a medir cada entrega contra él.')}
          />
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {punctuality.map((p) => (
              <PunctualityCard key={p.operator} p={p} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t('Mezclado · últimos {v1} días', { v1: DAYS })}
          subtitle={t('Descargar antes de tiempo deja el alimento mal mezclado y se separa en el comedero')}
        />
        {mixing.length === 0 ? (
          <EmptyState
            title={t('Sin datos de mezclado')}
            hint={t('Cargue los minutos de mezclado en la ración y la app empezará a cronometrar cada mezcla.')}
          />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>{t('Operador')}</Th>
                  <Th right>{t('Mezclas')}</Th>
                  <Th right>{t('Anticipadas')}</Th>
                  <Th right>{t('% anticipadas')}</Th>
                  <Th right>{t('Mezclado promedio')}</Th>
                </tr>
              </thead>
              <tbody>
                {mixing.map((m) => (
                  <tr key={m.operator} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <Td className="font-medium">{m.operator}</Td>
                    <Td right>{m.feedings}</Td>
                    <Td right>{m.early}</Td>
                    <Td right>
                      {/* One early unload in twenty is a bad day; one in five is
                          a habit. The rate is what separates them. */}
                      <span className={cx(m.earlyPct >= 20 && 'font-semibold text-red-600 dark:text-red-400')}>
                        {m.earlyPct.toFixed(0)}%
                      </span>
                    </Td>
                    <Td right>{formatDuration(m.avgMixSec)}</Td>
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

/**
 * Centre is on time, right is late, left is early — the handle sits at
 * (%late − %early), the same slider the app draws. The three counts are printed
 * underneath on purpose: an operator who is half early and half late nets to
 * dead centre, and without the counts they would read as perfectly punctual
 * when they are never on time.
 */
function PunctualityCard({ p }: { p: Punctuality }) {
  const t = useT();
  const pos = Math.max(-100, Math.min(100, p.position));
  const left = (pos + 100) / 2;
  const verdict = pos > 15 ? 'late' : pos < -15 ? 'early' : 'ontime';

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-900 dark:text-slate-50">{p.operator}</span>
        <Badge tone={verdict === 'late' ? 'bad' : verdict === 'early' ? 'warn' : 'good'}>
          {verdict === 'late'
            ? t('Suele llegar tarde')
            : verdict === 'early'
              ? t('Suele adelantarse')
              : t('En horario')}
        </Badge>
      </div>

      <div className="relative mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-400/70 dark:bg-slate-500" />
        <span
          className={cx(
            'absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-900',
            verdict === 'late' ? 'bg-red-500' : verdict === 'early' ? 'bg-amber-500' : 'bg-brand-500',
          )}
          style={{ left: `${left.toFixed(1)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{t('Temprano')}</span>
        <span>{t('En horario')}</span>
        <span>{t('Tarde')}</span>
      </div>

      {/* One sentence, one key: the counts read as a whole, and Spanish and
          English put the pieces in different orders. */}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t('{v1} temprano · {v2} en horario · {v3} tarde — {v4} entregas', {
          v1: p.early,
          v2: p.ontime,
          v3: p.late,
          v4: p.total,
        })}
        {p.late > 0 && t(' · prom. +{v1} min', { v1: formatNumber(p.avgLateMin, 0) })}
      </p>

      {p.cancelsOut && (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t('Temprano y tarde se compensan — casi nunca en horario.')}
        </p>
      )}
    </div>
  );
}
