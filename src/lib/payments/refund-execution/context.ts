import { object, providerId, uuid } from '../refund-verification/model';
import { STRIPE_API_VERSION } from '../refund-verification/stripe-reader';
import type { Claim, Context, IdleAction } from './model';
export function timestamp(v: unknown): v is string {
 if (!(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)))) return false;
 const year=Number(v.slice(0,4)), month=Number(v.slice(5,7)), day=Number(v.slice(8,10));
 return month>=1 && month<=12 && day>=1 && day<=new Date(Date.UTC(year,month,0)).getUTCDate()
  && Number(v.slice(11,13))<24 && Number(v.slice(14,16))<60 && Number(v.slice(17,19))<60;
}
export function parseClaim(value: unknown, id: string): Claim | null {
 const r = object(value);
 if (!r || typeof r.action !== 'string') return null;
 if (['manual_review','not_due','already_claimed','completed','disabled'].includes(r.action)) {
  return Object.keys(r).length === 1 ? { action: r.action as IdleAction } : null;
 }
 if (r.action !== 'create' && r.action !== 'retrieve') return null;
 if (!uuid(r.refund_id) || r.refund_id.toLowerCase() !== id.toLowerCase() || !uuid(r.claim_token)
  || !timestamp(r.lease_expires_at) || !timestamp(r.first_dispatch_authorized_at) || !timestamp(r.recovery_deadline)
  || typeof r.attempt_count !== 'number' || !Number.isInteger(r.attempt_count) || r.attempt_count < 1 || r.attempt_count > 20
  || r.provider !== 'stripe' || (r.environment !== 'test' && r.environment !== 'live') || !providerId(r.account_scope,'acct')
  || !providerId(r.charge_id,'ch') || !providerId(r.payment_intent_id,'pi')
  || typeof r.amount_minor !== 'number' || !Number.isSafeInteger(r.amount_minor) || r.amount_minor <= 0
  || typeof r.currency !== 'string' || !/^[A-Z]{3}$/.test(r.currency)
  || r.idempotency_key !== `vv:${r.environment}:ordinary-refund:${id.toLowerCase()}:v1`
  || r.reverse_transfer !== true || r.refund_application_fee !== true || r.contract_version !== 'v1' || r.api_version !== STRIPE_API_VERSION
  || Date.parse(r.recovery_deadline)-Date.parse(r.first_dispatch_authorized_at) !== 23*3600_000
  || (r.action === 'create' ? r.provider_refund_id !== null : !providerId(r.provider_refund_id,'re'))) return null;
 return { action:r.action,refundId:r.refund_id.toLowerCase(),token:r.claim_token.toLowerCase(),leaseExpiresAt:r.lease_expires_at,
  attempt:r.attempt_count,provider:r.provider,environment:r.environment,accountScope:r.account_scope,
  chargeId:r.charge_id,paymentIntentId:r.payment_intent_id,amountMinor:r.amount_minor,currency:r.currency,
  idempotencyKey:r.idempotency_key as string,firstDispatchAt:r.first_dispatch_authorized_at,recoveryDeadline:r.recovery_deadline,
  providerRefundId:r.provider_refund_id as string | null };
}
export function canDispatch(c: Context, now: number): boolean {
 return c.action === 'create' && c.providerRefundId === null && c.attempt <= 20
  && Number.isFinite(now) && now >= Date.parse(c.firstDispatchAt) && now < Date.parse(c.leaseExpiresAt) && now < Date.parse(c.recoveryDeadline);
}
