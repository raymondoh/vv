import { type Context, type OrdinaryContext, object, providerId, uuid } from './model';

/** Generated view/RPC nullable types never bypass runtime validation. */
export function parseContext(value: unknown, expectedId: string): Context | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const r = object(value[0]);
  if (!r || !uuid(r.obligation_id) || r.obligation_id.toLowerCase() !== expectedId.toLowerCase()
    || r.provider !== 'stripe' || (r.integration_environment !== 'test' && r.integration_environment !== 'live')
    || !providerId(r.provider_account_scope, 'acct')
    || (r.provider_refund_id !== null && !providerId(r.provider_refund_id, 're'))
    || !providerId(r.provider_payment_id, 'pi') || !providerId(r.provider_charge_id, 'ch')
    || typeof r.amount_minor !== 'number' || !Number.isSafeInteger(r.amount_minor) || r.amount_minor <= 0
    || typeof r.currency_code !== 'string' || !/^[A-Z]{3}$/.test(r.currency_code)
    || (r.booking_id !== null && !uuid(r.booking_id)) || (r.payment_id !== null && !uuid(r.payment_id))
    || (r.booking_id === null) !== (r.payment_id === null)
    || typeof r.correlation_status !== 'string'
    || (r.correlation_status !== 'matched' && r.correlation_status !== 'uncorrelated' && r.correlation_status !== 'mismatch')
    || typeof r.candidate_count !== 'number' || !Number.isSafeInteger(r.candidate_count) || r.candidate_count < 1) return null;
  if ((r.correlation_status === 'matched' && r.payment_id === null)
    || (r.correlation_status === 'uncorrelated' && r.payment_id !== null)) return null;
  return { obligationId: r.obligation_id.toLowerCase(), provider: r.provider, environment: r.integration_environment,
    accountScope: r.provider_account_scope, refundId: r.provider_refund_id,
    paymentIntentId: r.provider_payment_id, chargeId: r.provider_charge_id, amountMinor: r.amount_minor, currency: r.currency_code,
    bookingId: r.booking_id, paymentId: r.payment_id,
    correlation: r.correlation_status, candidateCount: r.candidate_count };
}

/** The SQL RPC returns no row for missing binding or unsafe historical identity. */
export function parseOrdinaryContext(value: unknown, expectedId: string): OrdinaryContext | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const r = object(value[0]);
  if (!r || !uuid(r.refund_request_id) || r.refund_request_id.toLowerCase() !== expectedId.toLowerCase()
    || !uuid(r.payment_id) || !uuid(r.booking_id) || !providerId(r.provider_refund_id, 're')
    || typeof r.request_status !== 'string' || !['pending','processing','succeeded','failed','cancelled'].includes(r.request_status)) return null;
  const common = parseContext([{ ...r, obligation_id: r.refund_request_id, correlation_status: 'matched', candidate_count: 1 }], expectedId);
  if (!common) return null;
  const { obligationId, ...financial } = common;
  return { ...financial, refundRequestId: obligationId, requestStatus: r.request_status };
}
