import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRefund } from './verify';
import { parseContext } from './context';
import { context, observation, row } from './fixtures.test-helper';
import { object, type Code } from './model';
const run = (r = {}, c = {}, o = context) => verifyRefund({ ...observation, refund: { ...object(observation.refund), ...r }, charge: { ...object(observation.charge), ...c } }, observation.scope, 're_Test', o);
test('exact success normalizes only financial fields and timestamps', () => {
  const result = run({ metadata: { amount: 1 }, customer: 'secret-contact' });
  assert.equal(result.code, 'VERIFIED_SUCCESS');
  assert.equal(result.evidence?.currency, 'GBP');
  assert.equal(result.evidence?.providerCreatedAt, '2033-05-18T03:33:19.000Z');
  assert.doesNotMatch(JSON.stringify(result), /metadata|customer|bookingId/);
});
const cases: [string, Record<string, unknown>, Record<string, unknown>, Code][] = [
  ['refund ID', { id: 're_Other' }, {}, 'REFUND_ID_CONFLICT'],
  ['charge ID', { charge: 'ch_Other' }, {}, 'CHARGE_MISMATCH'],
  ['PI disagreement', { payment_intent: 'pi_Other' }, {}, 'PAYMENT_INTENT_MISMATCH'],
  ['amount', { amount: 12501 }, {}, 'AMOUNT_MISMATCH'],
  ['currency', { currency: 'usd' }, { currency: 'usd' }, 'CURRENCY_MISMATCH'],
  ['mode', {}, { livemode: true }, 'MODE_MISMATCH'],
  ['zero', { amount: 0 }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['negative', { amount: -1 }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['fractional', { amount: 1.1 }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['unsafe integer', { amount: Number.MAX_SAFE_INTEGER + 1 }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['string amount', { amount: '12500' }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['fractional timestamp', { created: 1.5 }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['future timestamp', { created: 2_000_000_001 }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['infinite timestamp', { created: Infinity }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['missing PI everywhere', { payment_intent: null }, { payment_intent: null }, 'MALFORMED_PROVIDER_OBJECT'],
  ['wrong object', { object: 'charge' }, {}, 'MALFORMED_PROVIDER_OBJECT'],
  ['pending', { status: 'pending' }, {}, 'PENDING'],
  ['requires action', { status: 'requires_action' }, {}, 'REQUIRES_ACTION'],
  ['failed', { status: 'failed' }, {}, 'TERMINAL_NON_SUCCESS'],
  ['canceled', { status: 'canceled' }, {}, 'TERMINAL_NON_SUCCESS'],
  ['unknown state', { status: 'approved' }, {}, 'UNSUPPORTED_STATE'],
];
for (const [name, r, c, code] of cases) test(name, () => assert.equal(run(r, c).code, code));
test('missing Refund PI derives from Charge, including expanded objects', () => {
  assert.equal(run({ payment_intent: null }, { payment_intent: { id: 'pi_Test' } }).code, 'VERIFIED_SUCCESS');
  assert.equal(run({ charge: { id: 'ch_Test' }, payment_intent: { id: 'pi_Test' } }).code, 'VERIFIED_SUCCESS');
});
test('account mismatch including null scope fails closed', () => {
  assert.equal(verifyRefund(observation, { ...observation.scope, accountScope: '' }, 're_Test', context).code, 'ACCOUNT_MISMATCH');
  assert.equal(run({}, {}, { ...context, accountScope: 'acct_Other' }).code, 'ACCOUNT_MISMATCH');
  assert.equal(parseContext([{ ...row, provider_account_scope: null }], context.obligationId), null);
});
test('wrong mode in VV context rejected', () => assert.equal(run({}, {}, { ...context, environment: 'live' }).code, 'MODE_MISMATCH'));
test('known conflicting refund and wrong persisted relationship do not accept', () => {
  assert.equal(run({}, {}, { ...context, refundId: 're_Other' }).code, 'REFUND_ID_CONFLICT');
  assert.equal(run({}, {}, { ...context, correlation: 'mismatch' }).code, 'VV_CORRELATION_MISMATCH');
  assert.equal(run({}, {}, { ...context, candidateCount: 2, refundId: null }).code, 'VV_CORRELATION_MISMATCH');
});
test('early missing refund ID allows one exact financial match', () => assert.equal(run({}, {}, { ...context, refundId: null }).code, 'VERIFIED_SUCCESS'));
test('unknown association stays explicit, never inferred from metadata', () => {
  assert.equal(verifyRefund(observation, observation.scope, 're_Test', null).code, 'VERIFIED_UNCORRELATED');
  assert.equal(run({}, {}, { ...context, bookingId: null, paymentId: null, correlation: 'uncorrelated' }).code, 'VERIFIED_UNCORRELATED');
});
test('repeated observation deterministic', () => assert.deepEqual(run(), run()));
test('nullable/malformed context rejected at runtime', () => {
  for (const delta of [{ obligation_id: 'bad' }, { amount_minor: null }, { amount_minor: '12500' }, { payment_id: null }, { candidate_count: 0 }, { correlation_status: 'approved' }]) {
    assert.equal(parseContext([{ ...row, ...delta }], context.obligationId), null);
  }
  assert.equal(parseContext([row, row], context.obligationId), null);
  assert.deepEqual(parseContext([row], context.obligationId), context);
});

for (const [label, value] of Object.entries({ array: ['mismatch'], object: { value: 'matched' }, number: 123, boolean: true, null: null, undefined: undefined })) {
  test(`context rejects non-string correlation: ${label}`, () => {
    assert.equal(parseContext([{ ...row, correlation_status: value }], context.obligationId), null);
    // Deliberately violate the static type to exercise the runtime boundary.
    const invalid = { ...context, correlation: value } as unknown as typeof context;
    const result = run({}, {}, invalid);
    assert.equal(result.code, 'CONTEXT_UNAVAILABLE');
    assert.notEqual(result.disposition, 'accept');
  });
}
test('all valid scalar correlation states remain supported', () => {
  for (const correlation_status of ['matched', 'mismatch', 'uncorrelated']) {
    const ids = correlation_status === 'uncorrelated' ? { booking_id: null, payment_id: null } : {};
    assert.equal(parseContext([{ ...row, ...ids, correlation_status }], context.obligationId)?.correlation, correlation_status);
  }
});
