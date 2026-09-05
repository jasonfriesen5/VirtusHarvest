import { supabase } from './supabase';
import type { FenexRequest } from './fenexPayload';
// DEMO — remove this import and every isDemo() branch below before launch.
import {
  demoCities,
  demoCreate,
  demoCustomers,
  demoDepartments,
  demoDistricts,
  demoIssuers,
  demoPdfDataUrl,
  demoProducts,
  demoStatus,
  isDemo,
} from './fenexDemo';

/**
 * Every call to Fenex goes through the `fenex` Edge Function, never straight
 * from the browser. The Fenex token stays server-side; this module only ever
 * sees the results.
 */

export interface FenexLinkStatus {
  linked: boolean;
  id?: string | null;
  label?: string | null;
  is_default?: boolean | null;
  fenex_email?: string | null;
  account_id?: string | null;
  subscription_status?: string | null;
  paid_until?: string | null;
  linked_at?: string | null;
}

/**
 * One issuer an account can file under: a Fenex login plus the details that
 * name them as the hauler when they carry their own grain.
 *
 * Fenex reads who issued a document from the token, so an issuer IS a Fenex
 * login — there is no way to file under a name whose credentials you do not
 * hold, which is the correct behaviour for a document tied to a timbrado.
 */
export interface Issuer {
  id: string;
  label: string | null;
  fenex_email: string | null;
  account_id: string | null;
  subscription_status: string | null;
  paid_until: string | null;
  linked_at: string | null;
  is_default: boolean;
  /** The transportista block, used when no third-party hauler is on the truck. */
  razon_social: string | null;
  ruc: string | null;
  ruc_dv: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface GeoOption {
  departmentCode?: string | number;
  districtCode?: string | number;
  cityCode?: string | number;
  code?: string | number;
  name?: string;
  description?: string;
}

export interface FenexCustomer {
  id: string;
  name?: string;
  legalName?: string;
  ruc?: string;
  dv?: string;
  address?: string;
  [k: string]: unknown;
}

/**
 * A product in an issuer's Fenex catalogue. `productCode` on a document is the
 * buyer's own code, not a national one — which is why the list comes from
 * Fenex rather than from a table we maintain.
 */
export interface FenexProduct {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  unitCode?: string | number;
  unitDescription?: string;
  [k: string]: unknown;
}

export interface FenexRemissionResult {
  id: string;
  remissionNumber: string | null;
  cdc: string | null;
  status: string;
  issuedAt: string | null;
  [k: string]: unknown;
}

class FenexError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = 'FenexError';
  }
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('fenex', {
    body: { action, ...body },
  });

  if (error) {
    // The function returns a readable message in the body even on failure;
    // surface that rather than the generic "Edge Function returned a non-2xx".
    const detail = (data as { error?: string; detail?: unknown } | null) ?? null;
    throw new FenexError(detail?.error ?? error.message, detail?.detail);
  }

  const payload = data as { error?: string; detail?: unknown };
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    throw new FenexError(payload.error, payload.detail);
  }
  return data as T;
}

/**
 * Exchanges the password for a token once; the password is never stored.
 * Re-linking an issuer that already exists refreshes its token in place.
 */
export const linkFenex = (email: string, password: string, label?: string) =>
  call<FenexLinkStatus>('link', { email, password, label });

export const unlinkFenex = (issuerId: string) =>
  call<{ linked: boolean }>('unlink', { issuerId });

export const fenexStatus = (issuerId?: string | null) =>
  isDemo() ? demoStatus() : call<FenexLinkStatus>('status', { issuerId });

export const fenexIssuers = () =>
  isDemo() ? demoIssuers() : call<{ issuers: Issuer[] }>('issuers').then((r) => r.issuers);

/** Saves the label and transportista details. Never touches the token. */
export const saveIssuer = (issuerId: string, patch: Partial<Issuer>) =>
  call<{ issuers: Issuer[] }>('saveIssuer', { issuerId, ...patch }).then((r) => r.issuers);

export const setDefaultIssuer = (issuerId: string) =>
  call<{ issuers: Issuer[] }>('setDefaultIssuer', { issuerId }).then((r) => r.issuers);

// Geography and customers are read through a specific issuer's Fenex session:
// two issuers are two accounts, and their customer lists are not the same.
export const fenexDepartments = (issuerId?: string | null) =>
  isDemo() ? demoDepartments() : call<GeoOption[]>('departments', { issuerId });

export const fenexDistricts = (departmentCode: string, issuerId?: string | null) =>
  isDemo()
    ? demoDistricts(departmentCode)
    : call<GeoOption[]>('districts', { departmentCode, issuerId });

export const fenexCities = (departmentCode: string, districtCode: string, issuerId?: string | null) =>
  isDemo()
    ? demoCities(departmentCode, districtCode)
    : call<GeoOption[]>('cities', { departmentCode, districtCode, issuerId });

export const fenexProducts = (issuerId?: string | null) =>
  isDemo() ? demoProducts() : call<FenexProduct[]>('products', { issuerId });

export const fenexCustomers = (issuerId?: string | null) =>
  isDemo() ? demoCustomers() : call<FenexCustomer[]>('customers', { issuerId });

/**
 * Creates and submits in one call. The idempotency key travels inside the
 * payload — Fenex looks it up per account, so a retry after a lost response
 * returns the original document rather than issuing a second one.
 */
export const createRemission = (payload: FenexRequest, issuerId?: string | null) =>
  isDemo() ? demoCreate(payload) : call<FenexRemissionResult>('create', { payload, issuerId });

/** Copies the KuDE PDF into our own storage and returns a signed link. */
export const fetchRemissionPdf = (remissionId: string, issuerId?: string | null) =>
  isDemo()
    ? Promise.resolve({ path: 'demo', url: demoPdfDataUrl() })
    : call<{ path: string; url: string | null }>('pdf', { remissionId, issuerId });

export { FenexError };
