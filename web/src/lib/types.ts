/**
 * Row shapes exactly as Supabase returns them — snake_case, nullable where the
 * column is. The phone app maps these to camelCase on the way into
 * localStorage; the console reads the tables directly and deliberately does
 * not, so a column name in this file is greppable against the schema.
 */

export interface Cycle {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  active: boolean | null;
}

export interface Lot {
  id: string;
  cycle_id: string | null;
  name: string;
  pen_code: string | null;
  head_count: number | null;
  category: string | null;
  entry_date: string | null;
  entry_weight_kg: number | null;
  target_weight_kg: number | null;
  ration_id: string | null;
  meals_per_day: number | null;
  route_order: number | null;
  /** Bunk reading and manual adjustment both land here. 0.80–1.20. */
  feed_factor: number | null;
  avg_weight_kg: number | null;
  avg_age_months: number | null;
  /**
   * Whether the app stops and asks the operator to confirm this pen's head
   * count before recording an unload. Per pen, and off by default: a prompt on
   * every pen every meal is one that gets tapped through, which records a
   * confirmation nobody actually made.
   */
  confirm_head_count: boolean | null;
  active: boolean | null;
  notes: string | null;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  /** Dry matter %. Silage ~30, grain ~87. Every DM figure leans on this. */
  dm_pct: number | null;
  cost_per_kg: number | null;
  currency: string | null;
  /** Running balance of the vf_stock_moves ledger, not an independent number. */
  stock_kg: number | null;
  /** Per-ingredient overload tolerance: silage 120, mineral 105. */
  tol_pct: number | null;
  active: boolean | null;
}

export interface Ration {
  id: string;
  name: string;
  version: number | null;
  notes: string | null;
  mix_minutes: number | null;
  active: boolean | null;
}

export interface RationItem {
  id: string;
  ration_id: string;
  ingredient_id: string;
  kg_per_head: number | null;
  pct_of_mix: number | null;
  seq: number | null;
}

export interface FeedGroup {
  id: string;
  cycle_id: string | null;
  name: string;
  ration_id: string | null;
  meals_per_day: number | null;
  /** e.g. '40,60' — the uneven AM/PM split. */
  meal_splits: string | null;
  /** One 'HH:MM-HH:MM' per meal, comma separated; blank entries mean untimed. */
  meal_windows: string | null;
  route_order: number | null;
  active: boolean | null;
  notes: string | null;
}

export interface LotGroup {
  id: string;
  lot_id: string;
  group_id: string;
  seq: number | null;
}

export interface Mixer {
  id: string;
  name: string;
  capacity_kg: number | null;
  serial: string | null;
}

export interface Operator {
  id: string;
  name: string;
  role: string | null;
  active: boolean | null;
}

/** One mixer load, start to finish. Harvest's `weighings`. */
export interface Feeding {
  id: string;
  cycle_id: string | null;
  mixer_id: string | null;
  mixer_name: string | null;
  group_id: string | null;
  group_name: string | null;
  ration_id: string | null;
  ration_name: string | null;
  operator_name: string | null;
  meal: string | null;
  meal_index: number | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  load_started_at: string | null;
  load_finished_at: string | null;
  mix_started_at: string | null;
  mix_required_sec: number | null;
  mix_actual_sec: number | null;
  unloaded_early: boolean | null;
  /** When feed actually started reaching the pens — a slow load is a different
   *  problem from a late delivery, so loading time is not judged. */
  delivery_started_at: string | null;
  /** 'early' | 'ontime' | 'late', or null when the group has no window. */
  delivery_status: string | null;
  /** Signed minutes outside the window; 0 when on time. */
  delivery_minutes_off: number | null;
  total_loaded_kg: number | null;
  total_delivered_kg: number | null;
  lat: number | null;
  lng: number | null;
}

/** Ingredients in: target from the ration, actual from the scale. */
export interface FeedLoad {
  id: string;
  feeding_id: string;
  ingredient_id: string | null;
  ingredient_name: string | null;
  target_kg: number | null;
  actual_kg: number | null;
  /**
   * What these kilos cost when they were loaded, resolved against the FIFO
   * layers. Snapshotted like `kg_per_head` on a delivery, and for the same
   * reason: recomputing it later would price the mix at whatever the
   * ingredient costs today and silently rewrite a closed period.
   * Null on rows recorded before cost layers existed.
   */
  unit_cost: number | null;
  cost: number | null;
  seq: number | null;
  at: string | null;
}

/** Feed out, per pen. kg_per_head is snapshotted at unload, never derived. */
export interface FeedDelivery {
  id: string;
  feeding_id: string;
  lot_id: string | null;
  lot_name: string | null;
  head_count: number | null;
  kg_per_head: number | null;
  dm_kg_per_head: number | null;
  target_kg: number | null;
  actual_kg: number | null;
  /**
   * What these kilos cost when they were loaded, resolved against the FIFO
   * layers. Snapshotted like `kg_per_head` on a delivery, and for the same
   * reason: recomputing it later would price the mix at whatever the
   * ingredient costs today and silently rewrite a closed period.
   * Null on rows recorded before cost layers existed.
   */
  unit_cost: number | null;
  cost: number | null;
  seq: number | null;
  at: string | null;
}

/** A bunk scrape: comes off intake, goes back on stock, shrinks the next load. */
export interface FeedReturn {
  id: string;
  batch_id: string | null;
  cycle_id: string | null;
  lot_id: string | null;
  lot_name: string | null;
  group_id: string | null;
  feeding_id: string | null;
  kg: number;
  head_count: number | null;
  operator_name: string | null;
  consumed: boolean | null;
  note: string | null;
  at: string | null;
}

export type StockKind = 'receipt' | 'count' | 'adjust' | 'feed' | 'return';

/** Stock is a ledger; vf_ingredients.stock_kg is only its running balance. */
export interface StockMove {
  id: string;
  ingredient_id: string;
  ingredient_name: string | null;
  kind: StockKind | string;
  delta_kg: number;
  balance_kg: number | null;
  counted_kg: number | null;
  cost_per_kg: number | null;
  /** The invoice total, as printed, when that is how the receipt was entered. */
  total_cost: number | null;
  /** FIFO-resolved cost of the kilos this move consumed. Null on receipts. */
  unit_cost: number | null;
  cost: number | null;
  /** Which receipts the kilos came from. A null move_id means no layer was left. */
  allocation: { move_id: string | null; kg: number; cost_per_kg: number }[] | null;
  supplier: string | null;
  note: string | null;
  /** Path in the private `invoices` bucket: `<user_id>/<move_id>.jpg`. The app
   *  photographs the paper invoice at the receive sheet and uploads it on sync. */
  photo_path: string | null;
  /** Lines from one truck share this, so several products and one invoice can
   *  be read back as the single delivery they were. Null on older rows. */
  delivery_id: string | null;
  at: string | null;
}

export interface WeighIn {
  id: string;
  lot_id: string | null;
  lot_name: string | null;
  cycle_id: string | null;
  avg_weight_kg: number | null;
  avg_age_months: number | null;
  head_count: number | null;
  at: string | null;
}

export interface BunkScore {
  id: string;
  lot_id: string | null;
  lot_name: string | null;
  cycle_id: string | null;
  /** 0 = licked clean … 4 = untouched. null = a manual adjustment. */
  score: number | null;
  suggested_pct: number | null;
  applied_pct: number | null;
  factor_after: number | null;
  operator_name: string | null;
  at: string | null;
}
