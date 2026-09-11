import test from 'node:test';
import assert from 'node:assert/strict';
import { hostPage, hostUrl, hostLinks, hostPresentation } from './presentation';
import { mapHostBookings } from './model';
import { summary, item, id } from './fixtures.test-helper';
import { safeBookingReturnPath, bookingLoginUrl } from '../auth/return-path';
import { formatMoney } from '../catalog/money';

test('pagination follows customer bounds, duplicate rejection and canonical first-page links', () => {
  assert.equal(hostPage(undefined), 1);
  for (const input of ['', '0', '01', '-1', '1.5', '1e2', '10001', ['1'], ['1', '2']]) assert.equal(hostPage(input), null);
  assert.equal(hostPage('10000'), 10000); assert.equal(hostUrl(1), '/host/requests');
  assert.deepEqual(hostLinks(1, false), { previous: null, next: null });
  assert.deepEqual(hostLinks(2, true), { previous: '/host/requests', next: '/host/requests?page=3' });
  assert.equal(hostLinks(10000, true).next, null);
});
test('host auth returns allow only canonical queue/detail URLs', () => {
  assert.equal(safeBookingReturnPath('/host'), '/host/requests');
  assert.equal(safeBookingReturnPath('/host/requests?page=1'), '/host/requests');
  assert.equal(safeBookingReturnPath('/host/requests?page=2'), '/host/requests?page=2');
  assert.equal(safeBookingReturnPath(`/host/bookings/${id()}`), `/host/bookings/${id()}`);
  assert.equal(new URL(bookingLoginUrl('/host/requests?page=2'), 'https://vv.invalid').searchParams.get('next'), '/host/requests?page=2');
  for (const path of ['//evil.test', 'https://evil.test', '/host/requests?page=1&page=2', '/host/requests?page=10001',
    '/host/requests?next=https://evil.test', '/host/requests#x', '/host/requests%0a', '/host/requests/../admin',
    '/host/bookings/nope', `/host/bookings/${id()}?next=/admin`, '/host/requests?x=%5c']) assert.equal(safeBookingReturnPath(path), null);
});
test('historical times, neutral fallback and status wording remain truthful', () => {
  const now = Date.parse('2026-09-12T00:00:00Z');
  const booking = mapHostBookings([summary()], [item()])[0];
  const view = hostPresentation(booking, now);
  assert.equal(view.status, 'Awaiting venue review'); assert.equal(view.payment, 'Unpaid');
  assert.equal(view.notice, 'No space is held or reserved yet.');
  assert.match(view.start.text, /1 Oct 2026/); assert.match(view.end.text, /2 Oct 2026/);
  assert.equal(view.spaces[0].name, 'Historical room');
  const fallback = hostPresentation({ ...booking, venueTimezone: 'invalid', customerName: null, notes: null }, now);
  assert.equal(fallback.start.timezone, 'UTC'); assert.equal(fallback.start.fallback, true);
  assert.equal(fallback.customer, 'Customer name unavailable'); assert.equal(fallback.notes, 'No notes supplied');
  assert.equal(hostPresentation({ ...booking, bookingStatus: 'approved_hold', holdExpiresAt: '2026-09-11T00:00:00Z' }, now).status, 'Approved — hold deadline passed');
  assert.equal(hostPresentation({ ...booking, bookingStatus: 'approved_hold', holdExpiresAt: '2026-09-13T00:00:00Z' }, now).status, 'Approved — temporary hold');
});
test('all three amounts reuse the exact minor-unit formatter, including 0/2/3-decimal currencies', () => {
  for (const currencyCode of ['JPY', 'GBP', 'KWD']) {
    const booking = { ...mapHostBookings([summary()])[0], currencyCode };
    const view = hostPresentation(booking, 0);
    assert.equal(view.total, formatMoney(50000, currencyCode)); assert.equal(view.commission, formatMoney(5000, currencyCode));
    assert.equal(view.venueAmount, formatMoney(45000, currencyCode));
  }
});
