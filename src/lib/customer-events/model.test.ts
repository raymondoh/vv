import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_ORDER, ITEM_ORDER, MAX_PAGE, mapEvents, parsePage, readEventsPage, type SummaryRow, type ItemRow, type EventsSource } from './model';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function summary(n = 1): SummaryRow {
  return { id: id(n), booking_reference: `VV-${n}`, created_at: '2026-09-11T12:00:00Z', submitted_at: '2026-09-11T12:00:00Z',
    venue_name: 'Historical venue', venue_timezone: 'Europe/London', event_starts_at: '2026-10-01T18:00:00Z', event_ends_at: '2026-10-02T01:00:00Z',
    event_type: 'Dinner', guest_count: 20, booking_status: 'requested', payment_status: 'unpaid', hold_expires_at: null,
    currency_code: 'GBP', customer_total_minor: 50000 };
}
function item(n = 1, booking = 1): ItemRow {
  return { id: id(n + 100), booking_id: id(booking), space_id: id(200), space_layout_id: id(201),
    item_starts_at: '2026-10-01T18:00:00Z', item_ends_at: '2026-10-02T01:00:00Z', sort_order: 0,
    space_name: 'Historical room', layout_name: 'Historical layout' };
}
test('one booking preserves historical fields and projects only approved data', () => {
  const [event] = mapEvents([summary()], [item()]);
  assert.equal(event.venueName, 'Historical venue');
  assert.equal(event.items[0].historicalSpaceName, 'Historical room');
  assert.equal(event.items[0].historicalLayoutName, 'Historical layout');
  assert.equal(event.customerTotalMinor, 50000);
  assert.equal('venue_id' in event, false);
  assert.equal('booking_id' in event.items[0], false);
});
test('multiple bookings and items remain associated and deterministically ordered', () => {
  const events = mapEvents([summary(2), summary(1)], [item(3, 1), { ...item(1, 1), sort_order: 1 }, item(2, 1), item(4, 2)]);
  assert.deepEqual(events.map(e => e.bookingId), [id(2), id(1)]);
  assert.deepEqual(events[1].items.map(i => i.itemId), [id(102), id(103), id(101)]);
  assert.equal(events[0].items.length, 1);
  assert.throws(() => mapEvents([summary()], [item(1, 2)]));
  assert.throws(() => mapEvents([summary()], [item(), item()]));
  assert.throws(() => mapEvents([summary(), summary()], []));
});
test('missing optional historical fields stay null without a live fallback', () => {
  const [event] = mapEvents([{ ...summary(), venue_name: null, venue_timezone: null, event_type: null, guest_count: null }],
    [{ ...item(), space_name: null, layout_name: null, space_layout_id: null }]);
  assert.equal(event.venueName, null); assert.equal(event.venueTimezone, null);
  assert.equal(event.items[0].historicalSpaceName, null); assert.equal(event.items[0].layoutId, null);
});
test('money is a nonnegative safe integer and currency follows the database contract', () => {
  for (const money of [0, 1, Number.MAX_SAFE_INTEGER]) assert.equal(mapEvents([{ ...summary(), customer_total_minor: money }], [])[0].customerTotalMinor, money);
  for (const money of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) assert.throws(() => mapEvents([{ ...summary(), customer_total_minor: money }], []));
  for (const currency of ['gbp', 'GB', 'GBPP', 'G1P', 'G-P', '', null]) assert.throws(() => mapEvents([{ ...summary(), currency_code: currency }], []));
});
test('malformed fields and statuses fail closed', () => {
  for (const patch of [{ id: 'bad' }, { created_at: '2026-02-30T00:00:00Z' }, { submitted_at: '2026-10-01T18:00' },
    { event_ends_at: summary().event_starts_at }, { booking_status: 'approved' }, { payment_status: 'unknown' },
    { guest_count: 0 }, { booking_reference: null }, { booking_status: 'approved_hold', hold_expires_at: null }]) {
    assert.throws(() => mapEvents([{ ...summary(), ...patch }], []));
  }
  for (const patch of [{ id: 'bad' }, { space_id: null }, { sort_order: -1 }, { item_ends_at: 'bad' }, { space_layout_id: 'bad' }]) {
    assert.throws(() => mapEvents([summary()], [{ ...item(), ...patch }]));
  }
});
test('page inputs are strictly positive bounded integers', () => {
  for (const value of [1, '1', MAX_PAGE, String(MAX_PAGE)]) assert.equal(parsePage(value), Number(value));
  for (const value of [0, -1, 1.5, '', ' 1', '1 ', '01', '1e2', '1.0', '+1', undefined, null, ['1'], MAX_PAGE + 1, Infinity]) assert.equal(parsePage(value), null);
});
test('query ordering contract is created_at/id descending and item sort_order/id', () => {
  assert.deepEqual(BOOKING_ORDER, ['created_at', 'id']); assert.deepEqual(ITEM_ORDER, ['sort_order', 'id']);
});
test('fetch 21 summaries, retain 20 and query only retained IDs; page offsets', async () => {
  const rows = Array.from({ length: 21 }, (_, i) => summary(21 - i));
  let calls = 0;
  const result = await readEventsPage(2, {
    summaries: async (from, to) => { assert.equal(from, 20); assert.equal(to, 40); return { data: rows, count: 41, error: null }; },
    items: async ids => { calls++; assert.equal(ids.length, 20); assert.equal(ids.includes(id(1)), false); return { data: [], count: 0, error: null }; },
  });
  assert.equal(result.events.length, 20); assert.equal(result.hasNext, true); assert.equal(calls, 1);
  assert.deepEqual(result.events.map(e => e.bookingId), rows.slice(0, 20).map(r => r.id));
});
test('empty and exactly 20 results have no next page', async () => {
  for (const size of [0, 20]) {
    const result = await readEventsPage(1, {
      summaries: async () => ({ data: Array.from({ length: size }, (_, i) => summary(i + 1)), count: size, error: null }),
      items: async () => { assert.notEqual(size, 0); return { data: [], count: 0, error: null }; },
    });
    assert.equal(result.hasNext, false); assert.equal(result.events.length, size);
  }
});
test('child pagination advances by actual rows under a server cap', async () => {
  const children = [item(1), item(2), item(3)]; const offsets: number[] = [];
  const result = await readEventsPage(1, {
    summaries: async () => ({ data: [summary()], count: 1, error: null }),
    items: async (_ids, from) => { offsets.push(from); return { data: children.slice(from, from + 1), count: 3, error: null }; },
  });
  assert.deepEqual(offsets, [0, 1, 2]); assert.equal(result.events[0].items.length, 3);
});
test('partial, excessive, changing or failed child data cannot become a successful page', async () => {
  const summaries = async () => ({ data: [summary()], count: 1, error: null });
  const cases: EventsSource['items'][] = [
    async () => ({ data: [], count: 1, error: null }),
    async () => ({ data: [item()], count: 10001, error: null }),
    async (_ids, from) => ({ data: [item(from + 1)], count: from ? 3 : 2, error: null }),
    async () => ({ data: null, count: null, error: { message: 'private' } }),
    async () => ({ data: [item()], count: null, error: null }),
    async (_ids, from) => ({ data: [item(from + 1)], count: 101, error: null }),
  ];
  for (const items of cases) await assert.rejects(readEventsPage(1, { summaries, items }));
  await assert.rejects(readEventsPage(1, { summaries: async () => ({ data: [summary()], count: 2, error: null }), items: cases[0] }));
});

test('currency acceptance is structural and includes historical codes', () => {
  for (const currency of ['GBP', 'KWD', 'DEM', 'ZZZ']) {
    assert.equal(mapEvents([{ ...summary(), currency_code: currency }], [])[0].currencyCode, currency);
  }
});
test('every database booking and payment status passes the actual mapper', () => {
  for (const booking_status of ['requested', 'approved_hold', 'hold_expired', 'confirmed', 'declined', 'cancelled', 'completed']) {
    assert.equal(mapEvents([{ ...summary(), booking_status, hold_expires_at: '2026-10-01T12:00:00Z' }], [])[0].bookingStatus, booking_status);
  }
  for (const payment_status of ['unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded']) {
    assert.equal(mapEvents([{ ...summary(), payment_status }], [])[0].paymentStatus, payment_status);
  }
  assert.equal(parsePage(10000), 10000); assert.equal(parsePage(10001), null);
});
test('persisted interval comparisons retain microseconds and account for offsets', () => {
  const pairs = [
    ['2026-01-01T10:00:00Z', '2026-01-01T10:00:01Z'],
    ['2026-01-01T10:00:00.000001Z', '2026-01-01T10:00:00.000002Z'],
    ['2026-01-01T11:00:00.000001+01:00', '2026-01-01T10:00:00.000002Z'],
    ['2026-01-01T05:00:00.000001-05:00', '2026-01-01T10:00:00.000002Z'],
    ['1960-01-01T10:00:00.000001Z', '1960-01-01T10:00:00.000002Z'],
  ];
  for (const [start, end] of pairs) {
    assert.equal(mapEvents([{ ...summary(), event_starts_at: start, event_ends_at: end }], [])[0].startsAt, start);
    assert.throws(() => mapEvents([{ ...summary(), event_starts_at: end, event_ends_at: start }], []));
    assert.throws(() => mapEvents([{ ...summary(), event_starts_at: start, event_ends_at: start }], []));
    assert.equal(mapEvents([summary()], [{ ...item(), item_starts_at: start, item_ends_at: end }])[0].items[0].endsAt, end);
  }
  assert.throws(() => mapEvents([{ ...summary(), event_starts_at: '2026-01-01T11:00:00.000001+01:00', event_ends_at: '2026-01-01T10:00:00.000001Z' }], []));
  assert.throws(() => mapEvents([{ ...summary(), event_starts_at: '2026-01-01T10:00:00.0000001Z' }], []));
});
test('500 and 501 children are retrieved completely with inclusive ranges', async () => {
  for (const count of [500, 501]) {
    const rows = Array.from({ length: count }, (_, i) => item(i + 1));
    const ranges: number[][] = [];
    const result = await readEventsPage(1, {
      summaries: async () => ({ data: [summary()], count: 1, error: null }),
      items: async (_ids, from, to) => { ranges.push([from, to]); return { data: rows.slice(from, to + 1), count, error: null }; },
    });
    assert.equal(result.events[0].items.length, count);
    assert.deepEqual(ranges, count === 500 ? [[0, 499]] : [[0, 499], [500, 999]]);
  }
});
test('duplicate or unexpected associations in later batches fail', async () => {
  for (const last of [item(1), item(501, 2)]) {
    await assert.rejects(readEventsPage(1, {
      summaries: async () => ({ data: [summary()], count: 1, error: null }),
      items: async (_ids, from) => ({ data: from === 0 ? Array.from({ length: 500 }, (_, i) => item(i + 1)) : [last], count: 501, error: null }),
    }));
  }
});
