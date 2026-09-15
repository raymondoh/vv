import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTarget } from './model';
import { parseOrdinaryContext } from './context';
import { parseOrdinaryApplication, parseCompensationApplication } from './application';
import { context, row, receiptId } from './fixtures.test-helper';
const good = { application_id: receiptId, outcome: 'applied', reason_code: 'VERIFIED',
  payment_refunded_total_minor: 100, payment_status: 'partially_refunded', booking_payment_status: 'partially_refunded' };
const badValues = (v: string) => [[v], { value: v }, 123, true, null, undefined];
test('targets are explicit, canonical and exclusive', () => {
  assert.deepEqual(parseTarget({ kind: 'ordinary', refundRequestId: context.obligationId }), { kind: 'ordinary', refundRequestId: context.obligationId });
  assert.equal(parseTarget({ kind: 'ordinary', refundRequestId: context.obligationId, obligationId: context.obligationId }), null);
  assert.equal(parseTarget({ kind: 'other', refundRequestId: context.obligationId }), null);
  assert.equal(parseTarget({ kind: 'ordinary', refundRequestId: 'bad' }), null);
});
for (const [i,v] of badValues('ordinary').entries()) test(`target scalar kind ${i}`, () => assert.equal(parseTarget({ kind: v, refundRequestId: context.obligationId }), null));
for (const field of ['outcome','reason_code','payment_status','booking_payment_status','application_id'] as const) {
  for (const [i,v] of badValues(good[field]).entries()) test(`ordinary rejects ${field} ${i}`, () => {
    assert.equal(parseOrdinaryApplication([{ ...good, [field]: v }]).code, 'DATABASE_RESPONSE_INVALID');
  });
}
for (const v of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1,'100',null,undefined,[],{}]) test(`unsafe amount ${JSON.stringify(v)}`, () => {
  assert.equal(parseOrdinaryApplication([{ ...good, payment_refunded_total_minor: v }]).code, 'DATABASE_RESPONSE_INVALID');
});
test('ordinary exact success, replay and conflicting combinations', () => {
  assert.equal(parseOrdinaryApplication([good]).code, 'APPLIED');
  assert.equal(parseOrdinaryApplication([{ ...good, outcome: 'already_applied', reason_code: 'REPLAY' }]).code, 'ALREADY_APPLIED');
  for (const delta of [{ outcome: 'already_applied' }, { reason_code: 'REPLAY' }, { payment_status: 'paid' }, { outcome: 'unknown' }, { reason_code: 'unknown' }]) {
    assert.equal(parseOrdinaryApplication([{ ...good, ...delta }]).code, 'DATABASE_RESPONSE_INVALID');
  }
  for (const v of [good,[],[good,good],null]) assert.equal(parseOrdinaryApplication(v).code, 'DATABASE_RESPONSE_INVALID');
});
const empty = { application_id: null, payment_refunded_total_minor: null, payment_status: null, booking_payment_status: null };
for (const reason of ['UNAVAILABLE','EVIDENCE_REQUIRES_REVIEW','HISTORICAL_IDENTITY_MISMATCH','REQUEST_BINDING_MISSING','IDENTITY_MISMATCH','COMPENSATION_RESERVED','STATE_REQUIRES_REVIEW','CAPACITY_EXCEEDED','PAYMENT_TOTAL_INCONSISTENT','BOOKING_COLLECTION_UNPROVEN','BOOKING_TOTAL_INCONSISTENT']) {
  test(`manual reason ${reason}`, () => assert.equal(parseOrdinaryApplication([{ ...empty, outcome: 'manual_review', reason_code: reason }]).code, 'APPLICATION_REVIEW'));
}
test('only exact conflict reasons and null payloads accepted', () => {
  for (const reason of ['EVIDENCE_CONSUMED','REQUEST_CONSUMED']) assert.equal(parseOrdinaryApplication([{ ...empty, outcome: 'conflict', reason_code: reason }]).code, 'TARGET_CONFLICT');
  assert.equal(parseOrdinaryApplication([{ ...good, outcome: 'conflict', reason_code: 'EVIDENCE_CONSUMED' }]).code, 'DATABASE_RESPONSE_INVALID');
  assert.equal(parseOrdinaryApplication([{ ...empty, outcome: 'manual_review', reason_code: 'unknown' }]).code, 'DATABASE_RESPONSE_INVALID');
});
const comp = { evidence_id: receiptId, obligation_id: context.obligationId, outcome: 'ordinary_applied', payment_outcome: 'unchanged' };
for (const field of ['outcome','payment_outcome'] as const) for (const [i,v] of badValues(comp[field]).entries()) test(`compensation scalar ${field} ${i}`, () => {
  assert.equal(parseCompensationApplication([{ ...comp, [field]: v }],receiptId,context.obligationId).code,'DATABASE_RESPONSE_INVALID');
});
test('compensation cross-workflow shapes are terminal, success needs intended target', () => {
  for (const v of [comp,{ ...comp, obligation_id: null, payment_outcome: 'not_correlated' }]) {
    assert.deepEqual(parseCompensationApplication([v],receiptId,context.obligationId), { code: 'CROSS_WORKFLOW_CONFLICT', disposition: 'manual_review' });
  }
  for (const v of [{ ...comp, obligation_id: receiptId },{ ...comp, outcome: 'applied', obligation_id: null, payment_outcome: 'not_correlated' },{ ...comp, obligation_id: null }]) assert.equal(parseCompensationApplication([v],receiptId,context.obligationId).code,'DATABASE_RESPONSE_INVALID');
});
test('ordinary context binds requested identity and partial amount', () => {
  const ordinary = { ...row, refund_request_id: context.obligationId, request_status: 'pending', amount_minor: 100 };
  assert.equal(parseOrdinaryContext([ordinary],context.obligationId)?.amountMinor,100);
  for (const delta of [{ provider_refund_id: null }, { refund_request_id: receiptId }, { payment_id: null }, { booking_id: null }]) assert.equal(parseOrdinaryContext([{ ...ordinary,...delta }],context.obligationId),null);
  for (const v of badValues('pending')) assert.equal(parseOrdinaryContext([{ ...ordinary, request_status: v }],context.obligationId),null);
});

test('ordinary success cannot refund less than current request or claim booking full while payment partial', () => {
  assert.equal(parseOrdinaryApplication([good],101).code,'DATABASE_RESPONSE_INVALID');
  assert.equal(parseOrdinaryApplication([{ ...good,booking_payment_status:'refunded' }]).code,'DATABASE_RESPONSE_INVALID');
});
