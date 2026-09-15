import 'server-only';
import { type Scope, type ReadResult, failure, object, providerId, relatedId } from './model';

/** Fixed REST contract; no SDK, provider search, Connect fallback or create API. */
export const STRIPE_API_VERSION = '2025-02-24.acacia';
export type CredentialRoute = Scope & { kind: 'platform'; secretKey: string };
export type RouteResolver = (scope: Scope) => CredentialRoute | null;
export type Http = typeof fetch;

/** Explicit test-platform route only. NULL scope never selects a default. */
export const environmentRoute: RouteResolver = (scope) => {
  const accountScope = process.env.VV_STRIPE_TEST_PLATFORM_ACCOUNT_ID;
  const secretKey = process.env.VV_STRIPE_TEST_SECRET_KEY;
  if (scope.provider !== 'stripe' || scope.environment !== 'test'
    || !providerId(accountScope, 'acct') || scope.accountScope !== accountScope
    || !secretKey || !/^(sk|rk)_test_/.test(secretKey)) return null;
  return { ...scope, kind: 'platform', secretKey };
};

export function createStripeReader(resolve: RouteResolver, http: Http = fetch, now = Date.now) {
  return async (scope: Scope, refundId: string): Promise<ReadResult> => {
    const route = resolve(scope);
    if (!providerId(scope.accountScope, 'acct') || !route || route.kind !== 'platform'
      || route.provider !== scope.provider || route.accountScope !== scope.accountScope) {
      return { ok: false, decision: failure('ACCOUNT_MISMATCH') };
    }
    if (route.environment !== scope.environment) return { ok: false, decision: failure('MODE_MISMATCH') };
    if (!providerId(refundId, 're')) return { ok: false, decision: failure('MALFORMED_PROVIDER_OBJECT') };
    // The SAME closed-over route authenticates all three GETs. No account from
    // provider metadata, caller headers, or another failed route can replace it.
    const get = async (path: string): Promise<{ ok: true; value: unknown } | { ok: false; decision: ReturnType<typeof failure> }> => {
      try {
        const response = await http(`https://api.stripe.com/v1/${path}`, {
          method: 'GET', headers: { Authorization: `Bearer ${route.secretKey}`, 'Stripe-Version': STRIPE_API_VERSION },
          cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          const code = response.status === 404 ? 'NOT_FOUND'
            : response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH_FAILURE'
              : response.status === 429 || response.status >= 500 ? 'PROVIDER_RETRY' : 'MALFORMED_PROVIDER_OBJECT';
          return { ok: false, decision: failure(code, code === 'PROVIDER_RETRY' || code === 'NOT_FOUND') };
        }
        const text = await response.text();
        if (text.length > 1_000_000) return { ok: false, decision: failure('MALFORMED_PROVIDER_OBJECT') };
        try { return { ok: true, value: JSON.parse(text) }; }
        catch { return { ok: false, decision: failure('MALFORMED_PROVIDER_OBJECT') }; }
      } catch {
        return { ok: false, decision: failure('PROVIDER_RETRY', true) };
      }
    };
    const account = await get('account');
    if (!account.ok) return account;
    if (object(account.value)?.object !== 'account' || object(account.value)?.id !== route.accountScope) {
      return { ok: false, decision: failure('ACCOUNT_MISMATCH') };
    }
    const refund = await get(`refunds/${encodeURIComponent(refundId)}`);
    if (!refund.ok) return refund;
    const r = object(refund.value), chargeId = relatedId(r?.charge);
    if (!r || !providerId(chargeId, 'ch')) return { ok: false, decision: failure('MALFORMED_PROVIDER_OBJECT') };
    const charge = await get(`charges/${encodeURIComponent(chargeId)}`);
    if (!charge.ok) return charge;
    const c = object(charge.value);
    // Project only verification fields. Raw responses/contact/metadata never
    // leave this module or reach persistence/logging.
    return { ok: true, observation: { scope: { provider: route.provider, environment: route.environment, accountScope: route.accountScope },
      observedAt: now(),
      refund: { object: r.object, id: r.id, charge: chargeId, payment_intent: r.payment_intent == null ? null : (relatedId(r.payment_intent) ?? ''),
        amount: r.amount, currency: r.currency, created: r.created, status: r.status },
      charge: c ? { object: c.object, id: c.id, payment_intent: relatedId(c.payment_intent), currency: c.currency, livemode: c.livemode } : null,
    } };
  };
}
