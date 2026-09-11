import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { readQueue, readBooking } from './read';
import { summary, item, id } from './fixtures.test-helper';

function client(reply: (url: URL, headers: Headers) => Response, authenticated = true) {
  const urls: URL[] = [];
  const supabase = createClient<Database>('https://vv.invalid', 'test-placeholder', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => { const url = new URL(String(input)); urls.push(url); return reply(url, new Headers(init?.headers)); } },
  });
  const claims = mock.method(supabase.auth, 'getClaims', async () => ({ data: authenticated ? { claims: { sub: id(900) } } : null, error: null }));
  return { supabase, urls, claims };
}
function json(data: unknown, count?: number) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...(count === undefined ? {} : { 'Content-Range': `0-20/${count}` }) } });
}
test('real builder sends requested-only ascending queue with inclusive range and exact count in one request', async () => {
  const fixture = client((url, headers) => {
    assert.equal(url.pathname, '/rest/v1/operator_booking_summaries');
    assert.equal(url.searchParams.get('booking_status'), 'eq.requested');
    assert.equal(url.searchParams.get('order'), 'submitted_at.asc,id.asc');
    assert.equal(url.searchParams.get('offset'), '20'); assert.equal(url.searchParams.get('limit'), '21');
    assert.equal(url.searchParams.has('organization_id'), false);
    assert.match(headers.get('prefer') ?? '', /count=exact/);
    return json([summary()], 21);
  });
  const result = await readQueue(fixture.supabase, 2);
  assert.equal(result.ok, true); assert.equal(fixture.urls.length, 1); assert.equal(fixture.claims.mock.callCount(), 1);
});
test('detail queries only safe projections; no requested filter; stable item order', async () => {
  const fixture = client(url => {
    if (url.pathname.endsWith('/operator_booking_summaries')) {
      assert.equal(url.searchParams.get('id'), `eq.${id()}`); assert.equal(url.searchParams.has('booking_status'), false);
      return json([{ ...summary(), booking_status: 'confirmed' }]);
    }
    assert.equal(url.pathname, '/rest/v1/operator_booking_item_summaries');
    assert.equal(url.searchParams.get('booking_id'), `eq.${id()}`);
    assert.equal(url.searchParams.get('order'), 'sort_order.asc,id.asc');
    assert.equal(url.searchParams.get('limit'), '500');
    return json([item()], 1);
  });
  const result = await readBooking(fixture.supabase, id());
  assert.equal(result.ok, true); if (result.ok) assert.equal(result.data?.bookingStatus, 'confirmed');
  assert.equal(fixture.urls.length, 2); assert.equal(fixture.claims.mock.callCount(), 1);
});
test('unauthorized identity never queries; invisible and nonexistent detail both return null', async () => {
  const denied = client(() => { throw new Error('must not query'); }, false);
  assert.deepEqual(await readQueue(denied.supabase, 1), { ok: false, code: 'AUTH_REQUIRED' });
  assert.deepEqual(await readBooking(denied.supabase, id()), { ok: false, code: 'AUTH_REQUIRED' });
  assert.equal(denied.urls.length, 0);
  const hidden = client(() => json([]));
  assert.deepEqual(await readBooking(hidden.supabase, id()), { ok: true, data: null });
  assert.equal(hidden.urls.length, 1);
});
test('bad pages/IDs do not query and raw errors never leave the read boundary', async () => {
  const fixture = client(() => new Response(JSON.stringify({ message: 'private database details' }), { status: 500 }));
  assert.deepEqual(await readQueue(fixture.supabase, null), { ok: false, code: 'INVALID_PAGE' });
  assert.deepEqual(await readBooking(fixture.supabase, 'bad'), { ok: false, code: 'INVALID_INPUT' });
  assert.equal(fixture.urls.length, 0);
  assert.deepEqual(await readQueue(fixture.supabase, 1), { ok: false, code: 'UNEXPECTED' });
  assert.deepEqual(await readBooking(fixture.supabase, id()), { ok: false, code: 'UNEXPECTED' });
});
