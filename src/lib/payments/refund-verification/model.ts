/** Provider evidence is distinct from VV association. No metadata is accepted. */
export type Environment = 'test' | 'live';
export type Scope = { provider: 'stripe'; environment: Environment; accountScope: string };
export type Context = Scope & {
  obligationId: string;
  refundId: string | null;
  paymentIntentId: string;
  chargeId: string;
  amountMinor: number;
  currency: string;
  bookingId: string | null;
  paymentId: string | null;
  correlation: 'matched' | 'uncorrelated' | 'mismatch';
  candidateCount: number;
};
export type Evidence = Scope & {
  refundId: string;
  paymentIntentId: string;
  chargeId: string;
  amountMinor: number;
  currency: string;
  providerCreatedAt: string;
};
export type Code =
  | 'VERIFIED_SUCCESS' | 'VERIFIED_UNCORRELATED'
  | 'PENDING' | 'REQUIRES_ACTION' | 'TERMINAL_NON_SUCCESS'
  | 'NOT_FOUND' | 'PROVIDER_RETRY' | 'PROVIDER_AUTH_FAILURE'
  | 'ACCOUNT_MISMATCH' | 'MODE_MISMATCH' | 'PAYMENT_INTENT_MISMATCH'
  | 'CHARGE_MISMATCH' | 'AMOUNT_MISMATCH' | 'CURRENCY_MISMATCH'
  | 'REFUND_ID_CONFLICT' | 'MALFORMED_PROVIDER_OBJECT' | 'UNSUPPORTED_STATE'
  | 'VV_CORRELATION_MISMATCH' | 'CONTEXT_UNAVAILABLE' | 'DATABASE_RETRY'
  | 'DATABASE_RESPONSE_INVALID' | 'EVIDENCE_CONFLICT';
export type Decision = {
  code: Code;
  disposition: 'accept' | 'retry' | 'manual_review';
  evidence?: Evidence;
};
export type Observation = { scope: Scope; refund: unknown; charge: unknown; observedAt: number };
export type ReadResult = { ok: true; observation: Observation } | { ok: false; decision: Decision };
export const failure = (code: Code, retry = false): Decision => ({
  code, disposition: retry ? 'retry' : 'manual_review',
});
export const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
export const providerId = (value: unknown, prefix: string): value is string =>
  typeof value === 'string' && value.length <= 255 && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
export const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const relatedId = (value: unknown): unknown => typeof value === 'string' ? value : object(value)?.id;

/** Future creator contract only: timeout is never evidence of non-creation. */
export type CreationRecovery =
  | { state: 'request_dispatched'; idempotencyKey: string; dispatchedAt: string }
  | { state: 'ambiguous'; refundId: string | null; idempotencyKey: string }
  | { state: 'known_refund'; refundId: string }
  | { state: 'same_key_recovery'; idempotencyKey: string; permittedUntil: string }
  | { state: 'manual_review'; reason: 'RECOVERY_WINDOW_EXHAUSTED' };
