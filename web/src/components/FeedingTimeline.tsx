import type { FeedDelivery, FeedLoad, Feeding } from '../lib/types';
import { useT } from '../state/PrefsProvider';
import { formatDuration, formatTime } from '../lib/format';
import { Badge, cx } from './ui';

/**
 * One feeding, start to finish, on a clock.
 *
 * The app stamps four moments as they happen — the load starts, each product
 * is confirmed, the last one starts the mixer, and the feed begins reaching
 * the bunk — and then nothing ever shows them together. Read as a sequence
 * they answer the questions a load sheet cannot: which product held the loader
 * up, whether the mixer really ran its time before the gate opened, and how
 * long the route took once it did.
 *
 * Mixing is measured from the moment the LAST product went in
 * (`mix_started_at`), which is what "mixing time" means on a TMR wagon —
 * anything before that is still loading.
 */

const ms = (a: string | null | undefined, b: string | null | undefined): number | null => {
  if (!a || !b) return null;
  const t = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(t) && t >= 0 ? t : null;
};

export interface Phases {
  loadStart: string | null;
  loadEnd: string | null;
  loadSec: number | null;
  mixStart: string | null;
  mixEnd: string | null;
  mixActualSec: number | null;
  mixRequiredSec: number | null;
  deliveryStart: string | null;
  deliveryEnd: string | null;
  deliverySec: number | null;
  totalSec: number | null;
  unloadedEarly: boolean;
  /** Missing the mix stamp entirely — an older record, or a ration with no timer. */
  untimedMix: boolean;
}

export function feedingPhases(f: Feeding, loads: FeedLoad[], deliveries: FeedDelivery[]): Phases {
  const loadStart = f.load_started_at ?? f.started_at ?? null;
  // The mixer starting IS the load finishing; fall back to the last product's
  // own timestamp for records written before the mix timer existed.
  const lastLoadAt = loads.reduce<string | null>(
    (latest, l) => (l.at && (!latest || new Date(l.at) > new Date(latest)) ? l.at : latest),
    null,
  );
  const loadEnd = f.load_finished_at ?? f.mix_started_at ?? lastLoadAt;

  const firstDeliveryAt = deliveries.reduce<string | null>(
    (first, d) => (d.at && (!first || new Date(d.at) < new Date(first)) ? d.at : first),
    null,
  );
  const lastDeliveryAt = deliveries.reduce<string | null>(
    (last, d) => (d.at && (!last || new Date(d.at) > new Date(last)) ? d.at : last),
    null,
  );

  const deliveryStart = f.delivery_started_at ?? firstDeliveryAt;
  const deliveryEnd = f.finished_at ?? lastDeliveryAt;
  const mixStart = f.mix_started_at;
  // Mixing ends when the gate opens. Guarded against a stamp that lands before
  // the mixer started — a tablet whose clock stepped, or a hand-edited row —
  // because "06:31 → 06:30" reads as a broken page rather than as bad data.
  const mixEndRaw = deliveryStart ?? f.finished_at ?? null;
  const mixEnd = mixStart && mixEndRaw && new Date(mixEndRaw) < new Date(mixStart) ? null : mixEndRaw;

  const measuredMix = ms(mixStart, mixEnd);
  return {
    loadStart,
    loadEnd,
    loadSec: ms(loadStart, loadEnd) != null ? (ms(loadStart, loadEnd) as number) / 1000 : null,
    mixStart,
    mixEnd,
    // The app's own stamp wins: it is taken at the moment of unloading, while
    // a difference of timestamps quietly includes anything that happened after.
    mixActualSec: f.mix_actual_sec ?? (measuredMix != null ? measuredMix / 1000 : null),
    mixRequiredSec: f.mix_required_sec,
    deliveryStart,
    deliveryEnd,
    deliverySec: ms(deliveryStart, deliveryEnd) != null ? (ms(deliveryStart, deliveryEnd) as number) / 1000 : null,
    totalSec: ms(f.started_at, f.finished_at) != null ? (ms(f.started_at, f.finished_at) as number) / 1000 : null,
    unloadedEarly: !!f.unloaded_early,
    untimedMix: !mixStart,
  };
}

function Phase({
  label,
  from,
  to,
  seconds,
  tone = 'neutral',
  detail,
}: {
  label: string;
  from: string | null;
  to: string | null;
  seconds: number | null;
  tone?: 'neutral' | 'brand' | 'warn';
  detail?: string;
}) {
  return (
    <div
      className={cx(
        'rounded-lg border px-3 py-2',
        tone === 'brand'
          ? 'border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/25'
          : tone === 'warn'
            ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50'
            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
      )}
    >
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">
        {seconds == null ? '—' : formatDuration(seconds)}
      </p>
      <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {formatTime(from)} → {formatTime(to)}
      </p>
      {detail && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{detail}</p>}
    </div>
  );
}

/** Proportional strip: loading, mixing, delivering, to scale against each other. */
function PhaseBar({ p }: { p: Phases }) {
  const t = useT();
  const parts = [
    { key: t('carga'), sec: p.loadSec ?? 0, cls: 'bg-brand-400' },
    { key: 'mezclado', sec: p.mixActualSec ?? 0, cls: 'bg-brand-600' },
    { key: t('entrega'), sec: p.deliverySec ?? 0, cls: 'bg-slate-400 dark:bg-slate-500' },
  ];
  const total = parts.reduce((s, x) => s + x.sec, 0);
  if (!total) return null;
  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full">
        {parts.map((x) => (
          <div
            key={x.key}
            className={x.cls}
            style={{ width: `${(x.sec / total) * 100}%` }}
            title={`${x.key}: ${formatDuration(x.sec)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        {parts.map((x) => (
          <span key={x.key} className="flex items-center gap-1">
            <span className={cx('inline-block h-2 w-2 rounded-full', x.cls)} />
            {t(x.key)} {formatDuration(x.sec)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FeedingTimeline({
  feeding,
  loads,
  deliveries,
}: {
  feeding: Feeding;
  loads: FeedLoad[];
  deliveries: FeedDelivery[];
}) {
  const t = useT();
  const p = feedingPhases(feeding, loads, deliveries);

  const mixDetail = p.untimedMix
    ? t('sin cronómetro de mezclado')
    : p.mixRequiredSec
      ? t('pedido {v1}', { v1: formatDuration(p.mixRequiredSec) })
      : t('la ración no fija un tiempo');

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {t('Tiempos de la mezcla')}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Phase label={t('Carga')} from={p.loadStart} to={p.loadEnd} seconds={p.loadSec} detail={t('{v1} productos', { v1: loads.length })} />
        <Phase
          label={t('Mezclado')}
          from={p.mixStart}
          to={p.mixEnd}
          seconds={p.mixActualSec}
          tone={p.unloadedEarly ? 'warn' : 'brand'}
          detail={mixDetail}
        />
        <Phase
          label={t('Entrega')}
          from={p.deliveryStart}
          to={p.deliveryEnd}
          seconds={p.deliverySec}
          detail={t('{v1} corrales', { v1: deliveries.length })}
        />
        <Phase label={t('Total')} from={feeding.started_at} to={feeding.finished_at} seconds={p.totalSec} />
      </div>

      {p.unloadedEarly && (
        <p className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
          <Badge tone="warn">{t('descargó antes')}</Badge>
          {p.mixRequiredSec && p.mixActualSec != null
            ? t('Se abrió la compuerta antes de que terminara el mezclado — faltaban {v1}.', {
                v1: formatDuration(Math.max(0, p.mixRequiredSec - p.mixActualSec)),
              })
            : t('Se abrió la compuerta antes de que terminara el mezclado.')}{' '}
          {t('El alimento mal mezclado se separa en el comedero.')}
        </p>
      )}

      <PhaseBar p={p} />
    </div>
  );
}

/** Minutes from the start of loading to a given product's confirmation, and the
 *  gap since the product before it — which is where a slow bay shows up. */
export function loadGaps(loads: FeedLoad[], loadStart: string | null): (number | null)[] {
  let prev = loadStart;
  return loads.map((l) => {
    const gap = ms(prev, l.at);
    if (l.at) prev = l.at;
    return gap == null ? null : gap / 1000;
  });
}

export function deliveryGaps(deliveries: FeedDelivery[], deliveryStart: string | null): (number | null)[] {
  let prev = deliveryStart;
  return deliveries.map((d) => {
    const gap = ms(prev, d.at);
    if (d.at) prev = d.at;
    return gap == null ? null : gap / 1000;
  });
}
