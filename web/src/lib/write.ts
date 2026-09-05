import { supabase } from './supabase';
import { uid } from './ids';
import { costOfDrawdown } from './costing';
import type { BunkScore, Ingredient, Lot, StockMove } from './types';

/**
 * Every write the console makes.
 *
 * The console and the app write to the same tables, so the payloads here are
 * deliberately the same column sets the app's `SYNC_ENTITIES.toCloud` builds
 * (`src/js/09-sync.js`) — no extra columns, no missing ones. Two writers with
 * different ideas of a row's shape is how the two clients start disagreeing.
 *
 * The app's pull is "cloud wins, except rows this device changed and hasn't
 * uploaded yet", so anything written here reaches the tablet on its next sync,
 * including deletions. What the console CANNOT do is change which cycle a
 * tablet has selected — `activeCycleId` is a per-device localStorage pointer,
 * not the `active` column.
 */

export class WriteError extends Error {}

export interface Writer {
  uid: string;
  save: (table: string, row: Record<string, unknown>) => Promise<void>;
  remove: (table: string, id: string) => Promise<void>;
}

export function makeWriter(userId: string): Writer {
  return {
    uid: userId,
    async save(table, row) {
      const { error } = await supabase.from(table).upsert({ ...row, user_id: userId });
      if (error) throw new WriteError(`${table}: ${error.message}`);
    },
    async remove(table, id) {
      // The user_id filter is redundant under RLS and kept anyway: a delete
      // that silently matches nothing is worse than one that errors.
      const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', userId);
      if (error) throw new WriteError(`${table}: ${error.message}`);
    },
  };
}

// ── Column sets, mirroring the app's toCloud maps ────────────────────────────

export const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

export const str = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

export interface CycleInput {
  id?: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  active?: boolean;
}
export const cycleRow = (c: CycleInput) => ({
  id: c.id || uid(),
  name: c.name.trim(),
  start_date: c.start_date || null,
  end_date: c.end_date || null,
  active: c.active !== false,
});

export const ingredientRow = (i: Partial<Ingredient> & { name: string }) => ({
  id: i.id || uid(),
  name: i.name.trim(),
  category: i.category ?? null,
  dm_pct: i.dm_pct ?? 100,
  cost_per_kg: i.cost_per_kg ?? 0,
  currency: i.currency || 'PYG',
  stock_kg: i.stock_kg ?? 0,
  tol_pct: i.tol_pct ?? null,
  active: i.active !== false,
});

export const rationRow = (r: {
  id?: string;
  name: string;
  version?: number | null;
  notes?: string | null;
  mix_minutes?: number | null;
  active?: boolean;
}) => ({
  id: r.id || uid(),
  name: r.name.trim(),
  version: r.version ?? 1,
  notes: r.notes ?? null,
  mix_minutes: r.mix_minutes ?? null,
  active: r.active !== false,
});

export const rationItemRow = (it: {
  id?: string;
  ration_id: string;
  ingredient_id: string;
  kg_per_head?: number | null;
  pct_of_mix?: number | null;
  seq?: number | null;
}) => ({
  id: it.id || uid(),
  ration_id: it.ration_id,
  ingredient_id: it.ingredient_id,
  kg_per_head: it.kg_per_head ?? 0,
  pct_of_mix: it.pct_of_mix ?? null,
  // Load order matters on a real mixer — forage first, minerals last.
  seq: it.seq ?? 0,
});

export const lotRow = (l: Partial<Lot> & { name: string }) => ({
  id: l.id || uid(),
  cycle_id: l.cycle_id ?? null,
  name: l.name.trim(),
  pen_code: l.pen_code ?? null,
  head_count: l.head_count ?? 0,
  category: l.category ?? null,
  entry_date: l.entry_date || null,
  entry_weight_kg: l.entry_weight_kg ?? null,
  target_weight_kg: l.target_weight_kg ?? null,
  // Legacy: groups own the ration now. Carried so the app's older code paths
  // keep reading something sane, never edited from the console.
  ration_id: l.ration_id ?? null,
  meals_per_day: l.meals_per_day ?? 2,
  route_order: l.route_order ?? 0,
  feed_factor: l.feed_factor ?? 1,
  avg_weight_kg: l.avg_weight_kg ?? null,
  avg_age_months: l.avg_age_months ?? null,
  // Mirrors the app's own switch on the pen sheet. Same column, both ways —
  // whoever changes it last wins, and the sync carries it like any other pen
  // field, so there is no separate path to keep in step.
  confirm_head_count: l.confirm_head_count === true,
  active: l.active !== false,
  notes: l.notes ?? null,
});

export const groupRow = (g: {
  id?: string;
  cycle_id?: string | null;
  name: string;
  ration_id?: string | null;
  meals_per_day?: number | null;
  meal_splits?: string | null;
  meal_windows?: string | null;
  route_order?: number | null;
  active?: boolean;
  notes?: string | null;
}) => ({
  id: g.id || uid(),
  cycle_id: g.cycle_id ?? null,
  name: g.name.trim(),
  ration_id: g.ration_id ?? null,
  meals_per_day: g.meals_per_day ?? 2,
  meal_splits: g.meal_splits ?? null,
  meal_windows: g.meal_windows ?? null,
  route_order: g.route_order ?? 0,
  active: g.active !== false,
  notes: g.notes ?? null,
});

export const mixerRow = (m: { id?: string; name: string; capacity_kg?: number | null; serial?: string | null }) => ({
  id: m.id || uid(),
  name: m.name.trim(),
  capacity_kg: m.capacity_kg ?? null,
  serial: m.serial ?? null,
});

export const operatorRow = (o: { id?: string; name: string; role?: string | null; active?: boolean }) => ({
  id: o.id || uid(),
  name: o.name.trim(),
  role: o.role ?? null,
  active: o.active !== false,
});

// ── Feed group membership ────────────────────────────────────────────────────

/** Deleting a group takes its membership rows with it, exactly as
 *  `deleteFeedGroup()` does in the app — orphan rows would keep pens in a
 *  group that no longer exists. */
export async function deleteGroup(
  w: Writer,
  groupId: string,
  memberships: { id: string; group_id: string }[],
): Promise<void> {
  await w.remove('vf_feed_groups', groupId);
  for (const m of memberships.filter((x) => x.group_id === groupId)) {
    await w.remove('vf_lot_groups', m.id);
  }
}

export async function setLotInGroup(
  w: Writer,
  lotId: string,
  groupId: string,
  inGroup: boolean,
  memberships: { id: string; lot_id: string; group_id: string; seq: number | null }[],
): Promise<void> {
  const existing = memberships.find((m) => m.lot_id === lotId && m.group_id === groupId);
  if (inGroup && !existing) {
    const seq = memberships.filter((m) => m.group_id === groupId).length;
    await w.save('vf_lot_groups', { id: uid(), lot_id: lotId, group_id: groupId, seq });
  } else if (!inGroup && existing) {
    await w.remove('vf_lot_groups', existing.id);
  }
}

// ── Stock ledger ─────────────────────────────────────────────────────────────
// Ported from `_logStockMove()`. The balance is NOT clamped at zero: negative
// means feed went out that no receipt explains, and hiding that defeats the
// point of keeping a ledger at all.

async function logStockMove(
  w: Writer,
  ing: Ingredient,
  kind: StockMove['kind'],
  deltaKg: number,
  extra: Partial<StockMove> = {},
  ingredientPatch: Partial<Ingredient> = {},
): Promise<number> {
  const balance = (ing.stock_kg ?? 0) + deltaKg;
  await w.save('vf_stock_moves', {
    id: uid(),
    ingredient_id: ing.id,
    ingredient_name: ing.name, // snapshot: what the record said at the time
    kind,
    delta_kg: deltaKg,
    balance_kg: balance,
    counted_kg: extra.counted_kg ?? null,
    cost_per_kg: extra.cost_per_kg ?? null,
    unit_cost: extra.unit_cost ?? null,
    cost: extra.cost ?? null,
    allocation: extra.allocation ?? null,
    supplier: extra.supplier ?? null,
    note: extra.note ?? null,
    at: new Date().toISOString(),
  });
  await w.save('vf_ingredients', ingredientRow({ ...ing, ...ingredientPatch, stock_kg: balance }));
  return balance;
}

/** A load of feed arrives. Price is per delivery, so this is also where the
 *  ingredient's cost stays current without anyone editing a settings field. */
export async function receiveStock(
  w: Writer,
  ing: Ingredient,
  kg: number,
  opts: { costPerKg?: number | null; supplier?: string | null; note?: string | null } = {},
): Promise<void> {
  if (!(kg > 0)) throw new WriteError('La cantidad recibida debe ser mayor que cero.');
  await logStockMove(
    w,
    ing,
    'receipt',
    kg,
    { cost_per_kg: opts.costPerKg ?? null, supplier: opts.supplier ?? null, note: opts.note ?? null },
    opts.costPerKg && opts.costPerKg > 0 ? { cost_per_kg: opts.costPerKg } : {},
  );
}

/** Somebody measured the bunker. The gap between the book and what is actually
 *  there IS the shrink, so the delta is recorded rather than the balance being
 *  quietly overwritten. */
export async function countStock(
  w: Writer,
  ing: Ingredient,
  countedKg: number,
  note?: string | null,
  /** The ingredient's ledger, needed to price a shortfall against the layers. */
  moves: StockMove[] = [],
): Promise<void> {
  if (countedKg == null || countedKg < 0) throw new WriteError('Un conteo físico no puede ser negativo.');
  const delta = countedKg - (ing.stock_kg ?? 0);
  await logStockMove(w, ing, 'count', delta, {
    counted_kg: countedKg,
    note: note ?? null,
    ...shrinkCost(moves, delta, ing),
  });
}

/**
 * Shrink costs money, and that is the number worth seeing: kilos missing says
 * spillage happened, guaraníes says how much it mattered. Found stock is a
 * correction with no purchase behind it, so it carries no cost.
 *
 * Same rule the app applies at the mixer, so one ledger does not end up with
 * priced shrink from the tablet and unpriced shrink from the desk.
 */
function shrinkCost(moves: StockMove[], deltaKg: number, ing: Ingredient) {
  if (deltaKg >= 0) return {};
  const d = costOfDrawdown(moves, -deltaKg, ing);
  return {
    unit_cost: d.unitCost,
    cost: d.cost,
    // Snake_case on the wire, like every other column. The app maps the same
    // shape in its sync layer, so one JSON shape is stored either way.
    allocation: d.allocation.map((a) => ({
      move_id: a.moveId,
      kg: a.kg,
      cost_per_kg: a.costPerKg,
    })),
  };
}

/** A correction that is not a count and not a receipt: spoilage thrown out, a
 *  bag written off, a typo being undone. */
export async function adjustStock(
  w: Writer,
  ing: Ingredient,
  deltaKg: number,
  note?: string | null,
  moves: StockMove[] = [],
): Promise<void> {
  if (!deltaKg) throw new WriteError('El ajuste no puede ser cero.');
  await logStockMove(w, ing, 'adjust', deltaKg, {
    note: note ?? null,
    ...shrinkCost(moves, deltaKg, ing),
  });
}

// ── Pen feed rate ────────────────────────────────────────────────────────────
// Manual adjustment and bunk reading move the SAME feed_factor and both write
// to vf_bunk_scores (score null = manual), so one ledger answers "why is this
// pen getting what it is". The rails exist because pushing a high-grain ration
// up too fast causes acidosis; they are not UI politeness.

export const FACTOR_MIN = 0.8;
export const FACTOR_MAX = 1.2;
export const MAX_STEP_UP = 4;
export const MAX_STEP_DOWN = 10;

export const BUNK_SCALE: { score: number; label: string; pct: number }[] = [
  { score: 0, label: 'Vacío — lamido hace rato', pct: +4 },
  { score: 1, label: 'Casi vacío — algunas migas', pct: +2 },
  { score: 2, label: 'Capa fina pareja', pct: 0 }, // target
  { score: 3, label: 'Queda alrededor de un cuarto', pct: -3 },
  { score: 4, label: 'Mitad o más, intacto', pct: -8 },
];

export const lotFeedFactor = (lot: Lot | null | undefined): number =>
  typeof lot?.feed_factor === 'number' && lot.feed_factor > 0 ? lot.feed_factor : 1;

export interface Suggestion {
  pct: number;
  factor: number;
  reason: string | null;
  blocked: boolean;
}

/**
 * What the console proposes for a reading, and why. Ported from
 * `bunkSuggestion()` including every rail — the reason string matters: the
 * person should see that the rule held back, not just that nothing happened.
 */
export function bunkSuggestion(lot: Lot, score: number, history: BunkScore[]): Suggestion | null {
  const rule = BUNK_SCALE.find((b) => b.score === score);
  if (!rule) return null;

  let pct = rule.pct;
  const factor = lotFeedFactor(lot);
  let reason: string | null = null;

  const mine = history
    .filter((b) => b.lot_id === lot.id && b.at)
    .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());

  // Reading twice in a day must not double the move.
  const todayKey = new Date().toDateString();
  const already = mine.some(
    (b) => new Date(b.at ?? 0).toDateString() === todayKey && b.applied_pct != null && b.applied_pct !== 0,
  );
  if (already && pct !== 0) {
    return { pct: 0, factor, reason: 'Ya se ajustó hoy', blocked: true };
  }

  // Two increases running is how a pen gets walked into acidosis. Only off a
  // genuinely slick bunk (score 0), which is unambiguous evidence.
  if (pct > 0 && score > 0) {
    const prev = mine.find((b) => b.applied_pct != null);
    if (prev && (prev.applied_pct ?? 0) > 0) {
      pct = 0;
      reason = 'En pausa — ya se subió en la lectura anterior';
    }
  }

  if (pct > MAX_STEP_UP) {
    pct = MAX_STEP_UP;
    reason = 'Limitado a un paso seguro';
  }
  if (pct < -MAX_STEP_DOWN) {
    pct = -MAX_STEP_DOWN;
    reason = 'Limitado a un paso seguro';
  }

  let next = factor * (1 + pct / 100);
  if (next > FACTOR_MAX) {
    next = FACTOR_MAX;
    pct = (next / factor - 1) * 100;
    reason = 'En el límite superior de este corral';
  }
  if (next < FACTOR_MIN) {
    next = FACTOR_MIN;
    pct = (next / factor - 1) * 100;
    reason = 'En el límite inferior de este corral';
  }

  return { pct, factor: next, reason, blocked: false };
}

/** `appliedPct` is what the person confirmed, which may differ from the
 *  suggestion — that difference is exactly what is worth keeping. */
export async function recordBunkScore(
  w: Writer,
  lot: Lot,
  score: number,
  appliedPct: number | null,
  history: BunkScore[],
  operatorName: string,
): Promise<void> {
  const sug = bunkSuggestion(lot, score, history);
  const pct = appliedPct == null ? (sug?.pct ?? 0) : appliedPct;
  const factor = lotFeedFactor(lot);
  const next = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, factor * (1 + pct / 100)));

  await w.save('vf_bunk_scores', {
    id: uid(),
    lot_id: lot.id,
    lot_name: lot.name,
    cycle_id: lot.cycle_id ?? null,
    score,
    suggested_pct: sug ? sug.pct : null,
    applied_pct: pct,
    factor_after: next,
    operator_name: operatorName || null,
    at: new Date().toISOString(),
  });
  if (Math.abs(next - factor) > 0.0001) {
    await w.save('vf_lots', lotRow({ ...lot, feed_factor: next }));
  }
}

/** The manager's direct handle on a pen's rate. Same clamp as the bunk rule —
 *  a manual change is deliberate, but the ceiling exists for the animal, not
 *  for the mechanism. */
export async function setLotFeedAdjustment(
  w: Writer,
  lot: Lot,
  pct: number,
  operatorName: string,
): Promise<{ factor: number; clamped: boolean } | null> {
  const wanted = 1 + pct / 100;
  const next = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, wanted));
  const prev = lotFeedFactor(lot);
  if (Math.abs(next - prev) < 0.0001) return null;

  await w.save('vf_lots', lotRow({ ...lot, feed_factor: next }));
  await w.save('vf_bunk_scores', {
    id: uid(),
    lot_id: lot.id,
    lot_name: lot.name,
    cycle_id: lot.cycle_id ?? null,
    score: null, // null = set by hand
    suggested_pct: null,
    applied_pct: (next / prev - 1) * 100,
    factor_after: next,
    operator_name: operatorName || null,
    at: new Date().toISOString(),
  });
  return { factor: next, clamped: Math.abs(next - wanted) > 0.0001 };
}

/** A weigh-in is the best average the pen has, so it is carried onto the lot —
 *  the same thing `recordWeighIn()` does in the app. */
export async function recordWeighIn(
  w: Writer,
  lot: Lot,
  avgWeightKg: number,
  headCount: number | null,
  avgAgeMonths: number | null,
): Promise<void> {
  if (!(avgWeightKg > 0)) throw new WriteError('El peso promedio debe ser mayor que cero.');
  await w.save('vf_weigh_ins', {
    id: uid(),
    lot_id: lot.id,
    lot_name: lot.name,
    cycle_id: lot.cycle_id ?? null,
    avg_weight_kg: avgWeightKg,
    avg_age_months: avgAgeMonths ?? null,
    head_count: headCount ?? lot.head_count ?? 0,
    at: new Date().toISOString(),
  });
  await w.save(
    'vf_lots',
    lotRow({
      ...lot,
      avg_weight_kg: avgWeightKg,
      avg_age_months: avgAgeMonths ?? lot.avg_age_months ?? null,
      head_count: headCount ?? lot.head_count ?? 0,
    }),
  );
}

/**
 * Meal splits are stored as a comma string ('40,60'). Validated here rather
 * than at read time because `groupSplits()` silently falls back to an even
 * split when the stored value no longer matches the meal count — good
 * behaviour at read time, but it would hide a typo made at write time.
 */
export function validateMealSplits(raw: string, meals: number): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null; // empty means "split evenly", which is valid
  const parts = trimmed.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length !== meals || parts.some((p) => !Number.isFinite(p) || p < 0)) {
    return `Escriba ${meals} números separados por coma, uno por comida (ej. ${meals === 2 ? '40,60' : '30,30,40'}).`;
  }
  const sum = parts.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) return `Los porcentajes suman ${sum}%, deben sumar 100%.`;
  return null;
}

/**
 * Delivery windows, stored as one 'HH:MM-HH:MM' per meal in a comma string.
 *
 * A half-filled pair is rejected rather than stored: `groupWindows()` only
 * recognises a complete pair, so a lone start time would silently mean "no
 * window" while looking on screen like one had been set. Returns the string to
 * store (null when every meal is blank), or an error message.
 */
export function buildMealWindows(pairs: { from: string; to: string }[]): string | null | { error: string } {
  const parts = pairs.map(({ from, to }) => {
    const a = from.trim();
    const b = to.trim();
    if (!a && !b) return '';
    if (!a || !b) return null; // half a window
    return `${a}-${b}`;
  });
  if (parts.some((p) => p === null)) {
    return { error: 'Un horario quedó a medias: complete las dos horas o borre las dos.' };
  }
  const joined = parts as string[];
  return joined.some((p) => p) ? joined.join(',') : null;
}

/**
 * The desktop-owned switch that decides whether the tablet may edit rations at
 * all (`vf_settings.allow_app_ration_edits`). One row per account, keyed by
 * user_id, so this upserts rather than inserting.
 *
 * `updated_at` is sent explicitly: the column default only fires on insert, and
 * a stale timestamp on a switch this consequential is worse than none.
 */
export async function setRationEditsAllowed(w: Writer, allowed: boolean): Promise<void> {
  await w.save('vf_settings', {
    user_id: w.uid,
    allow_app_ration_edits: allowed,
    updated_at: new Date().toISOString(),
  });
}
