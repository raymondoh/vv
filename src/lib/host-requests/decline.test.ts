import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AuthRetryableFetchError, createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { bookingStatuses, paymentStatuses } from '../customer-events/model';
import { approvalError } from './approval';
import { declineReason, declineBookingId, declineError, declineMessages, canDecline, validDeclinePayload } from './decline';
import { declineRequest, finishDecline } from './decline-request';
import { id } from './fixtures.test-helper';

function form(value = id()) { const data = new FormData(); data.set('bookingId', value); data.set('reason', '  Not available  '); return data; }
const payload = () => [{ declined_booking_id: id(), status: 'declined', booking_payment_status: 'unpaid', installments_cancelled: 2, declined_at: '2026-09-12T12:30:00+00:00' }];
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
  for (const value of ['', 'bad', ` ${id()}`, `${id()}/extra`]) assert.equal(declineBookingId(form(value)), null);
  assert.equal(declineBookingId(new FormData()), null);
  const duplicate = form(); duplicate.append('bookingId', id()); assert.equal(declineBookingId(duplicate), null);
  const file = new FormData(); file.set('bookingId', new Blob(['secret'])); assert.equal(declineBookingId(file), null);
  assert.equal(declineBookingId(form('ABCDEFAB-ABCD-ABCD-ABCD-ABCDEFABCDEF')), 'abcdefab-abcd-abcd-abcd-abcdefabcdef');
});
test('only authenticated RPC is sent; no pre-read or writes; validated success returns only booking ID', async () => {
  const fixture = client();
  assert.deepEqual(await declineRequest(fixture.supabase, form()), { ok: true, bookingId: id() });
  assert.equal(fixture.claims.mock.callCount(), 1);
  assert.deepEqual(fixture.requests, [{ url: 'https://vv.invalid/rest/v1/rpc/decline_booking', method: 'POST', body: { target_booking_id: id(), decline_reason: 'Not available' } }]);
});
test('bad ID never authenticates or calls RPC; missing identity never calls RPC', async () => {
  const fixture = client();
  assert.deepEqual(await declineRequest(fixture.supabase, form('bad')), { ok: false, code: 'UNAVAILABLE' });
  assert.equal(fixture.claims.mock.callCount(), 0); assert.equal(fixture.requests.length, 0);
  const anonymous = client(null, 200, false);
  assert.deepEqual(await declineRequest(anonymous.supabase, form()), { ok: false, code: 'AUTH_REQUIRED' });
  assert.equal(anonymous.requests.length, 0);
});
test('authenticated permission denial and missing booking are indistinguishable, never AUTH_REQUIRED', async () => {
  for (const [code, message] of [['42501', 'You are not permitted to decline this booking'], ['42501', 'Authentication required'],
    ['P0002', 'Booking not found'], ['P0002', 'Booking organization not found'], ['P0002', 'Booking venue not found']]) {
    const fixture = client({ code, message, details: 'secret', hint: 'private' }, 403);
    assert.deepEqual(await declineRequest(fixture.supabase, form()), { ok: false, code: 'UNAVAILABLE' });
  }
});
test('decline and approval race losers are mapped as stale; other errors remain safe', () => {
  for (const status of bookingStatuses.filter(value => value !== 'requested')) {
    assert.equal(declineError({ code: '23514', message: `Only requested bookings may be declined; current status is ${status}` }), 'STALE');
    assert.equal(approvalError({ code: '23514', message: `Booking must be requested before approval; current status is ${status}` }), 'STALE');
  }
  assert.equal(declineError({ code: '23514', message: 'Decline reason must contain between 1 and 1000 characters' }), 'INVALID_REASON');
  for (const message of ['Requested booking must be unpaid before it can be declined', 'Requested booking unexpectedly has reservation allocations', 'Booking cannot be declined while it has an active or successful payment', 'Requested booking unexpectedly has a paid installment']) {
    assert.equal(declineError({ code: '23514', message }), 'INELIGIBLE');
  }
  assert.equal(declineError({ code: 'XX000', message: 'private internals' }), 'UNEXPECTED');
});
test('reasons trim without truncation, reject invalid/duplicate/file values and count Unicode characters', async () => {
  assert.equal(declineReason(form()), 'Not available');
  for (const value of ['', '   ', 'a'.repeat(1001)]) {
    const data = form(); data.set('reason', value);
    const fixture = client();
    assert.equal(declineReason(data), null);
    assert.deepEqual(await declineRequest(fixture.supabase, data), { ok: false, code: 'INVALID_REASON' });
    assert.equal(fixture.requests.length, 0);
  }
  for (const value of ['a', 'a'.repeat(1000), '😀'.repeat(1000)]) {
    const data = form(); data.set('reason', value); assert.equal(declineReason(data), value);
  }
  const missing = form(); missing.delete('reason'); assert.equal(declineReason(missing), null);
  const duplicate = form(); duplicate.append('reason', 'other'); assert.equal(declineReason(duplicate), null);
  const file = form(); file.set('reason', new Blob(['reason'])); assert.equal(declineReason(file), null);
});
test('RPC payload rejects absent/multiple rows, wrong ID/status, invalid counts and invalid deadlines', async () => {
  assert.equal(validDeclinePayload(payload(), id()), true);
  assert.equal(validDeclinePayload([{ ...payload()[0], installments_cancelled: 0 }], id()), true);
  const bad: unknown[] = [null, [], payload()[0], [...payload(), ...payload()], [null],
    ...[{ declined_booking_id: id(2) }, { declined_booking_id: null }, { status: 'confirmed' },
      { booking_payment_status: 'paid' }, { installments_cancelled: -1 }, { installments_cancelled: 1.5 }, { installments_cancelled: '1' },
      { installments_cancelled: Number.MAX_SAFE_INTEGER + 1 }, { declined_at: null },
      { declined_at: '2026-02-30T12:00:00Z' }, { declined_at: '2026-09-12T12:30:00' }].map(patch => [{ ...payload()[0], ...patch }])];
  for (const data of bad) {
    assert.equal(validDeclinePayload(data, id()), false);
    assert.deepEqual(await declineRequest(client(data).supabase, form()), { ok: false, code: 'UNEXPECTED' });
  }
});
test('unexpected database and thrown auth errors never leak raw details', async () => {
  assert.deepEqual(await declineRequest(client({ code: 'XX000', message: 'private SQL', details: 'private snapshot' }, 500).supabase, form()), { ok: false, code: 'UNEXPECTED' });
  const fixture = client(); mock.method(fixture.supabase.auth, 'getClaims', async () => { throw new Error('private stack'); });
  assert.deepEqual(await declineRequest(fixture.supabase, form()), { ok: false, code: 'UNEXPECTED' });
  assert.equal(fixture.requests.length, 0);
  for (const message of Object.values(declineMessages)) assert.doesNotMatch(message, /42501|23P01|snapshot|SQL|provider/);
});
test('visibility requires all three safe-view conditions; every later state remains read-only', () => {
  for (const bookingStatus of bookingStatuses) for (const paymentStatus of paymentStatuses) for (const organizationStatus of ['active', 'suspended', 'closed']) {
    assert.equal(canDecline({ bookingStatus, paymentStatus, organizationStatus }), bookingStatus === 'requested' && paymentStatus === 'unpaid' && organizationStatus === 'active');
  }
});
test('validated success refreshes four affected routes then redirects; stale refreshes without fake success', () => {
  const events: string[] = [];
  const effects = { revalidate: (path: string) => { events.push(path); }, redirect: (path: string): never => { events.push(`redirect:${path}`); throw new Error('redirect'); } };
  const paths = ['/host/requests', `/host/bookings/${id()}`, '/account', `/account/requests/${id()}`];
  assert.throws(() => finishDecline({ ok: true, bookingId: id() }, id(), effects), /redirect/);
  assert.deepEqual(events, [...paths, `redirect:/host/bookings/${id()}`]);
  events.length = 0;
  assert.deepEqual(finishDecline({ ok: false, code: 'STALE' }, id(), effects), { code: 'STALE' });
  assert.deepEqual(events, paths);
  events.length = 0;
  assert.deepEqual(finishDecline({ ok: false, code: 'UNEXPECTED' }, id(), effects), { code: 'UNEXPECTED' });
  assert.deepEqual(events, []);
  assert.throws(() => finishDecline({ ok: false, code: 'AUTH_REQUIRED' }, id(), effects), /redirect/);
  assert.deepEqual(events, [`redirect:/login?next=${encodeURIComponent(`/host/bookings/${id()}`)}`]);
});
test('pending architecture uses React action state, disabled semantic submit and refresh after stale result', () => {
  const source = readFileSync('src/app/host/bookings/[bookingId]/decline-form.tsx', 'utf8');
  assert.match(source, /useActionState/); assert.match(source, /<form action=\{action\} aria-busy=\{pending\}/);
  assert.match(source, /type="submit" disabled=\{pending\}/); assert.match(source, /pending \? 'Declining…'/);
  assert.match(source, /router.refresh\(\)/); assert.match(source, /role="alert"/);
  assert.match(source, /enabled && <form/);
  assert.match(source, /htmlFor="decline-reason"[^>]*>Reason for declining/);
  assert.match(source, /<textarea id="decline-reason" name="reason" required/);
  assert.match(source, /internal booking history and is not currently shown to the customer/);
  assert.match(source, /'Decline request'/);
  assert.doesNotMatch(source, /window\.confirm|service_role/);
});

test('authentication service transport failure returns retry, not login, and never invokes RPC', async () => {
  const fixture = client();
  mock.method(fixture.supabase.auth, 'getClaims', async () => ({ data: null, error: new AuthRetryableFetchError('private transport detail', 503) }));
  assert.deepEqual(await declineRequest(fixture.supabase, form()), { ok: false, code: 'UNEXPECTED' });
  assert.equal(fixture.requests.length, 0);
});


test('approval and decline sibling keys remain distinct for the same booking', () => {
  const source = readFileSync('src/app/host/bookings/[bookingId]/page.tsx', 'utf8');
  assert.match(source, /<ApprovalForm key=\{result\.data\.bookingId\}/);
  assert.match(source, /<DeclineForm key=\{`decline:\$\{result\.data\.bookingId\}`\}/);
});
