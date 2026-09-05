/**
 * Mirrors the live `public` schema of the Supabase project the phone app
 * writes to. Column names are snake_case here on purpose — these are the
 * rows exactly as Postgres returns them, so there is no mapping layer to
 * drift out of sync.
 */

export interface Weighing {
  id: string;
  user_id: string | null;
  worker: string | null;
  farm: string | null;
  /** Truck name, copied from ht_trucks.name at the time of weighing. */
  buggy: string | null;
  crop: string | null;
  /** Field name, copied from ht_fields.name. field_id is the real reference. */
  zone: string | null;
  field_id: string | null;
  season_id: string | null;
  /** Destination name, copied from ht_destinations.name. */
  unload: string | null;
  delivered_to: string | null;
  weight: number | null;
  wet_weight: number | null;
  dry_weight: number | null;
  moisture: number | null;
  unit: string | null;
  notes: string | null;
  timestamp: string | null;
  lat: number | null;
  lng: number | null;
  is_truck_empty: boolean | null;
  auto_detected: boolean | null;
  synced: boolean | null;
  created_at: string | null;
}

export interface Farm {
  id: string;
  user_id: string | null;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  /** Punto de salida on the document, with the official DNIT codes. */
  address: string | null;
  district: string | null;
  department: string | null;
  department_code: string | null;
  district_code: string | null;
  city_code: string | null;
  city_name: string | null;
}

export interface Field {
  id: string;
  user_id: string | null;
  farm_id: string | null;
  name: string;
  area: number | null;
  area_unit: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Truck {
  id: string;
  user_id: string | null;
  name: string;
  plate: string | null;
  driver: string | null;
  capacity: number | null;
  make_model: string | null;
  /** "Camion", "Camioneta" — the tipo on the document; make_model is the marca. */
  vehicle_type: string | null;
  /** The chofer's own documents, printed beside their name. */
  driver_ci: string | null;
  driver_address: string | null;
  /** The hauler. The farm itself when transport is "Propio". */
  transportista_name: string | null;
  transportista_ruc: string | null;
  transportista_address: string | null;
  /** RUC or CI — the document carries one, never both. */
  transportista_document_type: string | null;
  transportista_ruc_dv: string | null;
  transportista_ci: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Cart {
  id: string;
  user_id: string | null;
  name: string;
  serial: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Operator {
  id: string;
  user_id: string | null;
  name: string;
  role: string | null;
  created_at: string | null;
  /** Cédula de identidad — printed on the document as the chofer. */
  ci: string | null;
  address: string | null;
}

export interface Crop {
  id: string;
  user_id: string | null;
  name: string;
  created_at: string | null;
  /** The buyer's product code and description, e.g. PRO-3 / chia. */
  product_code: string | null;
  fiscal_description: string | null;
  fiscal_unit: string | null;
  /** SIFEN unit code — 83 is kilogrammes. */
  fiscal_unit_code: string | null;
  fiscal_unit_description: string | null;
}

export interface Destination {
  id: string;
  user_id: string | null;
  name: string;
  created_at: string | null;
  /** Receptor data for a Nota de Remisión. Only sale destinations need it. */
  ruc: string | null;
  razon_social: string | null;
  address: string | null;
  district: string | null;
  department: string | null;
  requires_remision: boolean;
  department_code: string | null;
  district_code: string | null;
  city_code: string | null;
  city_name: string | null;
}

export interface Season {
  id: string;
  user_id: string | null;
  name: string;
  created_at: string | null;
}

/**
 * The buyer's ticket for one truckload. Keyed on the empty-truck weighing that
 * closed the bundle — the bundle's composition stays derived, so a late-syncing
 * load still lands in the right place and the field total corrects itself.
 */
export interface TruckloadTicket {
  closing_weighing_id: string;
  user_id: string;
  ticket_weight: number | null;
  ticket_unit: string;
  /** The closing empty-truck row was written by the console, not by a driver. */
  manual: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * An override of the derived truckload grouping, stored only for the loads
 * that need one. `closing_weighing_id` names the truckload the load belongs
 * to; null means it was pulled out of its bundle and belongs to none yet.
 */
export interface LoadAssignment {
  weighing_id: string;
  user_id: string;
  closing_weighing_id: string | null;
  updated_at: string | null;
}

export interface BoundaryPoint {
  lat: number;
  lng: number;
}

/**
 * The phone app stores either a flat point array (legacy) or a list of
 * {id, points} objects, so a field can carry more than one drawn boundary.
 * `normalizeBoundary` in lib/boundaries.ts collapses both into one shape.
 */
export interface Boundary {
  field_id: string;
  user_id: string;
  points: unknown;
  updated_at: string | null;
}

/** Every table the console manages, keyed the way the UI refers to them. */
export type EntityKind =
  | 'farms'
  | 'fields'
  | 'crops'
  | 'trucks'
  | 'carts'
  | 'operators'
  | 'seasons'
  | 'destinations';

/** The issuing party. One row per account. */
export interface Emisor {
  user_id: string;
  razon_social: string | null;
  ruc: string | null;
  address: string | null;
  district: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  timbrado: string | null;
  timbrado_valid_until: string | null;
  establecimiento: string | null;
  punto_expedicion: string | null;
  /** SIFEN splits a RUC into its base and verifier digit. */
  ruc_dv: string | null;
  /** Off by default — the feature is Paraguay-only and needs a Fenex account. */
  remision_enabled: boolean;
  fenex_username: string | null;
  fenex_linked_at: string | null;
  updated_at: string | null;
}

export type RemisionStatus = 'draft' | 'sending' | 'issued' | 'failed';

/**
 * A Nota de Remisión Electrónica for one truckload. The número and CDC are
 * assigned by SET via the accredited provider — never generated here.
 */
export interface Remision {
  closing_weighing_id: string;
  user_id: string;
  status: RemisionStatus;
  numero: string | null;
  cdc: string | null;
  timbrado: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  issued_at: string | null;
  error_message: string | null;
  request_payload: unknown;
  response_payload: unknown;
  /**
   * Which issuer this went out under. Recorded on the document rather than
   * looked up later: a profile can be renamed or removed, and the answer to
   * "whose timbrado was used" must never change afterwards.
   */
  issuer_id: string | null;
  issuer_name: string | null;
  fenex_remission_id: string | null;
  fenex_status: string | null;
  pdf_path: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Kilometres from one farm to one buyer. Required on every remisión, and fixed
 * per route — which is why it lives here rather than on the destination: the
 * same silo is a different distance from each farm.
 */
/**
 * Which Fenex customer a destination is, in one issuer's account. Learned from
 * whatever was picked last, the same way Route learns a distance — the same
 * port is a different customer record under each issuer, so it cannot be a
 * single field on the destination.
 */
export interface DestinationCustomer {
  user_id: string;
  destination_id: string;
  issuer_id: string;
  fenex_customer_id: string;
  updated_at: string | null;
}

export interface Route {
  user_id: string;
  farm_id: string;
  destination_id: string;
  distance_km: number | null;
  updated_at: string | null;
}
