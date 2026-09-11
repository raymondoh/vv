import test from 'node:test';
import assert from 'node:assert/strict';
import { mapHostBookings, readHostPage, readHostDetail } from './model';
import { id, summary, item } from './fixtures.test-helper';

test('host mapping preserves history, strips raw fields and validates commercial amounts', () => {
  const row = { ...summary(), customer_email: 'private', customer_snapshot: { secret: true } };
  const result = mapHostBookings([row], [item(2), item(1)])[0];
  assert.equal(result.venueName, 'Historical venue'); assert.equal(result.customerName, 'Historical customer');
  assert.equal(result.notes, 'Quiet room, please.'); assert.equal(result.commissionMinor, 5000);
  assert.equal(result.venueAmountMinor, 45000); assert.equal('customer_email' in result, false); assert.equal('customer_snapshot' in result, false);
  assert.deepEqual(result.items.map(i => i.itemId), [id(1001), id(1002)]);
  for (const patch of [{ organization_id: 'bad' }, { venue_id: 'bad' }, { organization_status: 'unknown' },
    { marketplace_commission_minor: 0.5 }, { marketplace_commission_minor: Number.MAX_SAFE_INTEGER + 1 },
    { venue_net_before_fees_minor: null }, { venue_net_before_fees_minor: 1 }, { customer_total_minor: -1 },
    { event_starts_at: '2026-02-30T00:00:00Z' }, { booking_status: 'approved' }]) {
    assert.throws(() => mapHostBookings([{ ...summary(), ...patch }]));
  }
});
test('all persisted statuses and inactive organisations remain readable in detail', () => {
  for (const booking_status of ['requested', 'approved_hold', 'hold_expired', 'confirmed', 'declined', 'cancelled', 'completed']) {
    for (const organization_status of ['active', 'suspended', 'closed']) {
      const booking = mapHostBookings([{ ...summary(), booking_status, organization_status, hold_expires_at: '2026-10-01T12:00:00Z', customer_display_name: null, customer_notes: null }])[0];
      assert.equal(booking.bookingStatus, booking_status); assert.equal(booking.customerName, null);
    }
  }
});
test('queue uses inclusive 21-row range and keeps 20, preserving database order', async () => {
  const rows = Array.from({ length: 21 }, (_, n) => summary(n + 1));
  const page = await readHostPage(2, async (from, to) => {
    assert.deepEqual([from, to], [20, 40]); return { data: rows, count: 41, error: null };
  });
  assert.equal(page.hasNext, true); assert.deepEqual(page.bookings.map(b => b.bookingId), rows.slice(0, 20).map(r => r.id));
  for (const size of [0, 20]) {
    const result = await readHostPage(1, async () => ({ data: rows.slice(0, size), count: size, error: null }));
    assert.equal(result.hasNext, false);
  }
  await assert.rejects(readHostPage(1, async () => ({ data: rows.slice(0, 20), count: 21, error: null })));
  for (const data of [[{ ...summary(), booking_status: 'confirmed' }], [summary(), summary()]]) {
    await assert.rejects(readHostPage(1, async () => ({ data, count: data.length, error: null })));
  }
  await assert.rejects(readHostPage(0, async () => { throw new Error('must not fetch'); }));
});
test('detail batches all items under server caps; rejects truncation, duplicates and cross-booking rows', async () => {
  const children = Array.from({ length: 501 }, (_, n) => item(n + 1));
  const offsets: number[] = [];
  const booking = await readHostDetail(summary(), async (from, to) => {
    offsets.push(from); assert.equal(to, from + 499);
    return { data: children.slice(from, from + 200), count: 501, error: null };
  });
  assert.deepEqual(offsets, [0, 200, 400]); assert.equal(booking.items.length, 501);
  for (const data of [[], [item(), item()], [{ ...item(), booking_id: id(2) }]]) {
    await assert.rejects(readHostDetail(summary(), async () => ({ data, count: 2, error: null })));
  }
  assert.equal((await readHostDetail(summary(), async () => ({ data: [], count: 0, error: null }))).items.length, 0);
});
