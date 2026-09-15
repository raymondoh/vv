import 'server-only';
import { object, providerId, relatedId } from '../refund-verification/model';
import { STRIPE_API_VERSION, type RouteResolver, type Http } from '../refund-verification/stripe-reader';
import { canDispatch } from './context';
import type { Context, CreateResult } from './model';

/** One POST, no transport retries. The DB contract/key survives ambiguous HTTP.
 * Account lookup is not refund success verification; B4B must still re-fetch.
 */
export function createStripeCreator(resolve: RouteResolver, http: Http = fetch, now = Date.now) {
 return async (c: Context, fresh: () => Promise<boolean>): Promise<CreateResult> => {
  const route = resolve(c);
  if (!route || route.kind !== 'platform' || route.provider !== c.provider || route.environment !== c.environment
    || route.accountScope !== c.accountScope || !providerId(c.accountScope,'acct')) return { ok:false,code:'CONTEXT_UNAVAILABLE' };
  if (!canDispatch(c,now())) return { ok:false,code:'CONTEXT_UNAVAILABLE' };
  const headers = { Authorization:`Bearer ${route.secretKey}`, 'Stripe-Version':STRIPE_API_VERSION };
  try {
   const account = await http('https://api.stripe.com/v1/account', { method:'GET',headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000) });
   if (!account.ok) return { ok:false,code:account.status===429 || account.status>=500 ? 'PROVIDER_RETRY':'PROVIDER_REJECTED' };
   const accountText = await account.text();
   if (accountText.length>1_000_000) return { ok:false,code:'CONTEXT_UNAVAILABLE' };
   const a = object(JSON.parse(accountText));
   if (a?.object !== 'account' || a.id !== c.accountScope) return { ok:false,code:'IDENTITY_CONFLICT' };
   // Fresh DB token check AFTER preflight HTTP; local check again immediately
   // before POST. A paused-process race still requires provider idempotency.
   if (!await fresh() || !canDispatch(c,now())) return { ok:false,code:'CONTEXT_UNAVAILABLE' };
   const response = await http('https://api.stripe.com/v1/refunds', { method:'POST',
    headers:{ ...headers,'Idempotency-Key':c.idempotencyKey,'Content-Type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({ charge:c.chargeId,amount:c.amountMinor.toString(),reverse_transfer:'true',refund_application_fee:'true' }).toString(),
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000) });
   if (!response.ok) return { ok:false,code:response.status===429 || response.status>=500 ? 'PROVIDER_RETRY':'PROVIDER_REJECTED' };
   const text = await response.text();
   if (text.length>1_000_000) return { ok:false,code:'PROVIDER_RETRY' };
   const r = object(JSON.parse(text));
   if (!r || r.object!=='refund' || !providerId(r.id,'re') || !Number.isSafeInteger(r.amount) || r.amount!==c.amountMinor
    || typeof r.currency!=='string' || !/^[a-z]{3}$/.test(r.currency) || r.currency.toUpperCase()!==c.currency
    || relatedId(r.charge)!==c.chargeId || (r.payment_intent!=null && relatedId(r.payment_intent)!==c.paymentIntentId)
    || typeof r.status!=='string' || !['succeeded','pending','failed','canceled','requires_action'].includes(r.status)) {
    return { ok:false,code:'PROVIDER_RETRY' };
   }
   return { ok:true,refundId:r.id };
  } catch { return { ok:false,code:'PROVIDER_RETRY' }; }
 };
}
