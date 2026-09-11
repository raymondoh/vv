import test from 'node:test';
import assert from 'node:assert/strict';
import { authReturnUrl, bookingErrorCopy, bookingStatusLabel, eventContext, eventVenueUrl, isCanonicalRequestUrl, layoutSelectable, startOverUrl } from './presentation';
import { bookingRequestUrl } from './urls';
import { parseBookingRequestContext, requestContextParams, resolveDraftSubmissionId } from './model';

const venue = '11111111-1111-4111-8111-111111111111';
const space = '22222222-2222-4222-8222-222222222222';
const submission = '33333333-3333-4333-8333-333333333333';
const facts = { guests: '12', start: '2026-12-10T09:00', end: '2026-12-10T17:00' };
const params = { ...facts, space, submission };
const canonical = bookingRequestUrl(venue, params)!;

test('card and stale-slug detail links carry only a complete valid event', () => {
  const link = new URL(eventVenueUrl(venue, 'linen-house', { ...facts, space, submission }), 'https://vv.invalid');
  assert.equal(link.pathname, `/venues/${venue}/linen-house`);
  assert.deepEqual(Object.fromEntries(link.searchParams), facts);
  for (const query of [{}, { guests: '12' }, { ...facts, end: '' }, { ...facts, guests: 'invalid' }, { ...facts, end: facts.start }]) {
    assert.equal(eventVenueUrl(venue, 'linen-house', query), `/venues/${venue}/linen-house`);
  }
  assert.equal(eventContext(venue, {}).absent, true);
  assert.equal(eventContext(venue, { guests: 'oops' }).absent, false);
  assert.equal(eventContext(venue, { guests: 'oops' }).context, null);
});

test('login signup and callback preserve the same safe request and reject external next', () => {
  for (const route of ['/login', '/signup', '/auth/callback'] as const) {
    assert.equal(new URL(authReturnUrl(route, canonical), 'https://vv.invalid').searchParams.get('next'), canonical);
    for (const next of ['https://evil.test/', '//evil.test/', '/account', '/venues/bad/request']) assert.equal(authReturnUrl(route, next), route);
  }
});

test('draft canonicalization is stable and strips duplicate and unrelated query values', () => {
  assert.equal(isCanonicalRequestUrl(venue, params, canonical), true);
  assert.equal(isCanonicalRequestUrl(venue, { ...params, guests: ['12', '99'] }, canonical), false);
  assert.equal(isCanonicalRequestUrl(venue, { ...params, secret: 'ignored' }, canonical), false);
  assert.equal(isCanonicalRequestUrl(venue, { ...params, submission: undefined }, canonical), false);
  assert.equal(bookingRequestUrl(venue, { ...params, guests: ['12', '99'] }), canonical);
  let generated = 0;
  const mint = () => { generated++; return submission; };
  const established = resolveDraftSubmissionId(undefined, mint);
  assert.equal(resolveDraftSubmissionId(established, mint), submission);
  assert.equal(generated, 1);
});

test('start over drops only submission including preserving a selected layout', () => {
  const parsed = parseBookingRequestContext(venue, { ...params, layout: space });
  assert.equal(parsed.ok, true);
  const before = new URL(bookingRequestUrl(venue, requestContextParams(parsed.data))!, 'https://vv.invalid');
  before.searchParams.delete('submission');
  assert.equal(startOverUrl(parsed.data), before.pathname + before.search);
});

test('layout capacities remain separate from space capacity', () => {
  assert.equal(layoutSelectable(null, 12), true);
  assert.equal(layoutSelectable(12, 12), true);
  assert.equal(layoutSelectable(13, 12), true);
  assert.equal(layoutSelectable(11, 12), false);
});

test('requested label and later lifecycle labels remain truthful', () => {
  assert.equal(bookingStatusLabel('requested'), 'Awaiting venue review');
  for (const status of ['approved', 'confirmed', 'cancelled', 'completed', 'declined']) {
    assert.equal(bookingStatusLabel(status), status);
  }
});

test('all action errors have customer-safe copy', () => {
  assert.equal(Object.keys(bookingErrorCopy).length, 7);
  assert.equal(bookingErrorCopy.AUTH_REQUIRED, 'Please sign in again to continue.');
  assert.equal(bookingErrorCopy.INVALID_INPUT, 'Check your request details and try again.');
  assert.equal(bookingErrorCopy.SPACE_NO_LONGER_ELIGIBLE, 'This space no longer matches your event details. Choose another space or change your dates.');
  assert.equal(bookingErrorCopy.SUBMISSION_CONFLICT, 'This request can’t be reused with different details. Start a new request.');
  assert.equal(bookingErrorCopy.VENUE_UNAVAILABLE, 'This venue is not currently accepting new requests.');
  assert.equal(bookingErrorCopy.UNPRICED_CONFIGURATION, 'We can’t price this request right now. Please try another option or contact the venue later.');
  assert.equal(bookingErrorCopy.UNEXPECTED, 'We couldn’t send your request. Please try again.');
});
