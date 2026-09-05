import { stockLayers, stockValue } from './costing';
import type { StockValue } from './costing';
import type {
  BunkScore,
  FeedDelivery,
  FeedGroup,
  FeedLoad,
  FeedReturn,
  Feeding,
  Ingredient,
  Lot,
  LotGroup,
  RationItem,
  StockMove,
  WeighIn,
} from './types';
import { dayKey } from './format';

/**
 * The console recomputes the same figures the phone app shows, from the same
 * rows. The rules are ported from `src/js/20-model.js` deliberately, not
 * re-invented — the two must agree, or the operator and the manager are
 * looking at different numbers for the same day.
 *
 * Three of those rules carry the most weight, and every function below obeys
 * them:
 *   · "per day" means per day ACTUALLY FED, never per day on the calendar.
 *   · intake and conversion are quoted on a DRY MATTER basis; as-fed kilos of
 *     a 32%-DM ration give roughly double the real figure.
 *   · refusals come off intake and back onto stock, or a pen that leaves 10%
 *     every day reads as eating 10% more than it does.
 */

const DAY_MS = 86_400_000;

export interface Tables {
  cycles: unknown[];
  lots: Lot[];
  ingredients: Ingredient[];
  rationItems: RationItem[];
  groups: FeedGroup[];
  lotGroups: LotGroup[];
  feedings: Feeding[];
  loads: FeedLoad[];
  deliveries: FeedDelivery[];
  returns: FeedReturn[];
  stockMoves: StockMove[];
  weighIns: WeighIn[];
  bunkScores: BunkScore[];
}

/** Lookup maps built once per data load; every page reads through these. */
export interface FeedIndex {
  t: Tables;
  feedingById: Map<string, Feeding>;
  lotById: Map<string, Lot>;
  ingredientById: Map<string, Ingredient>;
  loadsByFeeding: Map<string, FeedLoad[]>;
  deliveriesByFeeding: Map<string, FeedDelivery[]>;
  deliveriesByLot: Map<string, FeedDelivery[]>;
  returnsByLot: Map<string, FeedReturn[]>;
  /** By id: a stock credit stores the refusal's id in its note. */
  returnById: Map<string, FeedReturn>;
  movesByIngredient: Map<string, StockMove[]>;
  weighInsByLot: Map<string, WeighIn[]>;
  /** Cost of everything actually loaded, by feeding id. */
  feedingCost: Map<string, number>;
}

function push<K, V>(m: Map<K, V[]>, k: K | null | undefined, v: V): void {
  if (k == null) return;
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

const byTime = (a: { at: string | null }, b: { at: string | null }) =>
  new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime();

export function buildIndex(t: Tables): FeedIndex {
  const feedingById = new Map(t.feedings.map((f) => [f.id, f]));
  const lotById = new Map(t.lots.map((l) => [l.id, l]));
  const ingredientById = new Map(t.ingredients.map((i) => [i.id, i]));

  const loadsByFeeding = new Map<string, FeedLoad[]>();
  t.loads.forEach((l) => push(loadsByFeeding, l.feeding_id, l));

  const deliveriesByFeeding = new Map<string, FeedDelivery[]>();
  const deliveriesByLot = new Map<string, FeedDelivery[]>();
  t.deliveries.forEach((d) => {
    push(deliveriesByFeeding, d.feeding_id, d);
    push(deliveriesByLot, d.lot_id, d);
  });

  const returnsByLot = new Map<string, FeedReturn[]>();
  t.returns.forEach((r) => push(returnsByLot, r.lot_id, r));
  const returnById = new Map(t.returns.map((r) => [r.id, r]));

  const movesByIngredient = new Map<string, StockMove[]>();
  t.stockMoves.forEach((m) => push(movesByIngredient, m.ingredient_id, m));
  movesByIngredient.forEach((rows) => rows.sort(byTime));

  const weighInsByLot = new Map<string, WeighIn[]>();
  t.weighIns.forEach((w) => push(weighInsByLot, w.lot_id, w));
  weighInsByLot.forEach((rows) => rows.sort(byTime));

  // Precomputed because the per-pen cost figures multiply it by every
  // delivery's share, and a feeding can hold a dozen load rows.
  //
  // Read off `l.cost`, which the app froze onto the line against the FIFO
  // layers when the ingredient went into the mixer. Multiplying kilos by the
  // ingredient's CURRENT price is what this used to do, and it meant buying
  // feed today rewrote what last month's mix cost.
  const feedingCost = new Map<string, number>();
  loadsByFeeding.forEach((rows, id) => {
    feedingCost.set(
      id,
      rows.reduce((sum, l) => {
        if (l.cost != null) return sum + l.cost;
        // Recorded before costs were frozen onto the line — the old
        // approximation, kept so historic rows still show something.
        return sum + (l.actual_kg ?? 0) * (ingredientById.get(l.ingredient_id ?? '')?.cost_per_kg ?? 0);
      }, 0),
    );
  });

  return {
    t,
    feedingById,
    lotById,
    ingredientById,
    loadsByFeeding,
    deliveriesByFeeding,
    deliveriesByLot,
    returnsByLot,
    returnById,
    movesByIngredient,
    weighInsByLot,
    feedingCost,
  };
}

export const loadsFor = (ix: FeedIndex, feedingId: string): FeedLoad[] =>
  (ix.loadsByFeeding.get(feedingId) ?? []).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

export const deliveriesFor = (ix: FeedIndex, feedingId: string): FeedDelivery[] =>
  (ix.deliveriesByFeeding.get(feedingId) ?? []).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

export const costOf = (ix: FeedIndex, feedingId: string): number => ix.feedingCost.get(feedingId) ?? 0;

/**
 * Dry-matter fraction of what actually went into the mixer, weighted by the
 * kilos of each ingredient loaded — not by the recipe, which is what the
 * operator was aiming at rather than what they got.
 */
export function mixDryMatterFraction(ix: FeedIndex, feedingId: string): number | null {
  const rows = loadsFor(ix, feedingId).filter((l) => l.actual_kg);
  if (!rows.length) return null;
  let total = 0;
  let dm = 0;
  rows.forEach((l) => {
    const pct = ix.ingredientById.get(l.ingredient_id ?? '')?.dm_pct;
    total += l.actual_kg ?? 0;
    dm += (l.actual_kg ?? 0) * ((pct ?? 100) / 100);
  });
  return total ? dm / total : null;
}

export interface DeliveryDetail {
  id: string;
  at: string | null;
  lotId: string | null;
  lotName: string | null;
  groupName: string | null;
  headCount: number | null;
  kg: number;
  kgPerHead: number | null;
  dmKgPerHead: number | null;
  targetKg: number | null;
  cost: number;
  costPerHead: number | null;
  ration: string | null;
  operator: string | null;
  meal: string | null;
  feedingId: string;
}

/**
 * One delivery, flattened with what it cost and what each animal got. The
 * per-head figures prefer the snapshot written at unload: head counts drift
 * and ingredient DM% gets edited, so recomputing them later would quietly
 * rewrite history.
 */
export function deliveryDetail(ix: FeedIndex, d: FeedDelivery): DeliveryDetail | null {
  const f = ix.feedingById.get(d.feeding_id);
  if (!f) return null;
  const kg = d.actual_kg ?? 0;
  // Share of the mix by kilos delivered. A feeding with no loaded total can
  // still show its kilos — it just cannot attribute a cost to them.
  const share = f.total_loaded_kg ? kg / f.total_loaded_kg : 0;
  const cost = costOf(ix, f.id) * share;
  const head = d.head_count ?? null;

  return {
    id: d.id,
    at: d.at,
    lotId: d.lot_id,
    lotName: d.lot_name,
    groupName: f.group_name,
    headCount: head,
    kg,
    kgPerHead: d.kg_per_head ?? (head ? kg / head : null),
    dmKgPerHead: d.dm_kg_per_head ?? null,
    targetKg: d.target_kg,
    cost,
    costPerHead: head ? cost / head : null,
    ration: f.ration_name,
    operator: f.operator_name,
    meal: f.meal,
    feedingId: f.id,
  };
}

export interface VarianceRow {
  name: string | null;
  targetKg: number;
  actualKg: number | null;
  deltaKg: number | null;
  pct: number | null;
  tolPct: number;
}

const DEFAULT_TOL_PCT = 120;

/** Did the operator actually load the diet? The report that pays for the app. */
export function loadVariance(ix: FeedIndex, feedingId: string): VarianceRow[] {
  return loadsFor(ix, feedingId).map((l) => {
    const target = l.target_kg ?? 0;
    const actual = l.actual_kg;
    return {
      name: l.ingredient_name,
      targetKg: target,
      actualKg: actual,
      deltaKg: actual == null ? null : actual - target,
      pct: actual == null || !target ? null : ((actual - target) / target) * 100,
      // Per ingredient on purpose: +20% of silage is fine, +20% of a mineral
      // premix is an animal-health problem.
      tolPct: ix.ingredientById.get(l.ingredient_id ?? '')?.tol_pct ?? DEFAULT_TOL_PCT,
    };
  });
}

/** True when a load row sits outside its ingredient's tolerance band. */
export function isOutOfSpec(row: VarianceRow): boolean {
  if (row.actualKg == null || !row.targetKg) return false;
  const pct = (row.actualKg / row.targetKg) * 100;
  return pct < 100 - (row.tolPct - 100) || pct > row.tolPct;
}

interface LotWindow {
  rows: FeedDelivery[];
  /** Distinct days actually fed — never the window length. */
  days: number;
}

function lotWindow(ix: FeedIndex, lotId: string, days: number, until = Date.now()): LotWindow {
  const since = until - days * DAY_MS;
  const rows = (ix.deliveriesByLot.get(lotId) ?? []).filter((d) => {
    if (!d.at || !d.actual_kg) return false;
    const t = new Date(d.at).getTime();
    return t >= since && t <= until;
  });
  const keys = new Set(rows.map((d) => dayKey(d.at)));
  return { rows, days: Math.max(1, keys.size) };
}

export function lotReturnedKg(ix: FeedIndex, lotId: string, since?: number): number {
  return (ix.returnsByLot.get(lotId) ?? [])
    .filter((r) => r.at && (!since || new Date(r.at).getTime() >= since))
    .reduce((s, r) => s + (r.kg ?? 0), 0);
}

/** The number that gets a rancher's attention. */
export function costPerHeadPerDay(ix: FeedIndex, lotId: string, days = 7): number | null {
  const w = lotWindow(ix, lotId, days);
  if (!w.rows.length) return null;

  let head = 0;
  let cost = 0;
  w.rows.forEach((d) => {
    head = d.head_count || head;
    const f = ix.feedingById.get(d.feeding_id);
    if (!f?.total_loaded_kg) return;
    cost += costOf(ix, f.id) * ((d.actual_kg ?? 0) / f.total_loaded_kg);
  });
  if (!head) return null;
  return cost / head / w.days;
}

export interface Intake {
  /** kg as fed, per head per day, net of refusals. */
  asFed: number;
  /** kg dry matter, per head per day. The basis the industry quotes. */
  dm: number;
  refusedKg: number;
  headCount: number;
  daysFed: number;
}

export function intakePerHead(ix: FeedIndex, lotId: string, days = 7): Intake | null {
  const w = lotWindow(ix, lotId, days);
  if (!w.rows.length) return null;

  let head = 0;
  let asFed = 0;
  let dm = 0;
  const refused = lotReturnedKg(ix, lotId, Date.now() - days * DAY_MS);

  w.rows.forEach((d) => {
    head = d.head_count || head;
    asFed += d.actual_kg ?? 0;
    const f = ix.feedingById.get(d.feeding_id);
    if (!f?.total_loaded_kg) return;
    const share = (d.actual_kg ?? 0) / f.total_loaded_kg;
    loadsFor(ix, f.id).forEach((l) => {
      const pct = ix.ingredientById.get(l.ingredient_id ?? '')?.dm_pct;
      dm += (l.actual_kg ?? 0) * share * ((pct ?? 100) / 100);
    });
  });
  if (!head) return null;

  // Refused feed carries its dry matter back with it, so scale DM by the same
  // proportion rather than only zeroing it at the extreme.
  const net = Math.max(0, asFed - refused);
  if (asFed > 0) dm *= net / asFed;

  return { asFed: net / head / w.days, dm: dm / head / w.days, refusedKg: refused, headCount: head, daysFed: w.days };
}

/** Dry-matter intake as a percentage of bodyweight — 2.0–2.5% is normal. */
export function intakePctOfBodyweight(intake: Intake | null, avgWeightKg: number | null | undefined): number | null {
  if (!intake || !avgWeightKg) return null;
  return (intake.dm / avgWeightKg) * 100;
}

export interface Runway {
  perDayKg: number;
  stockKg: number;
  daysLeft: number;
}

/**
 * "Silage runs out in 11 days." Reads the stock ledger rather than the feed
 * rows — both record the same consumption, and two sources of truth for one
 * fact is how they drift apart. Divides by days actually fed: averaging one
 * day's use over seven would claim seven times the runway that exists, which
 * is the one direction this number must never be wrong in.
 */
export function ingredientRunway(ix: FeedIndex, ingredientId: string, days = 7): Runway | null {
  const since = Date.now() - days * DAY_MS;
  const rows = (ix.movesByIngredient.get(ingredientId) ?? []).filter(
    (m) => m.kind === 'feed' && m.at && new Date(m.at).getTime() >= since,
  );
  if (!rows.length) return null;

  const usedDays = Math.max(1, new Set(rows.map((m) => dayKey(m.at))).size);
  const used = rows.reduce((s, m) => s + Math.abs(m.delta_kg), 0);
  const perDay = used / usedDays;
  const ing = ix.ingredientById.get(ingredientId);
  if (!ing || !perDay) return null;
  return { perDayKg: perDay, stockKg: ing.stock_kg ?? 0, daysLeft: (ing.stock_kg ?? 0) / perDay };
}

/**
 * What the stock on hand is actually worth, and what its blended price is.
 *
 * Not `stock_kg * cost_per_kg`: that prices leftover stock at what it would
 * cost to REPLACE rather than what was paid for it, so a 10% price rise on a
 * new load silently marks up the old load still sitting in the shed.
 */
export function ingredientValue(ix: FeedIndex, ingredientId: string): StockValue {
  return stockValue(ix.movesByIngredient.get(ingredientId) ?? [], ix.ingredientById.get(ingredientId));
}

export interface CostStep {
  /** Days of feeding left before the price being drawn now changes. */
  daysUntilStep: number;
  /** Kilos still available at the current price. */
  kgAtCurrent: number;
  currentCostPerKg: number;
  nextCostPerKg: number;
  /** Signed change, so the sign says cheaper or dearer. */
  pctChange: number;
}

/**
 * "The cheap corn lasts six more days, then you are paying 10% more."
 *
 * Only FIFO layers can answer this — a single average price has no next step
 * to move to. Measures to the first layer that is priced DIFFERENTLY, not
 * simply the next layer: two loads bought at the same price are one price as
 * far as the person deciding when to buy is concerned.
 */
export function costRunway(ix: FeedIndex, ingredientId: string, days = 7): CostStep | null {
  const runway = ingredientRunway(ix, ingredientId, days);
  if (!runway || runway.perDayKg <= 0) return null;

  const layers = stockLayers(
    ix.movesByIngredient.get(ingredientId) ?? [],
    ix.ingredientById.get(ingredientId),
  );
  if (layers.length < 2) return null;

  const current = layers[0].costPerKg;
  let kgAtCurrent = 0;
  for (const layer of layers) {
    if (Math.abs(layer.costPerKg - current) > 0.0001) {
      return {
        daysUntilStep: kgAtCurrent / runway.perDayKg,
        kgAtCurrent,
        currentCostPerKg: current,
        nextCostPerKg: layer.costPerKg,
        pctChange: current > 0 ? ((layer.costPerKg - current) / current) * 100 : 0,
      };
    }
    kgAtCurrent += layer.remaining;
  }
  // Every layer is the same price: nothing changes, so there is no step.
  return null;
}

export interface Shrink {
  received: number;
  fed: number;
  lostKg: number | null;
  pct: number | null;
  /** False means no physical count in the window, so shrink is unknown. */
  counted: boolean;
}

export function shrinkFor(ix: FeedIndex, ingredientId: string, days = 30): Shrink | null {
  const since = Date.now() - days * DAY_MS;
  const moves = (ix.movesByIngredient.get(ingredientId) ?? []).filter(
    (m) => m.at && new Date(m.at).getTime() >= since,
  );
  if (!moves.length) return null;

  let received = 0;
  let fed = 0;
  let lost = 0;
  let counts = 0;
  moves.forEach((m) => {
    if (m.kind === 'receipt') received += m.delta_kg;
    else if (m.kind === 'feed') fed += -m.delta_kg;
    else if (m.kind === 'count') {
      counts++;
      if (m.delta_kg < 0) lost += -m.delta_kg;
    } else if (m.kind === 'adjust' && m.delta_kg < 0) lost += -m.delta_kg;
  });

  // An unmeasured figure must read as unknown, not as zero.
  if (!counts) return { received, fed, lostKg: null, pct: null, counted: false };
  const throughput = received + fed;
  return { received, fed, lostKg: lost, pct: throughput > 0 ? (lost / throughput) * 100 : null, counted: true };
}

export interface LotGain {
  days: number;
  gainPerHead: number;
  /** kg/head/day. */
  adg: number;
  feedPerHead: number;
  dmPerHead: number;
  /** Feed conversion on a DM basis — the figure the industry quotes. */
  conversion: number | null;
  conversionAsFed: number | null;
  headCount: number;
}

/** Average daily gain between the first and last weigh-in, and the conversion
 *  that falls out of it. Needs two weigh-ins; one is a starting point. */
export function lotGain(ix: FeedIndex, lotId: string): LotGain | null {
  const mine = (ix.weighInsByLot.get(lotId) ?? []).filter((w) => w.avg_weight_kg);
  if (mine.length < 2) return null;

  const first = mine[0];
  const last = mine[mine.length - 1];
  const days = (new Date(last.at ?? 0).getTime() - new Date(first.at ?? 0).getTime()) / DAY_MS;
  if (days <= 0) return null;

  const gainPerHead = (last.avg_weight_kg ?? 0) - (first.avg_weight_kg ?? 0);
  const since = new Date(first.at ?? 0).getTime();
  const until = new Date(last.at ?? 0).getTime();

  let fed = 0;
  let fedDm = 0;
  (ix.deliveriesByLot.get(lotId) ?? []).forEach((d) => {
    if (!d.at || !d.actual_kg) return;
    const t = new Date(d.at).getTime();
    if (t < since || t > until) return;
    const perHead = d.kg_per_head ?? (d.head_count ? d.actual_kg / d.head_count : 0);
    fed += perHead;
    fedDm += d.dm_kg_per_head ?? perHead;
  });

  return {
    days,
    gainPerHead,
    adg: gainPerHead / days,
    feedPerHead: fed,
    dmPerHead: fedDm,
    conversion: gainPerHead > 0 ? fedDm / gainPerHead : null,
    conversionAsFed: gainPerHead > 0 ? fed / gainPerHead : null,
    headCount: last.head_count ?? first.head_count ?? 0,
  };
}

/** What the ration prescribes per head per DAY, before any pen adjustment. */
export function rationKgPerHead(ix: FeedIndex, rationId: string | null | undefined): number {
  if (!rationId) return 0;
  return ix.t.rationItems
    .filter((it) => it.ration_id === rationId)
    .reduce((s, it) => s + (it.kg_per_head ?? 0), 0);
}

/** Groups a pen belongs to. A pen's intake is the SUM across its groups. */
export function groupsForLot(ix: FeedIndex, lotId: string): FeedGroup[] {
  const ids = new Set(ix.t.lotGroups.filter((lg) => lg.lot_id === lotId).map((lg) => lg.group_id));
  return ix.t.groups.filter((g) => ids.has(g.id));
}

/** Always N shares summing to 100; falls back to even when the stored split no
 *  longer matches the meal count. */
export function groupSplits(group: FeedGroup): number[] {
  const meals = group.meals_per_day && group.meals_per_day > 0 ? Math.round(group.meals_per_day) : 1;
  const even = () => Array.from({ length: meals }, () => 100 / meals);
  const parts = String(group.meal_splits ?? '')
    .split(',')
    .map((x) => parseFloat(x))
    .filter((x) => !Number.isNaN(x) && x >= 0);
  if (parts.length !== meals) return even();
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum <= 0) return even();
  return parts.map((p) => (p / sum) * 100);
}

/** Latest bunk reading or manual adjustment for a pen — the ledger that
 *  answers "why is this pen getting what it is". */
export function latestBunkScore(ix: FeedIndex, lotId: string): BunkScore | null {
  const rows = ix.t.bunkScores.filter((b) => b.lot_id === lotId && b.at);
  if (!rows.length) return null;
  return rows.reduce((a, b) => (new Date(b.at ?? 0) > new Date(a.at ?? 0) ? b : a));
}

export const BUNK_LABELS: Record<number, string> = {
  0: 'Vacío / lamido',
  1: 'Restos dispersos',
  2: 'Capa fina',
  3: 'Capa gruesa',
  4: 'Intacto',
};

// ══════════════════════════════════════════════════════════════════
//  DELIVERY WINDOWS AND PUNCTUALITY
//  When each feeding of a group should reach the bunk. Cattle settle into a
//  routine and eat worse when feeding time drifts, so this is a husbandry
//  measure before it is anything about the operator — the console says so in
//  as many words, because a punctuality table invites being read the other way.
//  Ported from `20-model.js`.
// ══════════════════════════════════════════════════════════════════

export interface MealWindow {
  /** Minutes past midnight. */
  from: number;
  to: number;
  text: string;
}

/** One window per meal, or a null where none is set. */
export function groupWindows(group: Pick<FeedGroup, 'meals_per_day' | 'meal_windows'>): (MealWindow | null)[] {
  const meals = group.meals_per_day && group.meals_per_day > 0 ? Math.round(group.meals_per_day) : 1;
  const parts = String(group.meal_windows ?? '').split(',');
  const out: (MealWindow | null)[] = [];
  for (let i = 0; i < meals; i++) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(parts[i] ?? '');
    out.push(m ? { from: +m[1] * 60 + +m[2], to: +m[3] * 60 + +m[4], text: (parts[i] ?? '').trim() } : null);
  }
  return out;
}

export function fmtMinutesOfDay(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface DeliveryTiming {
  status: 'early' | 'ontime' | 'late';
  /** Signed minutes outside the window. */
  minutesOff: number;
  window: MealWindow;
}

/** Classify a delivery against its window. Returns null for an untimed group —
 *  no window means nothing to judge, which is not the same as "on time". */
export function classifyDelivery(
  group: Pick<FeedGroup, 'meals_per_day' | 'meal_windows'>,
  mealIndex: number | null,
  when: Date,
): DeliveryTiming | null {
  const w = groupWindows(group)[Math.max(0, (mealIndex || 1) - 1)];
  if (!w) return null;

  const t = when.getHours() * 60 + when.getMinutes();
  // A window that wraps midnight (22:00–02:00) would otherwise mark every
  // delivery late. Shift into the same frame before comparing.
  let { from, to } = w;
  let tt = t;
  if (to < from) {
    to += 1440;
    if (tt < from) tt += 1440;
  }

  if (tt < from) return { status: 'early', minutesOff: tt - from, window: w };
  if (tt > to) return { status: 'late', minutesOff: tt - to, window: w };
  return { status: 'ontime', minutesOff: 0, window: w };
}

/** A feeding that was never finished is not anybody's timing record. */
const judged = (f: Feeding, since: number): boolean =>
  f.status !== 'abandoned' && !(since && f.started_at && new Date(f.started_at).getTime() < since);

export interface Punctuality {
  operator: string;
  total: number;
  early: number;
  ontime: number;
  late: number;
  lateMinutes: number;
  earlyPct: number;
  onTimePct: number;
  latePct: number;
  /** −100 (always early) → 0 (on time) → +100 (always late). Drives the slider. */
  position: number;
  avgLateMin: number;
  /** True when early and late cancel out — the case `position` alone hides. */
  cancelsOut: boolean;
}

/**
 * CAVEAT carried over from the app: an operator who is half early and half late
 * nets to 0 and reads as perfectly punctual. The three counts are returned
 * alongside precisely so the UI can show that case rather than hide it, and
 * `cancelsOut` flags it outright.
 */
export function operatorPunctuality(ix: FeedIndex, days = 30): Punctuality[] {
  const since = days ? Date.now() - days * DAY_MS : 0;
  const by = new Map<string, Punctuality>();

  ix.t.feedings.forEach((f) => {
    if (!f.delivery_status) return; // group had no window
    if (!judged(f, since)) return;

    const name = f.operator_name || 'Sin nombre';
    const s =
      by.get(name) ??
      ({ operator: name, total: 0, early: 0, ontime: 0, late: 0, lateMinutes: 0,
         earlyPct: 0, onTimePct: 0, latePct: 0, position: 0, avgLateMin: 0, cancelsOut: false } as Punctuality);
    s.total++;
    if (f.delivery_status === 'early') s.early++;
    else if (f.delivery_status === 'late') {
      s.late++;
      s.lateMinutes += f.delivery_minutes_off ?? 0;
    } else s.ontime++;
    by.set(name, s);
  });

  return Array.from(by.values())
    .map((s) => {
      s.latePct = s.total ? (s.late / s.total) * 100 : 0;
      s.earlyPct = s.total ? (s.early / s.total) * 100 : 0;
      s.onTimePct = s.total ? (s.ontime / s.total) * 100 : 0;
      s.position = s.latePct - s.earlyPct;
      s.avgLateMin = s.late ? s.lateMinutes / s.late : 0;
      s.cancelsOut = s.early > 0 && s.late > 0 && Math.abs(s.position) < 15;
      return s;
    })
    .sort((a, b) => b.position - a.position);
}

export interface MixStats {
  operator: string;
  feedings: number;
  /** Unloaded before the mixer had run its time. */
  early: number;
  earlyPct: number;
  avgMixSec: number;
}

/** How often each operator unloaded before the mix finished. Reported as a rate
 *  as well as a count — three early unloads out of four is a different story
 *  from three out of two hundred. */
export function operatorMixStats(ix: FeedIndex, days = 30): MixStats[] {
  const since = days ? Date.now() - days * DAY_MS : 0;
  const by = new Map<string, MixStats & { totalMixSec: number }>();

  ix.t.feedings.forEach((f) => {
    if (!f.mix_required_sec) return; // ration had no timer
    if (!judged(f, since)) return;

    const name = f.operator_name || 'Sin nombre';
    const s = by.get(name) ?? { operator: name, feedings: 0, early: 0, earlyPct: 0, avgMixSec: 0, totalMixSec: 0 };
    s.feedings++;
    if (f.unloaded_early) s.early++;
    s.totalMixSec += f.mix_actual_sec ?? 0;
    by.set(name, s);
  });

  return Array.from(by.values())
    .map((s) => ({
      operator: s.operator,
      feedings: s.feedings,
      early: s.early,
      earlyPct: s.feedings ? (s.early / s.feedings) * 100 : 0,
      avgMixSec: s.feedings ? s.totalMixSec / s.feedings : 0,
    }))
    .sort((a, b) => b.earlyPct - a.earlyPct);
}

/** Yard-wide on-time share, for the dashboard tile. Null when no group has a
 *  window set, because "no windows" must not read as "nothing is on time". */
export function onTimeShare(ix: FeedIndex, days = 30): { pct: number; total: number } | null {
  const since = days ? Date.now() - days * DAY_MS : 0;
  const rows = ix.t.feedings.filter((f) => f.delivery_status && judged(f, since));
  if (!rows.length) return null;
  const on = rows.filter((f) => f.delivery_status === 'ontime').length;
  return { pct: (on / rows.length) * 100, total: rows.length };
}
