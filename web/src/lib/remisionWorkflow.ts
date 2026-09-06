import type { Remision } from './types';

export function remisionState(r?: Remision) {
  if (!r) return 'draft';
  switch (r.fenex_status) {
    case 'DRAFT': return 'pending';
    case 'READY': return 'ready';
    case 'SUBMITTED': return 'submitted';
    case 'APPROVED': return 'approved';
    case 'REJECTED': return 'rejected';
    case 'CANCELLED': return 'cancelled';
  }
  if (r.status === 'issued') return 'approved'; // Historical records.
  if (r.status === 'sending') return r.error_message ? 'unknown' : 'sending';
  if (r.fenex_remission_id || r.cdc) return 'unknown';
  return r.status === 'failed' ? 'unknown' : 'draft';
}

export const remisionLabels = {
  draft: 'Draft — not sent', sending: 'Sending', unknown: 'Checking delivery',
  pending: 'Awaiting issuer review', ready: 'Awaiting submission',
  submitted: 'Awaiting SIFEN response', approved: 'Issued',
  rejected: 'Rejected — view reason', cancelled: 'Cancelled',
};

// Any delivered draft is immutable. Rejected drafts remain as an audit record.
export const remisionLocked = (r: Remision) => remisionState(r) !== 'draft';
