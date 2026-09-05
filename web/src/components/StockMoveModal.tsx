import { useState } from 'react';
import { useT } from '../state/PrefsProvider';
import { useCurrency, useData } from '../state/DataProvider';
import { useWriter } from '../state/useWriter';
import { Button, ErrorNote, Input, Label, Modal } from './ui';
import { formatMoney, formatWeight } from '../lib/format';
import { adjustStock, countStock, receiveStock } from '../lib/write';
import type { Ingredient } from '../lib/types';

export type MoveKind = 'receipt' | 'count' | 'adjust';

const TITLES: Record<MoveKind, string> = {
  receipt: 'Ingreso de',
  count: 'Conteo físico de',
  adjust: 'Ajuste de',
};

/**
 * The three movements a person enters by hand. Consumption is not one of them:
 * that is written by the app when the mixer is loaded, and letting it be typed
 * here would give one fact two sources.
 *
 * Each kind writes a ledger row and moves the balance with it — the balance is
 * never edited directly, because the gap between the book and a physical count
 * IS the shrink figure.
 */
export function StockMoveModal({
  ingredient,
  kind,
  onClose,
}: {
  ingredient: Ingredient;
  kind: MoveKind;
  onClose: () => void;
}) {
  const t = useT();
  const currency = useCurrency();
  const { stockMoves } = useData();
  const { run } = useWriter();
  const [kg, setKg] = useState('');
  const [cost, setCost] = useState(ingredient.cost_per_kg?.toString() ?? '');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const book = ingredient.stock_kg ?? 0;
  const value = parseFloat(kg);
  const preview =
    !Number.isFinite(value) ? null : kind === 'count' ? value : kind === 'receipt' ? book + value : book + value;
  const countDelta = kind === 'count' && Number.isFinite(value) ? value - book : null;
  const moves = stockMoves.filter((m) => m.ingredient_id === ingredient.id);

  async function save() {
    setBusy(true);
    const err = await run(async (w) => {
      if (kind === 'receipt') {
        await receiveStock(w, ingredient, value, {
          costPerKg: cost === '' ? null : parseFloat(cost),
          supplier: supplier.trim() || null,
          note: note.trim() || null,
        });
      } else if (kind === 'count') {
        // The ledger goes with it: a count that finds less than the book said
        // is shrink, and shrink has a price.
        await countStock(w, ingredient, value, note.trim() || null, moves);
      } else {
        await adjustStock(w, ingredient, value, note.trim() || null, moves);
      }
    }, kind === 'receipt' ? 'Ingreso registrado' : kind === 'count' ? 'Conteo registrado' : 'Ajuste registrado');
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <Modal title={`${TITLES[kind]} ${ingredient.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('Saldo en libro:')} <b>{formatWeight(book, 'kg')}</b>
        </p>

        <div>
          <Label>
            {kind === 'receipt' ? 'Cantidad recibida (kg)' : kind === 'count' ? 'Cantidad contada (kg)' : t('Diferencia (kg, negativa para bajar)')}
          </Label>
          <Input
            type="number"
            step={1}
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            min={kind === 'adjust' ? undefined : 0}
          />
        </div>

        {kind === 'receipt' && (
          <>
            <div>
              <Label>Precio por kg ({currency})</Label>
              <Input type="number" step={1} min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t('El precio es por compra: al guardarlo queda como costo actual del insumo y entra en el costo por cabeza.')}
              </p>
            </div>
            <div>
              <Label>{t('Proveedor')}</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <Label>{t('Nota')}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'count' ? 'conteo mensual' : ''} />
        </div>

        {preview != null && (
          <p className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            {t('Nuevo saldo')} <b>{formatWeight(preview, 'kg')}</b>
            {countDelta != null && (
              <>
                {' '}· diferencia contra el libro{' '}
                <b className={countDelta < 0 ? 'text-amber-700 dark:text-amber-400' : ''}>
                  {countDelta > 0 ? '+' : ''}
                  {formatWeight(countDelta, 'kg')}
                </b>
                {countDelta < 0 && ' — eso es merma y queda registrado como tal.'}
              </>
            )}
            {kind === 'receipt' && cost !== '' && Number.isFinite(value) && (
              <> · costo del ingreso {formatMoney(value * (parseFloat(cost) || 0), currency)}</>
            )}
          </p>
        )}

        {error && <ErrorNote message={error} />}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
