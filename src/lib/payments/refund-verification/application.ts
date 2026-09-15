import { object, uuid } from './model';

const manualReasons = ['UNAVAILABLE','EVIDENCE_REQUIRES_REVIEW','HISTORICAL_IDENTITY_MISMATCH',
  'REQUEST_BINDING_MISSING','IDENTITY_MISMATCH','COMPENSATION_RESERVED','STATE_REQUIRES_REVIEW',
  'CAPACITY_EXCEEDED','PAYMENT_TOTAL_INCONSISTENT','BOOKING_COLLECTION_UNPROVEN','BOOKING_TOTAL_INCONSISTENT'] as const;
export type ApplicationDecision = {
  code: 'APPLIED' | 'ALREADY_APPLIED' | 'TARGET_CONFLICT' | 'CROSS_WORKFLOW_CONFLICT' | 'APPLICATION_REVIEW' | 'DATABASE_RETRY' | 'DATABASE_RESPONSE_INVALID';
  disposition: 'accept' | 'retry' | 'manual_review';
  reason?: string;
  applicationId?: string;
  cumulativeMinor?: number;
  paymentStatus?: 'partially_refunded' | 'refunded';
  bookingPaymentStatus?: 'partially_refunded' | 'refunded';
};
const row = (v: unknown) => Array.isArray(v) && v.length === 1 ? object(v[0]) : null;
const refundStatus = (v: unknown): v is 'partially_refunded' | 'refunded' => typeof v === 'string' && (v === 'partially_refunded' || v === 'refunded');
export const invalidApplication = (): ApplicationDecision => ({ code: 'DATABASE_RESPONSE_INVALID', disposition: 'retry' });

/** B4A returns snapshots, not today's aggregate. Target/receipt are the RPC inputs,
 * not echoed columns; PostgreSQL proves their binding and exclusive consumption. */
export function parseOrdinaryApplication(value: unknown, minimumRefundMinor = 1): ApplicationDecision {
  const r = row(value);
  if (!r || typeof r.outcome !== 'string' || typeof r.reason_code !== 'string') return invalidApplication();
  if (r.outcome === 'applied' || r.outcome === 'already_applied') {
    if (r.reason_code !== (r.outcome === 'applied' ? 'VERIFIED' : 'REPLAY') || !uuid(r.application_id)
      || typeof r.payment_refunded_total_minor !== 'number' || !Number.isSafeInteger(r.payment_refunded_total_minor)
      || r.payment_refunded_total_minor < minimumRefundMinor || !refundStatus(r.payment_status) || !refundStatus(r.booking_payment_status)
      || (r.payment_status === 'partially_refunded' && r.booking_payment_status === 'refunded')) return invalidApplication();
    return { code: r.outcome === 'applied' ? 'APPLIED' : 'ALREADY_APPLIED', disposition: 'accept',
      applicationId: r.application_id.toLowerCase(), cumulativeMinor: r.payment_refunded_total_minor,
      paymentStatus: r.payment_status, bookingPaymentStatus: r.booking_payment_status };
  }
  if (r.application_id !== null || r.payment_refunded_total_minor !== null || r.payment_status !== null || r.booking_payment_status !== null) return invalidApplication();
  if (r.outcome === 'conflict' && ['EVIDENCE_CONSUMED','REQUEST_CONSUMED'].includes(r.reason_code)) {
    // EVIDENCE_CONSUMED does not reveal which other workflow/request owns it.
    return { code: 'TARGET_CONFLICT', disposition: 'manual_review', reason: r.reason_code };
  }
  if (r.outcome === 'manual_review' && manualReasons.some(x => x === r.reason_code)) return { code: 'APPLICATION_REVIEW', disposition: 'manual_review', reason: r.reason_code };
  return invalidApplication();
}

export function parseCompensationApplication(value: unknown, receiptId: string, obligationId: string): ApplicationDecision {
  const r = row(value);
  if (!r || !uuid(r.evidence_id) || r.evidence_id.toLowerCase() !== receiptId.toLowerCase()
    || (r.obligation_id !== null && (!uuid(r.obligation_id) || r.obligation_id.toLowerCase() !== obligationId.toLowerCase()))
    || typeof r.outcome !== 'string' || typeof r.payment_outcome !== 'string') return invalidApplication();
  const hasTarget = r.obligation_id !== null;
  if (r.outcome === 'ordinary_applied'
    && ((hasTarget && r.payment_outcome === 'unchanged') || (!hasTarget && r.payment_outcome === 'not_correlated'))) {
    return { code: 'CROSS_WORKFLOW_CONFLICT', disposition: 'manual_review' };
  }
  if (r.outcome === 'applied' && hasTarget && ['updated','already_refunded','uncorrelated','state_follow_up','identity_follow_up'].includes(r.payment_outcome)) {
    return ['state_follow_up','identity_follow_up'].includes(r.payment_outcome)
      ? { code: 'APPLICATION_REVIEW', disposition: 'manual_review' }
      : { code: 'APPLIED', disposition: 'accept' };
  }
  if (r.outcome === 'already_applied' && hasTarget && r.payment_outcome === 'unchanged') return { code: 'ALREADY_APPLIED', disposition: 'accept' };
  if (r.outcome === 'manual_review' && r.payment_outcome === (hasTarget ? 'unchanged' : 'not_correlated')) return { code: 'APPLICATION_REVIEW', disposition: 'manual_review' };
  if (r.outcome === 'unresolved' && !hasTarget && r.payment_outcome === 'not_correlated') return { code: 'APPLICATION_REVIEW', disposition: 'manual_review' };
  return invalidApplication();
}
