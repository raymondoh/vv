import test from 'node:test';
import assert from 'node:assert/strict';
import { createStripeReader, STRIPE_API_VERSION, type RouteResolver } from './stripe-reader';
import { context, observation } from './fixtures.test-helper';
import { verifyRefund } from './verify';
const resolve: RouteResolver = () => ({ provider: 'stripe', environment: 'test', accountScope: 'acct_Test', kind: 'platform', secretKey: 'test-only-not-a-credential' });
function transport(values: (unknown | Response | Error)[], calls: { url: string; options?: RequestInit }[]) {
  return async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
    calls.push({ url: String(input), options });
    const value = values.shift();
    if (value instanceof Error) throw value;
    return value instanceof Response ? value : new Response(JSON.stringify(value), { status: 200 });
  };
}
test('three authenticated GETs use one exact platform context, project only allowed fields', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const read = createStripeReader(resolve, transport([{ object: 'account', id: 'acct_Test', email: 'private' },
    { ...observation.refund as object, metadata: { fake: true } }, observation.charge], calls), () => observation.observedAt);
  const result = await read(observation.scope, 're_Test');
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(x => x.url), ['https://api.stripe.com/v1/account', 'https://api.stripe.com/v1/refunds/re_Test', 'https://api.stripe.com/v1/charges/ch_Test']);
  for (const call of calls) {
    assert.equal(call.options?.method, 'GET');
    assert.deepEqual(call.options?.headers, { Authorization: 'Bearer test-only-not-a-credential', 'Stripe-Version': STRIPE_API_VERSION });
    assert.equal(call.options?.redirect, 'error');
  }
  assert.doesNotMatch(JSON.stringify(result), /metadata|private|Authorization|credential/);
});
test('wrong authenticated account stops before refund retrieval; never falls back', async () => {
  const calls: { url: string }[] = [];
  const result = await createStripeReader(resolve, transport([{ object: 'account', id: 'acct_Other' }], calls))(observation.scope, 're_Test');
  assert.equal(result.ok ? '' : result.decision.code, 'ACCOUNT_MISMATCH');
  assert.equal(calls.length, 1);
});
test('unconfigured or swapped scope cannot cause any HTTP', async () => {
  for (const route of [() => null, resolve]) {
    const calls: { url: string }[] = [];
    const result = await createStripeReader(route, transport([], calls))({ ...observation.scope, accountScope: '' }, 're_Test');
    assert.equal(result.ok, false); assert.equal(calls.length, 0);
  }
});
for (const [status, code] of [[404, 'NOT_FOUND'], [429, 'PROVIDER_RETRY'], [500, 'PROVIDER_RETRY'], [401, 'PROVIDER_AUTH_FAILURE'], [403, 'PROVIDER_AUTH_FAILURE']] as const) {
  test(`safe provider status ${status}`, async () => {
    const result = await createStripeReader(resolve, transport([new Response('RAW SECRET PROVIDER ERROR', { status })], []))(observation.scope, 're_Test');
    assert.equal(result.ok ? '' : result.decision.code, code);
    assert.doesNotMatch(JSON.stringify(result), /RAW SECRET/);
  });
}
test('transport timeout is uncertainty, not evidence of non-creation', async () => {
  const result = await createStripeReader(resolve, transport([new Error('secret transport')], []))(observation.scope, 're_Test');
  assert.equal(result.ok ? '' : result.decision.code, 'PROVIDER_RETRY');
  assert.doesNotMatch(JSON.stringify(result), /secret transport/);
});
test('malformed JSON is safe', async () => {
  const result = await createStripeReader(resolve, transport([new Response('not json')], []))(observation.scope, 're_Test');
  assert.equal(result.ok ? '' : result.decision.code, 'MALFORMED_PROVIDER_OBJECT');
});
test('reader cannot turn malformed present PI into missing PI', async () => {
  const result = await createStripeReader(resolve, transport([{ object: 'account', id: 'acct_Test' },
    { ...observation.refund as object, payment_intent: { metadata: 'not an ID' } }, observation.charge], []), () => observation.observedAt)(observation.scope, 're_Test');
  assert.equal(result.ok && verifyRefund(result.observation, observation.scope, 're_Test', context).code, 'PAYMENT_INTENT_MISMATCH');
});
