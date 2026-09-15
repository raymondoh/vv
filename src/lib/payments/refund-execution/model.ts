import type { Scope } from '../refund-verification/model';
export type IdleAction = 'manual_review' | 'not_due' | 'already_claimed' | 'completed' | 'disabled';
export type ErrorCode = 'PROVIDER_RETRY' | 'DATABASE_RETRY' | 'VERIFICATION_RETRY' | 'PROVIDER_REJECTED' | 'IDENTITY_CONFLICT' | 'CONTEXT_UNAVAILABLE';
export type Context = Scope & {
 action: 'create' | 'retrieve'; refundId: string; token: string; leaseExpiresAt: string;
 attempt: number; chargeId: string; paymentIntentId: string; amountMinor: number; currency: string;
 idempotencyKey: string; firstDispatchAt: string; recoveryDeadline: string; providerRefundId: string | null;
};
export type Claim = { action: IdleAction } | Context;
export type CreateResult = { ok: true; refundId: string } | { ok: false; code: ErrorCode };
