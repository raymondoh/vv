import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyAndReconcile, verifyHistoricalEvidence, type VerificationPorts } from './service';
import { context, observation, row, receiptId } from './fixtures.test-helper';
import { failure } from './model';
function fixture(override: Partial<VerificationPorts> = {}) {
  const calls: string[] = [];
  const ports: VerificationPorts = {
    ordinaryContext: async () => { throw new Error('wrong workflow'); },
    applyOrdinary: async () => { throw new Error('wrong workflow'); },
    context: async () => { calls.push('context'); return { data: [row], error: null }; },
    read: async () => { calls.push('read'); return { ok: true, observation }; },
    record: async () => { calls.push('record committed'); return { data: [{ refund_receipt_id: receiptId, recording_result: 'recorded' }], error: null }; },
    reconcile: async () => { calls.push('reconcile'); return { data: [{ evidence_id: receiptId, obligation_id: context.obligationId, outcome: 'applied', payment_outcome: 'updated' }], error: null }; },
    ...override,
  };
  return { ports, calls };
}
const request = { target: { kind: 'compensation' as const, obligationId: context.obligationId }, refundId: 're_Test' };
test('load -> mandatory read -> committed record -> independent reconcile', async () => {
  const { ports, calls } = fixture();
  assert.equal((await verifyAndReconcile(request, ports)).code, 'APPLIED');
  assert.deepEqual(calls, ['context', 'read', 'record committed', 'reconcile']);
});
test('existing canonical evidence converges on replay', async () => {
  const { ports } = fixture({ record: async () => ({ data: [{ refund_receipt_id: receiptId, recording_result: 'existing' }], error: null }) });
  assert.deepEqual(await verifyAndReconcile(request, ports), await verifyAndReconcile(request, ports));
});
test('record survives reconciliation error; return ID for safe retry', async () => {
  const { ports, calls } = fixture({ reconcile: async () => ({ data: null, error: { code: 'database outage' } }) });
  assert.deepEqual(await verifyAndReconcile(request, ports), { stage: 'application', target: request.target, code: 'DATABASE_RETRY', disposition: 'retry', receiptId });
  assert.ok(calls.includes('record committed'));
});
for (const code of ['ACCOUNT_MISMATCH', 'MODE_MISMATCH', 'PROVIDER_RETRY'] as const) {
  test(`reader ${code} cannot record`, async () => {
    const { ports, calls } = fixture({ read: async () => ({ ok: false, decision: failure(code, code === 'PROVIDER_RETRY') }) });
    assert.equal((await verifyAndReconcile(request, ports)).code, code);
    assert.deepEqual(calls, ['context']);
  });
}
test('VV correlation mismatch does not persist mismatched intended evidence', async () => {
  const { ports, calls } = fixture({ context: async () => ({ data: [{ ...row, correlation_status: 'mismatch' }], error: null }) });
  assert.equal((await verifyAndReconcile(request, ports)).code, 'VV_CORRELATION_MISMATCH');
  assert.deepEqual(calls, ['read']);
});
test('unknown obligation does not silently become uncorrelated', async () => {
  const { ports, calls } = fixture({ context: async () => ({ data: [], error: null }) });
  assert.equal((await verifyAndReconcile(request, ports)).code, 'CONTEXT_UNAVAILABLE'); assert.deepEqual(calls, []);
});
test('explicit historical scope records evidence without reconciliation', async () => {
  const { ports } = fixture({ reconcile: async () => ({ data: [{ evidence_id: receiptId, obligation_id: null, outcome: 'unresolved', payment_outcome: 'not_correlated' }], error: null }) });
  assert.deepEqual(await verifyHistoricalEvidence({ refundId: 're_Test', historicalScope: observation.scope }, ports), {
    stage: 'evidence', code: 'VERIFIED_UNCORRELATED', disposition: 'accept', receiptId,
  });
});
test('forged database response rejected after recording', async () => {
  const { ports } = fixture({ reconcile: async () => ({ data: [{ evidence_id: 'wrong', outcome: 'applied' }], error: null }) });
  assert.equal((await verifyAndReconcile(request, ports)).code, 'DATABASE_RESPONSE_INVALID');
});
test('record conflict is manual review; never invokes reconciliation', async () => {
  const { ports, calls } = fixture({ record: async () => ({ data: null, error: { code: '23514' } }) });
  assert.equal((await verifyAndReconcile(request, ports)).code, 'EVIDENCE_CONFLICT'); assert.ok(!calls.includes('reconcile'));
});
test('thrown raw errors never escape', async () => {
  const { ports } = fixture({ record: async () => { throw new Error('private secret SQLSTATE'); } });
  assert.doesNotMatch(JSON.stringify(await verifyAndReconcile(request, ports)), /private secret|SQLSTATE/);
});
test('production boundary is server-only and exposes no creator/legacy authority', () => {
  for (const file of ['rpc.ts', 'service.ts', 'stripe-reader.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /import 'server-only'/);
    assert.doesNotMatch(source, /['"]use server['"]|confirm_payment_refund|refunds\.create|claim_payment_refund|NEXT_PUBLIC_.*SECRET|console\./);
  }
  const rpc = readFileSync(new URL('rpc.ts', import.meta.url), 'utf8');
  assert.match(rpc, /persistSession: false/);
  assert.doesNotMatch(rpc, /\.from\(|createClient.*cookies/);
});
test('pending observation followed by succeeded records only the later success', async () => {
  let pending = true;
  const { ports, calls } = fixture({ read: async () => ({ ok: true, observation: { ...observation,
    refund: { ...observation.refund as object, status: pending ? 'pending' : 'succeeded' } } }) });
  assert.equal((await verifyAndReconcile(request, ports)).code, 'PENDING');
  assert.ok(!calls.includes('record committed'));
  pending = false;
  assert.equal((await verifyAndReconcile(request, ports)).code, 'APPLIED');
  assert.equal(calls.filter(x => x === 'record committed').length, 1);
});
test('new assigned refund or commercial mismatch in trusted context never records', async () => {
  for (const delta of [{ provider_refund_id: 're_Changed' }, { provider_payment_id: 'pi_Changed' }, { provider_charge_id: 'ch_Changed' }, { amount_minor: 10 }, { currency_code: 'USD' }]) {
    const { ports, calls } = fixture({ context: async () => ({ data: [{ ...row, ...delta }], error: null }) });
    assert.equal((await verifyAndReconcile(request, ports)).disposition, 'manual_review');
    assert.ok(!calls.includes('record committed'));
  }
});

for (const field of ['correlation_status', 'recording_result', 'outcome', 'payment_outcome'] as const) {
  const literal = { correlation_status: 'mismatch', recording_result: 'recorded', outcome: 'unresolved', payment_outcome: 'updated' }[field];
  for (const [label, value] of Object.entries({ array: [literal], object: { value: literal }, number: 123, boolean: true, null: null, undefined: undefined })) {
    test(`rejects non-string ${field}: ${label}`, async () => {
      const override: Partial<VerificationPorts> = field === 'correlation_status'
        ? { context: async () => ({ data: [{ ...row, [field]: value }], error: null }) }
        : field === 'recording_result'
          ? { record: async () => ({ data: [{ refund_receipt_id: receiptId, [field]: value }], error: null }) }
          : { reconcile: async () => ({ data: [{ evidence_id: receiptId, obligation_id: context.obligationId, outcome: 'applied', payment_outcome: 'updated', [field]: value }], error: null }) };
      const { ports, calls } = fixture(override);
      const result = await verifyAndReconcile(request, ports);
      assert.equal(result.code, field === 'correlation_status' ? 'CONTEXT_UNAVAILABLE' : 'DATABASE_RESPONSE_INVALID');
      assert.notEqual(result.disposition, 'accept');
      if (field === 'correlation_status') assert.deepEqual(calls, []);
      if (field === 'recording_result') assert.ok(!calls.includes('reconcile'));
      if (field === 'outcome' || field === 'payment_outcome') {
        assert.equal(result.receiptId, receiptId);
        assert.equal(result.disposition, 'retry');
        assert.equal('reconciliation' in result, false);
      }
    });
  }
}

const ordinaryRequest = { target: { kind: 'ordinary' as const, refundRequestId: context.obligationId }, refundId: 're_Test' };
const ordinaryRow = { ...row, refund_request_id: context.obligationId, request_status: 'pending', amount_minor: 100 };
const ordinarySuccess = { application_id: receiptId, outcome: 'applied', reason_code: 'VERIFIED', payment_refunded_total_minor: 100,
  payment_status: 'partially_refunded', booking_payment_status: 'partially_refunded' };
function ordinaryFixture(override: Partial<VerificationPorts> = {}) {
  const result = fixture();
  const ports: VerificationPorts = { ...result.ports,
    context: async () => { throw new Error('compensation context forbidden'); },
    ordinaryContext: async () => { result.calls.push('ordinary context'); return { data: [ordinaryRow], error: null }; },
    read: async () => { result.calls.push('read'); return { ok: true, observation: { ...observation, refund: { ...observation.refund as object, amount: 100 } } }; },
    applyOrdinary: async (target,id) => { assert.equal(target,ordinaryRequest.target.refundRequestId); assert.equal(id,receiptId); result.calls.push('ordinary apply'); return { data: [ordinarySuccess], error: null }; },
    reconcile: async () => { throw new Error('compensation reconcile forbidden'); }, ...override };
  return { calls: result.calls, ports };
}
test('ordinary partial verifies request amount and records before explicit application', async () => {
  const { ports,calls } = ordinaryFixture();
  const r = await verifyAndReconcile(ordinaryRequest,ports);
  assert.equal(r.stage,'application'); assert.equal(r.code,'APPLIED');
  assert.deepEqual(calls,['ordinary context','read','record committed','ordinary apply']);
});
test('ordinary existing evidence and replay preserve application-time snapshots', async () => {
  const { ports } = ordinaryFixture({ record: async () => ({ data: [{ refund_receipt_id: receiptId, recording_result: 'existing' }], error: null }),
    applyOrdinary: async () => ({ data: [{ ...ordinarySuccess, outcome: 'already_applied', reason_code: 'REPLAY' }], error: null }) });
  const a = await verifyAndReconcile(ordinaryRequest,ports);
  assert.deepEqual(a,await verifyAndReconcile(ordinaryRequest,ports)); assert.equal(a.code,'ALREADY_APPLIED');
});
for (const [name,delta] of Object.entries({ missing: { provider_refund_id: null }, conflict: { provider_refund_id: 're_Other' }, wrong: { refund_request_id: receiptId } })) test(`ordinary ${name} binding or target stops before HTTP`, async () => {
  const { ports,calls } = ordinaryFixture({ ordinaryContext: async () => ({ data: [{ ...ordinaryRow,...delta }], error: null }) });
  assert.equal((await verifyAndReconcile(ordinaryRequest,ports)).disposition,'manual_review'); assert.deepEqual(calls,[]);
});
for (const [name,response,code] of [
  ['consumed',{ data: [{ application_id:null,outcome:'conflict',reason_code:'EVIDENCE_CONSUMED',payment_refunded_total_minor:null,payment_status:null,booking_payment_status:null }],error:null },'TARGET_CONFLICT'],
  ['review',{ data: [{ application_id:null,outcome:'manual_review',reason_code:'IDENTITY_MISMATCH',payment_refunded_total_minor:null,payment_status:null,booking_payment_status:null }],error:null },'APPLICATION_REVIEW'],
  ['retry',{ data:null,error:{ code:'40001' } },'DATABASE_RETRY'],
  ['malformed',{ data:[{ ...ordinarySuccess,outcome:['applied'] }],error:null },'DATABASE_RESPONSE_INVALID'],
] as const) test(`ordinary ${name} retains durable receipt`, async () => {
  const { ports } = ordinaryFixture({ applyOrdinary: async () => response });
  const r = await verifyAndReconcile(ordinaryRequest,ports); assert.equal(r.receiptId,receiptId); assert.equal(r.code,code); assert.notEqual(r.disposition,'accept');
});
for (const state of ['pending','requires_action','failed','canceled','unsupported']) test(`ordinary provider ${state} never records/applies`, async () => {
  const { ports,calls } = ordinaryFixture({ read: async () => ({ ok:true,observation:{ ...observation,refund:{ ...observation.refund as object,amount:100,status:state } } }) });
  assert.notEqual((await verifyAndReconcile(ordinaryRequest,ports)).disposition,'accept'); assert.deepEqual(calls,['ordinary context']);
});
for (const code of ['PROVIDER_RETRY','NOT_FOUND','PROVIDER_AUTH_FAILURE','ACCOUNT_MISMATCH','MODE_MISMATCH'] as const) test(`ordinary reader ${code} cannot apply`, async () => {
  const { ports,calls } = ordinaryFixture({ read: async () => ({ ok:false,decision:failure(code,true) }) });
  assert.equal((await verifyAndReconcile(ordinaryRequest,ports)).code,code); assert.deepEqual(calls,['ordinary context']);
});
test('compensation replay remains attributed', async () => {
  const { ports } = fixture({ reconcile: async () => ({ data:[{ evidence_id:receiptId,obligation_id:context.obligationId,outcome:'already_applied',payment_outcome:'unchanged' }],error:null }) });
  assert.equal((await verifyAndReconcile(request,ports)).code,'ALREADY_APPLIED');
});
for (const known of [true,false]) test(`compensation ordinary-applied conflict known=${known}`, async () => {
  const { ports } = fixture({ reconcile: async () => ({ data:[{ evidence_id:receiptId,obligation_id:known?context.obligationId:null,outcome:'ordinary_applied',payment_outcome:known?'unchanged':'not_correlated' }],error:null }) });
  const r = await verifyAndReconcile(request,ports); assert.equal(r.code,'CROSS_WORKFLOW_CONFLICT'); assert.equal(r.disposition,'manual_review'); assert.equal(r.receiptId,receiptId);
});
test('wrong compensation response never authorizes success', async () => {
  const { ports } = fixture({ reconcile: async () => ({ data:[{ evidence_id:receiptId,obligation_id:receiptId,outcome:'applied',payment_outcome:'updated' }],error:null }) });
  assert.equal((await verifyAndReconcile(request,ports)).code,'DATABASE_RESPONSE_INVALID');
});
test('historical evidence has no target and cannot call either financial operation', async () => {
  const { ports,calls } = fixture({ reconcile: async () => { assert.fail('financial RPC'); },applyOrdinary: async () => { assert.fail('ordinary RPC'); } });
  const r = await verifyHistoricalEvidence({ refundId:'re_Test',historicalScope:observation.scope },ports);
  assert.equal(r.stage,'evidence');assert.equal(r.receiptId,receiptId);assert.deepEqual(calls,['read','record committed']);
});
