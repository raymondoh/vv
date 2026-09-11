import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingLabels, paymentLabels, bookingLabel, reservationNotice, formatEventTime, formatEventTotal } from './presentation';

test('all seven database booking statuses have explicit truthful labels', () => {
  assert.deepEqual(bookingLabels, { requested: 'Awaiting venue review', approved_hold: 'Approved — temporary hold', hold_expired: 'Hold expired', confirmed: 'Confirmed', declined: 'Request declined', cancelled: 'Cancelled', completed: 'Completed' });
});
test('payment statuses are separate and explicit', () => {
  assert.deepEqual(paymentLabels, { unpaid: 'Unpaid', partially_paid: 'Partially paid', paid: 'Paid', partially_refunded: 'Partially refunded', refunded: 'Refunded' });
});
test('requested does not reserve and hold deadline does not mutate lifecycle', () => {
  assert.equal(reservationNotice('requested'), 'No space is held or reserved yet.');
  assert.equal(reservationNotice('confirmed'), null);
  const event = { bookingStatus: 'approved_hold' as const, holdExpiresAt: '2026-10-01T12:00:00Z' };
  assert.equal(bookingLabel(event, Date.parse('2026-10-01T11:00:00Z')), 'Approved — temporary hold');
  for (const now of ['2026-10-01T12:00:00Z', '2026-10-01T13:00:00Z']) assert.equal(bookingLabel(event, Date.parse(now)), 'Approved — hold deadline passed');
  assert.equal(event.bookingStatus, 'approved_hold');
  assert.equal(bookingLabel({ bookingStatus: 'requested', holdExpiresAt: null }, 0), 'Awaiting venue review');
});
test('historical timezone handles overnight instants', () => {
  const start = formatEventTime('2026-07-01T22:00:00Z', 'Europe/London');
  const end = formatEventTime('2026-07-02T01:00:00Z', 'Europe/London');
  assert.equal(start.text, '1 Jul 2026, 23:00'); assert.equal(end.text, '2 Jul 2026, 02:00');
  assert.equal(start.timezone, 'Europe/London'); assert.equal(start.fallback, false);
});
test('invalid/missing timezone falls back visibly to UTC; invalid date fails safely', () => {
  for (const zone of ['Invalid/Zone', null]) {
    assert.deepEqual(formatEventTime('2026-07-01T22:00:00Z', zone), { text: '1 Jul 2026, 22:00', timezone: 'UTC', fallback: true });
  }
  assert.equal(formatEventTime('2026-02-30T12:00:00Z', 'Europe/London').text, 'Date unavailable');
  assert.equal(formatEventTime('2026-07-01T22:00', 'Europe/London').text, 'Date unavailable');
});
test('DST uses the offset appropriate to the persisted instant', () => {
  assert.equal(formatEventTime('2026-03-29T00:30:00Z', 'Europe/London').text, '29 Mar 2026, 00:30');
  assert.equal(formatEventTime('2026-03-29T01:30:00Z', 'Europe/London').text, '29 Mar 2026, 02:30');
});
test('money delegates to the existing minor-unit formatter', () => {
  assert.match(formatEventTotal({ customerTotalMinor: 50000, currencyCode: 'GBP' }), /GBP\s500\.00/);
  assert.throws(() => formatEventTotal({ customerTotalMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: 'GBP' }));
});

test('shared money display preserves every minor unit across currency conventions', () => {
  const cases: [number, string, string][] = [
    [12345, 'GBP', 'GBP\u00a0123.45'],
    [12345, 'JPY', 'JPY\u00a012,345'],
    [12345, 'KWD', 'KWD\u00a012.345'],
    [0, 'GBP', 'GBP\u00a00.00'], [0, 'JPY', 'JPY\u00a00'], [0, 'KWD', 'KWD\u00a00.000'],
    [Number.MAX_SAFE_INTEGER, 'GBP', 'GBP\u00a090,071,992,547,409.91'],
    [Number.MAX_SAFE_INTEGER, 'KWD', 'KWD\u00a09,007,199,254,740.991'],
    [Number.MAX_SAFE_INTEGER, 'JPY', 'JPY\u00a09,007,199,254,740,991'],
    [12345, 'DEM', 'DEM\u00a0123.45'],
  ];
  for (const [customerTotalMinor, currencyCode, expected] of cases) {
    assert.equal(formatEventTotal({ customerTotalMinor, currencyCode }), expected);
  }
  for (const amount of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatEventTotal({ customerTotalMinor: amount, currencyCode: 'GBP' }));
  }
});
