import { useMemo, useState } from 'react';
import { useT } from '../state/PrefsProvider';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { useWriter } from '../state/useWriter';
import { Badge, Button, ErrorNote, Input, Label, Modal, cx } from './ui';
import { groupsForLot, rationKgPerHead } from '../lib/analytics';
import { formatNumber, formatWeight } from '../lib/format';
import {
  BUNK_SCALE,
  FACTOR_MAX,
  FACTOR_MIN,
  bunkSuggestion,
  lotFeedFactor,
  recordBunkScore,
  recordWeighIn,
  setLotFeedAdjustment,
} from '../lib/write';
import type { Lot } from '../lib/types';

/**
 * The three writes that belong to a pen rather than to a table: move its feed
 * rate by hand, score its bunk, or record a weigh-in.
 *
 * Manual adjustment and bunk reading both move the same `feed_factor` and both
 * write a row to `vf_bunk_scores` (score null = manual), so a pen's history
 * reads as one story instead of two.
 */

/** What the pen gets per head per day at a given factor, summed across the
 *  groups it belongs to — a pen in two groups eats both. */
function useConsequence(lot: Lot) {
  const { ix } = useData();
  return useMemo(() => {
    const groups = groupsForLot(ix, lot.id);
    const written = groups.reduce((s, g) => s + rationKgPerHead(ix, g.ration_id), 0);
    return { written, head: lot.head_count ?? 0, groups };
  }, [ix, lot]);
}

export function FeedAdjustModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const t = useT();
  const { run } = useWriter();
  const { user } = useAuth();
  const current = lotFeedFactor(lot);
  const [pct, setPct] = useState<number>(Math.round((current - 1) * 1000) / 10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { written, head } = useConsequence(lot);

  const wanted = 1 + pct / 100;
  const clamped = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, wanted));
  const willClamp = Math.abs(clamped - wanted) > 0.0001;
  // A jump of five points or more is worth a second look before saving: it is
  // outside anything the bunk rule would ever suggest in one step.
  const bigJump = Math.abs(clamped - current) * 100 >= 5;

  async function save() {
    setBusy(true);
    const err = await run(
      (w) => setLotFeedAdjustment(w, lot, pct, user?.email ?? ''),
      t('Ajuste guardado'),
    );
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <Modal title={t('Ajustar {v1}', { v1: lot.name })} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label>{t('Ajuste sobre la ración escrita')}</Label>
          <div className="flex items-center gap-2">
            <Button onClick={() => setPct((p) => Math.round((p - 1) * 10) / 10)} className="px-3">−1%</Button>
            <div className="w-28 shrink-0">
              <Input
                type="number"
                step={0.5}
                value={pct}
                onChange={(e) => setPct(parseFloat(e.target.value) || 0)}
                className="text-center"
              />
            </div>
            <Button onClick={() => setPct((p) => Math.round((p + 1) * 10) / 10)} className="px-3">+1%</Button>
            <input
              type="range"
              min={-20}
              max={20}
              step={0.5}
              value={pct}
              onChange={(e) => setPct(parseFloat(e.target.value))}
              className="flex-1 accent-brand-600"
              aria-label={t('Ajuste porcentual')}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('Ración escrita')}</p>
            <p className="tabular-nums">{formatNumber(written, 2)} kg/cab</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('Este corral recibe')}</p>
            <p className="tabular-nums font-medium">{formatNumber(written * clamped, 2)} kg/cab</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('Total del corral')}</p>
            <p className="tabular-nums">{formatWeight(written * clamped * head, 'kg')}</p>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Factor {formatNumber(current, 2)} → <b>{formatNumber(clamped, 2)}</b>. El factor se limita a{' '}
          {FACTOR_MIN.toFixed(2)}–{FACTOR_MAX.toFixed(2)}: subir una ración alta en grano demasiado rápido causa
          acidosis.
        </p>

        {willClamp && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Pidió {pct.toFixed(1)}%, pero el límite del corral deja el factor en {clamped.toFixed(2)}.
          </p>
        )}
        {bigJump && !willClamp && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Es un salto de {Math.abs((clamped - current) * 100).toFixed(1)} puntos de una vez. La lectura de comedero
            nunca mueve tanto en un paso.
          </p>
        )}
        {error && <ErrorNote message={error} />}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Guardando…' : 'Guardar ajuste'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function BunkScoreModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const t = useT();
  const { bunkScores } = useData();
  const { run } = useWriter();
  const { user } = useAuth();
  const [score, setScore] = useState<number | null>(null);
  const [applied, setApplied] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { written, head } = useConsequence(lot);

  const suggestion = score == null ? null : bunkSuggestion(lot, score, bunkScores);
  const appliedPct = applied === '' ? (suggestion?.pct ?? 0) : parseFloat(applied) || 0;
  const factor = lotFeedFactor(lot);
  const nextFactor = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, factor * (1 + appliedPct / 100)));

  async function save() {
    if (score == null) {
      setError('Elija una lectura primero.');
      return;
    }
    setBusy(true);
    const err = await run(
      (w) => recordBunkScore(w, lot, score, applied === '' ? null : appliedPct, bunkScores, user?.email ?? ''),
      t('Lectura registrada'),
    );
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <Modal title={t('Lectura de comedero — {v1}', { v1: lot.name })} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {/* One sentence, one key: splitting it around a <b> made three
              fragments that no translator could reassemble. */}
          {t('Se lee antes de la comida de la mañana, sobre lo que quedó de la descarga anterior.')}
        </p>

        <div className="space-y-1">
          {BUNK_SCALE.map((b) => (
            <button
              key={b.score}
              onClick={() => {
                setScore(b.score);
                setApplied('');
              }}
              className={cx(
                'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                score === b.score
                  ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/30'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60',
              )}
            >
              <span>
                <b className="mr-2">{b.score}</b>
                {t(b.label)}
              </span>
              <Badge tone={b.pct > 0 ? 'good' : b.pct < 0 ? 'warn' : 'neutral'}>
                {b.pct > 0 ? '+' : ''}
                {b.pct}%
              </Badge>
            </button>
          ))}
        </div>

        {suggestion && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">{t('Sugerido')}</span>
              <span className="font-medium tabular-nums">
                {suggestion.pct > 0 ? '+' : ''}
                {suggestion.pct.toFixed(1)}%
              </span>
            </div>
            {suggestion.reason && (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {suggestion.reason}
              </p>
            )}
            <div>
              <Label>Aplicar (puede sobrescribir)</Label>
              <Input
                type="number"
                step={0.5}
                placeholder={suggestion.pct.toFixed(1)}
                value={applied}
                onChange={(e) => setApplied(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Factor {formatNumber(factor, 2)} → <b>{formatNumber(nextFactor, 2)}</b> · el corral pasa a{' '}
              {formatNumber(written * nextFactor, 2)} kg/cab ({formatWeight(written * nextFactor * head, 'kg')} por día).
            </p>
          </div>
        )}

        {error && <ErrorNote message={error} />}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button variant="primary" disabled={busy || score == null} onClick={() => void save()}>
            {busy ? 'Guardando…' : 'Registrar lectura'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function WeighInModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const t = useT();
  const { run } = useWriter();
  const [weight, setWeight] = useState('');
  const [head, setHead] = useState(String(lot.head_count ?? 0));
  const [age, setAge] = useState(lot.avg_age_months?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kg = parseFloat(weight);
  const previous = lot.avg_weight_kg ?? null;

  async function save() {
    if (!(kg > 0)) {
      setError('Escriba el peso promedio por cabeza.');
      return;
    }
    setBusy(true);
    const err = await run(
      (w) => recordWeighIn(w, lot, kg, parseInt(head, 10) || null, age === '' ? null : parseFloat(age)),
      t('Pesada registrada'),
    );
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <Modal title={t('Pesada — {v1}', { v1: lot.name })} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label>{t('Peso promedio por cabeza (kg)')}</Label>
          <Input type="number" step={0.5} min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('Cabezas pesadas')}</Label>
            <Input type="number" step={1} min={0} value={head} onChange={(e) => setHead(e.target.value)} />
          </div>
          <div>
            <Label>Edad promedio (meses)</Label>
            <Input type="number" step={1} min={0} value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
        </div>

        {previous && kg > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Anterior {formatWeight(previous, 'kg')} → {formatWeight(kg, 'kg')} ({kg - previous > 0 ? '+' : ''}
            {formatNumber(kg - previous, 1)} kg). Con dos pesadas la página muestra ganancia diaria y conversión.
          </p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('La pesada es el mejor promedio que tiene el corral, así que también actualiza su peso promedio.')}
        </p>

        {error && <ErrorNote message={error} />}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Guardando…' : t('Registrar pesada')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
