import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { FenexRequest } from './fenexPayload';

/**
 * Every call to Fenex goes through the `fenex` Edge Function, never straight
 * from the browser. The server integration credential never reaches this module.
 */

/** Public metadata for an issuer-approved connection. Not an authorization grant. */
export interface Issuer {
  connection_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'UNAVAILABLE';
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
  /** Field returned by the current Fenex CustomerResponse. */
  rucOrDocument?: string;
  // Forward-compatible aliases if Fenex later expands its customer response.
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
  fenexRemissionId?: string;
  remissionNumber: string | null;
  cdc: string | null;
  status: string;
  reviewStatus?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectionReason?: string | null;
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
    // A non-2xx response is represented as FunctionsHttpError. Supabase keeps
    // the function's JSON body on `context`; `data` is normally null here.
    // Reading only error.message hides the useful Fenex rejection reason.
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json() as { error?: string; detail?: unknown };
        throw new FenexError(body.error ?? error.message, body.detail);
      } catch (bodyError) {
        if (bodyError instanceof FenexError) throw bodyError;
      }
    }
    throw new FenexError(error.message);
  }

  const payload = data as { error?: string; detail?: unknown };
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    throw new FenexError(payload.error, payload.detail);
  }
  return data as T;
}

/** Request access by RUC; the account owner approves inside Fenex. */
export const requestFenexConnection = (label: string, ruc: string) =>
  call<{ issuers: Issuer[] }>('requestConnection', { label, ruc }).then(r => r.issuers);

export const unlinkFenex = (issuerId: string) =>
  call<{ issuers: Issuer[] }>('unlink', { issuerId });

export const fenexIssuers = () =>
  call<{ issuers: Issuer[] }>('issuers').then((r) => r.issuers);

export const setDefaultIssuer = (issuerId: string) =>
  call<{ issuers: Issuer[] }>('setDefaultIssuer', { issuerId }).then((r) => r.issuers);

// Geography and customers are read through a specific issuer's Fenex session:
// two issuers are two accounts, and their customer lists are not the same.
export const fenexDepartments = (issuerId?: string | null) =>
  call<GeoOption[]>('departments', { issuerId });

export const fenexDistricts = (departmentCode: string, issuerId?: string | null) =>
  call<GeoOption[]>('districts', { departmentCode, issuerId });

export const fenexCities = (departmentCode: string, districtCode: string, issuerId?: string | null) =>
  call<GeoOption[]>('cities', { departmentCode, districtCode, issuerId });

export const fenexProducts = (issuerId?: string | null) =>
  call<FenexProduct[]>('products', { issuerId });

export const fenexCustomers = (issuerId?: string | null) =>
  call<FenexCustomer[]>('customers', { issuerId });

/** Sending creates only a DRAFT. The linked Fenex owner must review it. */
export const canSendApproval = () => true;
export async function sendDraftForApproval(payload: FenexRequest, issuerId?: string | null) {
  if (!issuerId) throw new Error('Choose an approved Fenex issuer.');
  return call<FenexRemissionResult>('sendDraft', { payload, issuerId });
}

/** Pulls issuer decisions and SIFEN status into the caller's own Virtus rows. */
export const syncFenexRemissions = () =>
  call<{ remissions: FenexRemissionResult[] }>('remissions').then(r => r.remissions);

/** Copies the KuDE PDF into our own storage and returns a signed link. */
export const fetchRemissionPdf = (remissionId: string, issuerId?: string | null) =>
  call<{ path: string; url: string | null }>('pdf', { remissionId, issuerId });

export { FenexError };
