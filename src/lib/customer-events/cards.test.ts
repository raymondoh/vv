import test from 'node:test';
import assert from 'node:assert/strict';
import { accountPage, pageLinks, customerEventCard } from './cards';
import type { CustomerEvent } from './model';
const event: CustomerEvent = {
  bookingId: '00000000-0000-4000-8000-000000000001', bookingReference: 'VV-TEST', createdAt: '2026-01-01T00:00:00Z', submittedAt: '2026-01-01T00:00:00Z',
  venueName: 'Historical venue', venueTimezone: 'Europe/London', startsAt: '2026-07-01T22:00:00Z', endsAt: '2026-07-02T01:00:00Z',
  eventType: null, guests: 20, bookingStatus: 'requested', paymentStatus: 'unpaid', holdExpiresAt: null, currencyCode: 'GBP', customerTotalMinor: 50000, items: [],
};
const now = Date.parse('2026-01-01T00:00:00Z');
test('requested and confirmed cards use distinct truthful lifecycle wording', () => {
  const requested = customerEventCard(event, now);
  assert.equal(requested.bookingStatus, 'Awaiting venue review'); assert.equal(requested.notice, 'No space is held or reserved yet.');
  const confirmed = customerEventCard({ ...event, bookingStatus: 'confirmed' }, now);
  assert.equal(confirmed.notice, null); assert.equal(confirmed.bookingStatus, 'Confirmed');
  assert.equal(requested.paymentStatus, 'Unpaid'); assert.equal(requested.total, 'GBP\u00a0500.00');
  assert.equal(requested.eventType, null);
  assert.equal(customerEventCard({ ...event, eventType: 'Dinner' }, now).eventType, 'Dinner');
});
test('hold cards show persisted deadline and distinguish passed deadlines', () => {
  const held = { ...event, bookingStatus: 'approved_hold' as const, holdExpiresAt: '2026-01-02T00:00:00Z' };
  assert.equal(customerEventCard(held, now).bookingStatus, 'Approved — temporary hold');
  const passed = customerEventCard(held, Date.parse('2026-01-03T00:00:00Z'));
  assert.equal(passed.bookingStatus, 'Approved — hold deadline passed'); assert.equal(passed.holdDeadline?.text, '2 Jan 2026, 00:00');
});
test('zero, one, two and many spaces preserve names and relevant layouts', () => {
  assert.equal(customerEventCard(event, now).emptySpaces, 'Space details unavailable');
  for (const count of [1, 2, 3, 5]) {
    const items = Array.from({ length: count }, (_, i) => ({ itemId: String(i), spaceId: String(i), layoutId: i === 0 ? 'layout' : null,
      startsAt: event.startsAt, endsAt: event.endsAt, sortOrder: i, historicalSpaceName: `Room ${i}`, historicalLayoutName: i === 0 ? 'Dinner layout' : null }));
    const card = customerEventCard({ ...event, items }, now);
    assert.equal(card.spaces.length, Math.min(count, 2)); assert.equal(card.moreSpaces, Math.max(0, count - 2));
    assert.equal(card.spaces[0].layout, 'Dinner layout'); assert.equal(card.emptySpaces, null);
    if (count > 1) assert.equal(card.spaces[1].layout, null);
  }
});
test('card model is an explicit projection with no financial internals or actions', () => {
  const card = customerEventCard({ ...event, commission: 100, venueNet: 200 } as CustomerEvent, now);
  assert.deepEqual(Object.keys(card), ['href', 'venueName', 'reference', 'bookingStatus', 'paymentStatus', 'start', 'end', 'guests', 'eventType', 'spaces', 'moreSpaces', 'emptySpaces', 'total', 'notice', 'holdDeadline']);
  assert.doesNotMatch(JSON.stringify(card), /Pay now|outstanding balance|commission|venueNet|deposit|installment/i);
  assert.equal(card.href, `/account/requests/${event.bookingId}`);
  assert.equal(card.start.text, '1 Jul 2026, 23:00'); assert.equal(card.end.text, '2 Jul 2026, 02:00');
  assert.equal(customerEventCard({ ...event, venueTimezone: 'Invalid/Zone' }, now).start.timezone, 'UTC');
});
test('page links are canonical and validation never selects duplicates or clamps', () => {
  assert.equal(accountPage(undefined), 1); assert.equal(accountPage('2'), 2);
  for (const value of ['', '0', '-1', '1.5', '10001', ['1'], ['1', '2']]) assert.equal(accountPage(value), null);
  assert.deepEqual(pageLinks(1, true), { previous: null, next: '/account?page=2' });
  assert.deepEqual(pageLinks(2, true), { previous: '/account', next: '/account?page=3' });
  assert.deepEqual(pageLinks(3, false), { previous: '/account?page=2', next: null });
  assert.deepEqual(pageLinks(10000, true), { previous: '/account?page=9999', next: null });
});
