import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AuthRetryableFetchError, createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { bookingStatuses, paymentStatuses } from '../customer-events/model';
import { approvalBookingId, approvalError, approvalMessages, canApprove, validApprovalPayload } from './approval';
import { approveRequest, finishApproval } from './approve';
import { id } from './fixtures.test-helper';

function form(value = id()) { const data = new FormData(); data.set('bookingId', value); return data; }
const payload = () => [{ approved_booking_id: id(), status: 'approved_hold', allocations_created: 2, hold_expires_at: '2026-09-12T12:30:00+00:00' }];
function client(data: unknown = payload(), status = 200, authenticated = true) {
  const requests: { url: string; method: string | undefined; body: unknown }[] = [];
  const supabase = createClient<Database>('https://vv.invalid', 'test-placeholder', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      requests.push({ url: String(url), method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const claims = mock.method(supabase.auth, 'getClaims', async () => ({ data: authenticated ? { claims: { sub: id(900) } } : null, error: null }));
  return { supabase, requests, claims };
}
test('untrusted IDs reject missing, blank, malformed, duplicate and file values; canonicalize valid UUIDs', () => {
  for (const value of ['', 'bad', ` ${id()}`, `${id()}/extra`]) assert.equal(approvalBookingId(form(value)), null);
  assert.equal(approvalBookingId(new FormData()), null);
  const duplicate = form(); duplicate.append('bookingId', id()); assert.equal(approvalBookingId(duplicate), null);
  const file = new FormData(); file.set('bookingId', new Blob(['secret'])); assert.equal(approvalBookingId(file), null);
  assert.equal(approvalBookingId(form('ABCDEFAB-ABCD-ABCD-ABCD-ABCDEFABCDEF')), 'abcdefab-abcd-abcd-abcd-abcdefabcdef');
});
test('only authenticated RPC is sent; no pre-read or writes; validated success returns only booking ID', async () => {
  const fixture = client();
  assert.deepEqual(await approveRequest(fixture.supabase, form()), { ok: true, bookingId: id() });
  assert.equal(fixture.claims.mock.callCount(), 1);
  assert.deepEqual(fixture.requests, [{ url: 'https://vv.invalid/rest/v1/rpc/approve_booking_hold', method: 'POST', body: { target_booking_id: id() } }]);
});
test('bad ID never authenticates or calls RPC; missing identity never calls RPC', async () => {
  const fixture = client();
  assert.deepEqual(await approveRequest(fixture.supabase, form('bad')), { ok: false, code: 'UNAVAILABLE' });
  assert.equal(fixture.claims.mock.callCount(), 0); assert.equal(fixture.requests.length, 0);
  const anonymous = client(null, 200, false);
  assert.deepEqual(await approveRequest(anonymous.supabase, form()), { ok: false, code: 'AUTH_REQUIRED' });
  assert.equal(anonymous.requests.length, 0);
});
test('authenticated permission denial and missing booking are indistinguishable, never AUTH_REQUIRED', async () => {
  for (const [code, message] of [['42501', 'You are not permitted to approve this booking'], ['42501', 'Authentication required'],
    ['P0002', 'Booking not found'], ['P0002', 'Booking organization not found'], ['P0002', 'Booking venue not found']]) {
    const fixture = client({ code, message, details: 'secret', hint: 'private' }, 403);
    assert.deepEqual(await approveRequest(fixture.supabase, form()), { ok: false, code: 'UNAVAILABLE' });
  }
});
test('allowlisted conflict and stale errors are safe; unknown combinations remain generic', () => {
  for (const message of ['Booking conflicts with an active venue blackout', 'Booking conflicts with an active space blackout', 'One or more requested spaces are no longer available']) {
    assert.equal(approvalError({ code: '23P01', message }), 'INVENTORY');
    assert.equal(approvalError({ code: '23514', message }), 'UNEXPECTED');
  }
  for (const status of bookingStatuses.filter(value => value !== 'requested')) {
    assert.equal(approvalError({ code: '23514', message: `Booking must be requested before approval; current status is ${status}` }), 'STALE');
  }
  for (const code of ['23P01', '42501', '23514', 'P0002', '500']) assert.equal(approvalError({ code, message: 'raw private details' }), 'UNEXPECTED');
  assert.equal(approvalError({ code: '23514', message: 'Booking must be requested before approval; current status is invented' }), 'UNEXPECTED');
});
test('each current eligibility failure is allowlisted with its SQLSTATE', () => {
  for (const message of [
    'Booking payment status must be unpaid before approval', 'Booking organization is not active', 'Booking venue is not currently published',
    'Booking contains no reservable spaces', 'Cannot approve a booking whose event has already started', 'One or more selected spaces are not active',
    'Current space capacity does not accommodate the guest count', 'Selected layout is no longer eligible for this booking',
    'Booking already has active reservation allocations', 'Booking item is shorter than the minimum duration for its space',
    'Booking item exceeds the maximum duration for its space', 'Booking item does not satisfy the minimum notice period', 'Booking item is beyond the maximum advance-booking period',
  ]) {
    assert.equal(approvalError({ code: '23514', message }), 'INELIGIBLE');
    assert.equal(approvalError({ code: '42501', message }), 'UNEXPECTED');
  }
});
test('RPC payload rejects absent/multiple rows, wrong ID/status, invalid counts and invalid deadlines', async () => {
  assert.equal(validApprovalPayload(payload(), id()), true);
  const bad: unknown[] = [null, [], payload()[0], [...payload(), ...payload()], [null],
    ...[{ approved_booking_id: id(2) }, { approved_booking_id: null }, { status: 'confirmed' },
      { allocations_created: 0 }, { allocations_created: -1 }, { allocations_created: 1.5 }, { allocations_created: '1' },
      { allocations_created: Number.MAX_SAFE_INTEGER + 1 }, { hold_expires_at: null },
      { hold_expires_at: '2026-02-30T12:00:00Z' }, { hold_expires_at: '2026-09-12T12:30:00' }].map(patch => [{ ...payload()[0], ...patch }])];
  for (const data of bad) {
    assert.equal(validApprovalPayload(data, id()), false);
    assert.deepEqual(await approveRequest(client(data).supabase, form()), { ok: false, code: 'UNEXPECTED' });
  }
});
test('unexpected database and thrown auth errors never leak raw details', async () => {
  assert.deepEqual(await approveRequest(client({ code: 'XX000', message: 'private SQL', details: 'private snapshot' }, 500).supabase, form()), { ok: false, code: 'UNEXPECTED' });
  const fixture = client(); mock.method(fixture.supabase.auth, 'getClaims', async () => { throw new Error('private stack'); });
  assert.deepEqual(await approveRequest(fixture.supabase, form()), { ok: false, code: 'UNEXPECTED' });
  assert.equal(fixture.requests.length, 0);
  for (const message of Object.values(approvalMessages)) assert.doesNotMatch(message, /42501|23P01|snapshot|SQL|provider/);
});
test('visibility requires all three safe-view conditions; every later state remains read-only', () => {
  for (const bookingStatus of bookingStatuses) for (const paymentStatus of paymentStatuses) for (const organizationStatus of ['active', 'suspended', 'closed']) {
    assert.equal(canApprove({ bookingStatus, paymentStatus, organizationStatus }), bookingStatus === 'requested' && paymentStatus === 'unpaid' && organizationStatus === 'active');
  }
});
test('validated success refreshes four affected routes then redirects; stale refreshes without fake success', () => {
  const events: string[] = [];
  const effects = { revalidate: (path: string) => { events.push(path); }, redirect: (path: string): never => { events.push(`redirect:${path}`); throw new Error('redirect'); } };
  const paths = ['/host/requests', `/host/bookings/${id()}`, '/account', `/account/requests/${id()}`];
  assert.throws(() => finishApproval({ ok: true, bookingId: id() }, id(), effects), /redirect/);
  assert.deepEqual(events, [...paths, `redirect:/host/bookings/${id()}`]);
  events.length = 0;
  assert.deepEqual(finishApproval({ ok: false, code: 'STALE' }, id(), effects), { code: 'STALE' });
  assert.deepEqual(events, paths);
  events.length = 0;
  assert.deepEqual(finishApproval({ ok: false, code: 'UNEXPECTED' }, id(), effects), { code: 'UNEXPECTED' });
  assert.deepEqual(events, []);
  assert.throws(() => finishApproval({ ok: false, code: 'AUTH_REQUIRED' }, id(), effects), /redirect/);
  assert.deepEqual(events, [`redirect:/login?next=${encodeURIComponent(`/host/bookings/${id()}`)}`]);
});
test('pending architecture uses React action state, disabled semantic submit and refresh after stale result', () => {
  const source = readFileSync('src/app/host/bookings/[bookingId]/approval-form.tsx', 'utf8');
  assert.match(source, /useActionState/); assert.match(source, /<form action=\{action\} aria-busy=\{pending\}/);
  assert.match(source, /type="submit" disabled=\{pending\}/); assert.match(source, /pending \? 'Approving…'/);
  assert.match(source, /router.refresh\(\)/); assert.match(source, /role="alert"/);
  assert.match(source, /enabled && <form/);
});

test('authentication service transport failure returns retry, not login, and never invokes RPC', async () => {
  const fixture = client();
  mock.method(fixture.supabase.auth, 'getClaims', async () => ({ data: null, error: new AuthRetryableFetchError('private transport detail', 503) }));
  assert.deepEqual(await approveRequest(fixture.supabase, form()), { ok: false, code: 'UNEXPECTED' });
  assert.equal(fixture.requests.length, 0);
});
