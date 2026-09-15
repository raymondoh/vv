import type { Context, Observation } from './model';
export const context: Context = {
  obligationId: '11111111-1111-4111-8111-111111111111', provider: 'stripe', environment: 'test', accountScope: 'acct_Test',
  refundId: 're_Test', paymentIntentId: 'pi_Test', chargeId: 'ch_Test', amountMinor: 12500, currency: 'GBP',
  bookingId: '22222222-2222-4222-8222-222222222222', paymentId: '33333333-3333-4333-8333-333333333333',
  correlation: 'matched', candidateCount: 1,
};
export const observation: Observation = { scope: { provider: 'stripe', environment: 'test', accountScope: 'acct_Test' }, observedAt: 2_000_000_000_000,
  refund: { object: 'refund', id: 're_Test', charge: 'ch_Test', payment_intent: 'pi_Test', amount: 12500, currency: 'gbp', created: 1_999_999_999, status: 'succeeded' },
  charge: { object: 'charge', id: 'ch_Test', payment_intent: 'pi_Test', livemode: false, currency: 'gbp' },
};
export const row = { obligation_id: context.obligationId, provider: 'stripe', integration_environment: 'test', provider_account_scope: 'acct_Test',
  provider_refund_id: 're_Test', provider_payment_id: 'pi_Test', provider_charge_id: 'ch_Test', amount_minor: 12500, currency_code: 'GBP',
  booking_id: context.bookingId, payment_id: context.paymentId, correlation_status: 'matched', candidate_count: 1 };
export const receiptId = '44444444-4444-4444-8444-444444444444';
