import { supabase } from './supabase';
import type { FenexRequest } from './fenexPayload';
// DEMO — remove this import and every isDemo() branch below before launch.
import {
  demoCities,
  demoCreate,
  demoCustomers,
  demoDepartments,
  demoDistricts,
  demoPdfDataUrl,
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
  fenex_email?: string | null;
  account_id?: string | null;
  subscription_status?: string | null;
  paid_until?: string | null;
  linked_at?: string | null;
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

/** Exchanges the password for a token once; the password is never stored. */
export const linkFenex = (email: string, password: string) =>
  call<FenexLinkStatus>('link', { email, password });

export const unlinkFenex = () => call<{ linked: boolean }>('unlink');

export const fenexStatus = () =>
  isDemo() ? demoStatus() : call<FenexLinkStatus>('status');

export const fenexDepartments = () =>
  isDemo() ? demoDepartments() : call<GeoOption[]>('departments');

export const fenexDistricts = (departmentCode: string) =>
  isDemo() ? demoDistricts(departmentCode) : call<GeoOption[]>('districts', { departmentCode });

export const fenexCities = (departmentCode: string, districtCode: string) =>
  isDemo()
    ? demoCities(departmentCode, districtCode)
    : call<GeoOption[]>('cities', { departmentCode, districtCode });

export const fenexCustomers = () =>
  isDemo() ? demoCustomers() : call<FenexCustomer[]>('customers');

/**
 * Creates and submits in one call. The idempotency key travels inside the
 * payload — Fenex looks it up per account, so a retry after a lost response
 * returns the original document rather than issuing a second one.
 */
export const createRemission = (payload: FenexRequest) =>
  isDemo() ? demoCreate(payload) : call<FenexRemissionResult>('create', { payload });

/** Copies the KuDE PDF into our own storage and returns a signed link. */
export const fetchRemissionPdf = (remissionId: string) =>
  isDemo()
    ? Promise.resolve({ path: 'demo', url: demoPdfDataUrl() })
    : call<{ path: string; url: string | null }>('pdf', { remissionId });

export { FenexError };
