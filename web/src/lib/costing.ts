import type { Ingredient, StockMove } from './types';

/**
 * FIFO cost layers — the console's copy of the app's engine in
 * `src/js/20-model.js`. Same rules, same results; the app writes the costs at
 * the mixer, this reads them back and values what is still on hand.
 *
 * An ingredient does not have "a price". It has a stack of loads, each bought
 * at what it cost that day, and feeding draws from the oldest first — so the
 * 500 kg left over from a cheap load stays cheap until it is gone.
 *
 * Which layers remain is DERIVED by replaying the ledger, never stored: two
 * devices replaying the same moves get the same answer, so there is nothing to
 * keep in sync and a corrected entry heals itself. What is stored is the
 * resolved cost on each consuming move, written once at the time — a closed
 * period must stay closed.
 */

export interface Layer {
  moveId: string;
  at: string | null;
  costPerKg: number;
  kg: number;
  remaining: number;
  /** Found stock: a correction with no purchase behind it. */
  correction: boolean;
}

export interface Allocation {
  /** Null when no layer was left — fed more than was ever received. */
  moveId: string | null;
  kg: number;
  costPerKg: number;
}

export interface Drawdown {
  unitCost: number;
  cost: number;
  allocation: Allocation[];
  shortfallKg: number;
}

function byTimeThenId(a: StockMove, b: StockMove): number {
  const at = a.at ?? '';
  const bt = b.at ?? '';
  // Ties broken by id so a replay is stable between devices; a tablet syncing
  // a backlog can write several moves in the same millisecond.
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/** Takes `kg` off the front of the stack, mutating it. */
function draw(layers: Layer[], kg: number, fallbackCost: number): Drawdown {
  const allocation: Allocation[] = [];
  let cost = 0;
  let left = kg;

  while (left > 0.0001 && layers.length > 0) {
    const top = layers[0];
    const n = Math.min(top.remaining, left);
    top.remaining -= n;
    left -= n;
    cost += n * top.costPerKg;
    allocation.push({ moveId: top.moveId, kg: n, costPerKg: top.costPerKg });
    if (top.remaining <= 0.0001) layers.shift();
  }

  // More was fed than was ever received. The ledger deliberately allows a
  // negative balance because that discrepancy is the thing worth seeing — so
  // cost the shortfall at the last known price rather than at zero, which
  // would report the feed as free and hide it a second time.
  let shortfallKg = 0;
  if (left > 0.0001) {
    shortfallKg = left;
    cost += left * fallbackCost;
    allocation.push({ moveId: null, kg: left, costPerKg: fallbackCost });
  }

  return { unitCost: kg > 0 ? cost / kg : 0, cost, allocation, shortfallKg };
}

/** Replays the ledger and returns the layers still on hand, oldest first. */
export function stockLayers(moves: StockMove[], ingredient?: Ingredient): Layer[] {
  // Last resort only: an old receipt written before prices were recorded, or a
  // drawdown with nothing left to draw from.
  const fallback = ingredient?.cost_per_kg ?? 0;
  const layers: Layer[] = [];

  for (const m of [...moves].sort(byTimeThenId)) {
    const delta = m.delta_kg ?? 0;

    if (delta > 0) {
      // A receipt with no price is not free — it is unpriced. Carry the most
      // recent known cost forward so it does not deflate the average.
      const costPerKg =
        m.cost_per_kg != null && m.cost_per_kg > 0
          ? m.cost_per_kg
          : layers.length > 0
            ? layers[layers.length - 1].costPerKg
            : fallback;
      layers.push({
        moveId: m.id,
        at: m.at,
        costPerKg,
        kg: delta,
        remaining: delta,
        correction: m.kind === 'count',
      });
    } else if (delta < 0) {
      // Shrink consumes layers exactly like feeding does: the kilos are gone
      // either way, and leaving them in would drift the layers away from the
      // balance they are supposed to explain.
      draw(layers, -delta, layers.length > 0 ? layers[0].costPerKg : fallback);
    }
  }

  return layers;
}

/** What `kg` would cost right now, without recording anything. */
export function costOfDrawdown(
  moves: StockMove[],
  kg: number,
  ingredient?: Ingredient,
): Drawdown {
  const layers = stockLayers(moves, ingredient);
  const fallback = layers.length > 0 ? layers[0].costPerKg : (ingredient?.cost_per_kg ?? 0);
  return draw(layers, kg, fallback);
}

export interface StockValue {
  kg: number;
  value: number;
  /** The weighted average the layers make redundant to store. */
  avgCostPerKg: number;
  layers: Layer[];
}

/**
 * What the stock on hand is actually worth — what was paid for it, not what it
 * would cost to replace.
 */
export function stockValue(moves: StockMove[], ingredient?: Ingredient): StockValue {
  const layers = stockLayers(moves, ingredient);
  let kg = 0;
  let value = 0;
  for (const l of layers) {
    kg += l.remaining;
    value += l.remaining * l.costPerKg;
  }
  return { kg, value, avgCostPerKg: kg > 0 ? value / kg : 0, layers };
}
