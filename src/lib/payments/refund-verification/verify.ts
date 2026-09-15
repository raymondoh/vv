import { type Context, type Decision, type Observation, type Scope, failure, object, providerId, relatedId } from './model';

/** Only the server reader establishes authenticity. This pure function checks its facts. */
export function verifyRefund(input: Observation, expected: Scope, requestedId: string, context: Context | null): Decision {
  if (expected.provider !== 'stripe' || !providerId(expected.accountScope, 'acct')
    || input.scope.provider !== expected.provider || input.scope.accountScope !== expected.accountScope) return failure('ACCOUNT_MISMATCH');
  if (!['test', 'live'].includes(expected.environment) || input.scope.environment !== expected.environment) return failure('MODE_MISMATCH');
  const r = object(input.refund), c = object(input.charge);
  if (!r || !c || r.object !== 'refund' || c.object !== 'charge'
    || !providerId(r.id, 're') || !providerId(c.id, 'ch') || !providerId(requestedId, 're')) return failure('MALFORMED_PROVIDER_OBJECT');
  if (r.id !== requestedId) return failure('REFUND_ID_CONFLICT');
  if (relatedId(r.charge) !== c.id) return failure('CHARGE_MISMATCH');
  const pi = relatedId(c.payment_intent);
  if (!providerId(pi, 'pi')) return failure('MALFORMED_PROVIDER_OBJECT');
  if (r.payment_intent != null && relatedId(r.payment_intent) !== pi) return failure('PAYMENT_INTENT_MISMATCH');
  if (typeof c.livemode !== 'boolean') return failure('MALFORMED_PROVIDER_OBJECT');
  if (c.livemode !== (expected.environment === 'live')) return failure('MODE_MISMATCH');
  if (typeof r.amount !== 'number' || !Number.isSafeInteger(r.amount) || r.amount <= 0
    || typeof r.currency !== 'string' || !/^[a-z]{3}$/.test(r.currency)
    || c.currency !== r.currency
    || typeof r.created !== 'number' || !Number.isSafeInteger(r.created) || r.created < 0
    || !Number.isFinite(input.observedAt) || r.created > Math.floor(input.observedAt / 1000)
    || !Number.isFinite(new Date(r.created * 1000).getTime())) return failure('MALFORMED_PROVIDER_OBJECT');
  if (r.status === 'pending') return failure('PENDING', true);
  if (r.status === 'requires_action') return failure('REQUIRES_ACTION');
  if (r.status === 'failed' || r.status === 'canceled') return failure('TERMINAL_NON_SUCCESS');
  if (r.status !== 'succeeded') return failure('UNSUPPORTED_STATE');
  const evidence = { provider: expected.provider, environment: expected.environment, accountScope: expected.accountScope, refundId: r.id, paymentIntentId: pi, chargeId: c.id,
    amountMinor: r.amount, currency: r.currency.toUpperCase(), providerCreatedAt: new Date(r.created * 1000).toISOString() };
  if (!context) return { code: 'VERIFIED_UNCORRELATED', disposition: 'accept', evidence };
  // Mismatch never forces this obligation. Keep actual provider truth available
  // to the caller, but this stage does not automatically persist mismatch cases.
  const mismatch = (code: Decision['code']): Decision => ({ ...failure(code), evidence });
  if (context.provider !== expected.provider || context.accountScope !== expected.accountScope) return failure('ACCOUNT_MISMATCH');
  if (context.environment !== expected.environment) return failure('MODE_MISMATCH');
  if (context.refundId !== null && context.refundId !== r.id) return mismatch('REFUND_ID_CONFLICT');
  if (context.paymentIntentId !== pi) return mismatch('PAYMENT_INTENT_MISMATCH');
  if (context.chargeId !== c.id) return mismatch('CHARGE_MISMATCH');
  if (context.amountMinor !== r.amount) return mismatch('AMOUNT_MISMATCH');
  if (context.currency !== evidence.currency) return mismatch('CURRENCY_MISMATCH');
  if (context.correlation === 'mismatch' || context.candidateCount !== 1) return mismatch('VV_CORRELATION_MISMATCH');
  if (context.correlation === 'matched') return { code: 'VERIFIED_SUCCESS', disposition: 'accept', evidence };
  if (context.correlation === 'uncorrelated') return { code: 'VERIFIED_UNCORRELATED', disposition: 'accept', evidence };
  return failure('CONTEXT_UNAVAILABLE');
}
