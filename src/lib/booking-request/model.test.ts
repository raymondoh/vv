import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRequestFields, normalizeUuid, parseBookingRequestContext, resolveDraftSubmissionId } from './model';
import { bookingRequestUrl, venueWithBookingContext } from './urls';
import { bookingLoginUrl, safeBookingReturnPath } from '../auth/return-path';
import { mapBookingError } from './errors';
import { toCustomerConfirmation, toSubmissionResult } from './responses';

const venue = '11111111-1111-4111-8111-111111111111';
const space = '22222222-2222-4222-8222-222222222222';
const submission = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const params = { guests: '100', start: '2026-11-14T18:00', end: '2026-11-15T01:00', space, submission };

test('request requires bounded integer guests', () => {
  for (const guests of [undefined, '', '0', '-1', '100001', '1.5', '1e2', 'NaN', '9'.repeat(100)]) {
    assert.deepEqual(parseBookingRequestContext(venue, { ...params, guests }), { ok: false, code: 'INVALID_INPUT' });
  }
  for (const guests of ['1', '100000', ' 00100 ']) assert.equal(parseBookingRequestContext(venue, { ...params, guests }).ok, true);
});

test('request reuses strict calendar validation and requires an increasing pair', () => {
  assert.equal(parseBookingRequestContext(venue, params).ok, true); // explicit overnight
  assert.equal(parseBookingRequestContext(venue, { ...params, end: '2026-11-14T19:00' }).ok, true);
  assert.equal(parseBookingRequestContext(venue, { ...params, start: '2028-02-29T18:00', end: '2028-03-01T01:00' }).ok, true);
  for (const start of [undefined, '', '2026-02-29T18:00', '1900-02-29T18:00', '0000-01-01T00:00',
    '2026-13-01T18:00', '2026-04-31T18:00', '2026-11-14T24:00', '2026-11-14T18:60',
    '2026-11-14T18:00:00', '2026-11-14T18:00Z', '2026-11-14T18:00+01:00',
    ' 2026-11-14T18:00', '2026-11-14T18:00 ', '2026-11-14']) {
    assert.equal(parseBookingRequestContext(venue, { ...params, start }).ok, false, start);
  }
  for (const end of [undefined, '', params.start, '2026-11-14T17:59']) {
    assert.equal(parseBookingRequestContext(venue, { ...params, end }).ok, false);
  }
});

test('UUID structure, optional selections and established submission identity', () => {
  assert.equal(normalizeUuid(submission.toUpperCase()), submission);
  for (const value of ['', 'not-a-uuid', `{${space}}`, space.replaceAll('-', ''), ` ${space}`, `${space}\n`]) assert.equal(normalizeUuid(value), null);
  assert.equal(parseBookingRequestContext('invalid', params).ok, false);
  assert.equal(parseBookingRequestContext(venue, { ...params, submission: undefined }).ok, false);
  assert.equal(parseBookingRequestContext(venue, { ...params, submission: undefined }, false).ok, true);
  assert.equal(parseBookingRequestContext(venue, { ...params, submission: 'invalid' }, false).ok, false);
  const blank = parseBookingRequestContext(venue, { ...params, space: ' ', layout: '' });
  assert.equal(blank.ok, true);
  if (blank.ok) assert.equal(blank.data.selectedSpaceId, null);
  assert.equal(parseBookingRequestContext(venue, { ...params, layout: venue }).ok, true);
  assert.equal(parseBookingRequestContext(venue, { ...params, space: '', layout: venue }).ok, false);
  assert.equal(parseBookingRequestContext(venue, { ...params, layout: 'bad' }).ok, false);
});

test('all duplicate query parameters use the first value', () => {
  const doubled = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, [value, 'bad']]));
  assert.deepEqual(parseBookingRequestContext(venue, doubled), parseBookingRequestContext(venue, params));
  for (const key of Object.keys(params)) {
    assert.equal(parseBookingRequestContext(venue, { ...params, [key]: ['bad', params[key as keyof typeof params]] }).ok, false);
  }
});

test('request and detail URLs carry only their allowlisted context', () => {
  const input = { ...params, layout: venue, q: 'ignored', city: 'ignored', next: 'https://evil.test', price: '1' };
  const request = bookingRequestUrl(venue, input)!;
  const url = new URL(request, 'https://vv.test');
  assert.equal(url.pathname, `/venues/${venue}/request`);
  assert.deepEqual([...url.searchParams.keys()], ['guests', 'start', 'end', 'space', 'layout', 'submission']);
  assert.equal(url.searchParams.get('submission'), submission);
  assert.ok(request.includes('18%3A00'));
  const detail = new URL(venueWithBookingContext(venue, 'a/b', input)!, 'https://vv.test');
  assert.equal(detail.pathname, `/venues/${venue}/a%2Fb`);
  assert.deepEqual([...detail.searchParams.keys()], ['guests', 'start', 'end']);
  assert.equal(bookingRequestUrl(venue, { ...params, end: params.start }), null);
  assert.equal(venueWithBookingContext(venue, 'venue', { start: params.start }), null);
  assert.equal(venueWithBookingContext(venue, 'venue', {}), `/venues/${venue}/venue`);
});

test('auth return path reconstructs a booking URL and login next safely', () => {
  const url = bookingRequestUrl(venue, params)!;
  assert.equal(safeBookingReturnPath(url), url);
  assert.equal(safeBookingReturnPath(`${url}&next=https%3A%2F%2Fevil.test&q=ignored`), url);
  assert.equal(safeBookingReturnPath(`${url}&guests=1`), url);
  assert.equal(new URL(bookingLoginUrl(url), 'https://vv.test').searchParams.get('next'), url);
  assert.equal(bookingLoginUrl('https://evil.test'), '/login');
});

test('auth return path rejects external, malformed and unexpected paths', () => {
  const url = bookingRequestUrl(venue, params)!;
  for (const bad of [undefined, '', 'https://evil.test', `https://vv.invalid${url}`, `//evil.test${url}`,
    `/\\evil.test${url}`, `${url}\n`, `${url}&x=%0a`, `${url}&x=%5c`, `${url}&x=%ZZ`,
    `${url}#fragment`, '/account', '/login', `/venues/${venue}/../request`, `/venues/bad/request`,
    `/venues/${venue}/request?guests=100`, url.replace('/request?', '/request/?>'),
    url.replace('/venues/', '/%76enues/'), url.replace('submission=', 'submission=invalid'),
  ]) assert.equal(safeBookingReturnPath(bad), null, String(bad));
});

test('draft identity remains stable across retries and canonicalizes existing UUID', () => {
  let calls = 0;
  const generate = () => { calls++; return submission; };
  const first = resolveDraftSubmissionId(undefined, generate);
  assert.equal(first, submission);
  for (let retry = 0; retry < 3; retry++) assert.equal(resolveDraftSubmissionId(first, generate), submission);
  assert.equal(resolveDraftSubmissionId(submission.toUpperCase(), generate), submission);
  assert.equal(calls, 1);
  assert.equal(resolveDraftSubmissionId('invalid', generate), submission); // initial draft establishment only
  assert.equal(calls, 2);
  assert.throws(() => resolveDraftSubmissionId(undefined, () => 'invalid'));
});

test('optional form fields normalize blanks and count Unicode characters', () => {
  assert.deepEqual(normalizeRequestFields(' ', '\t'), { ok: true, data: { eventType: null, notes: null } });
  assert.deepEqual(normalizeRequestFields(' Dinner ', ' Notes '), { ok: true, data: { eventType: 'Dinner', notes: 'Notes' } });
  assert.equal(normalizeRequestFields('x'.repeat(120), '😀'.repeat(2000)).ok, true);
  assert.equal(normalizeRequestFields('x'.repeat(121), '').ok, false);
  assert.equal(normalizeRequestFields('', '😀'.repeat(2001)).ok, false);
  assert.equal(normalizeRequestFields({}, '').ok, false);
});

test('database errors map to stable codes without exposing internal messages', () => {
  for (const [code, message, expected] of [
    ['42501', 'private', 'AUTH_REQUIRED'], ['22023', 'private', 'INVALID_INPUT'],
    ['23514', 'Event type must contain between 1 and 120 characters', 'INVALID_INPUT'],
    ['23P01', 'This space no longer matches your dates and guest count.', 'SPACE_NO_LONGER_ELIGIBLE'],
    ['23505', 'Submission ID has already been used', 'SUBMISSION_CONFLICT'],
    ['23505', 'Submission ID has already been used with different request data', 'SUBMISSION_CONFLICT'],
    ['P0002', 'Venue not found', 'VENUE_UNAVAILABLE'],
    ['23514', 'Venue is not currently published', 'VENUE_UNAVAILABLE'],
    ['23514', 'Selected space has no applicable active rate plan for the event date', 'UNPRICED_CONFIGURATION'],
    ['23514', 'Venue organization has no effective commercial terms', 'UNPRICED_CONFIGURATION'],
    ['23514', 'Selected space has multiple applicable rate plans with the same highest priority', 'UNPRICED_CONFIGURATION'],
    ['23514', 'internal integrity error', 'UNEXPECTED'], ['23505', 'unrelated unique violation', 'UNEXPECTED'],
    ['P0002', 'Authenticated user profile not found', 'UNEXPECTED'], ['23P01', 'unrelated conflict', 'UNEXPECTED'],
  ]) assert.equal(mapBookingError({ code, message }), expected);
  for (const value of [null, new Error('secret'), {}, 'failure']) assert.equal(mapBookingError(value), 'UNEXPECTED');
});

test('submission result exposes only customer fields and rejects unsafe money', () => {
  const row = { submitted_booking_id: submission, booking_reference: 'VV-TEST', status: 'requested',
    customer_total_minor: 100, deposit_amount_minor: 25, final_amount_minor: 75,
    final_due_at: '2026-10-31T18:00:00Z', items_created: 1, commission: 50 };
  const result = toSubmissionResult(row);
  assert.equal('commission' in result, false);
  assert.equal('items_created' in result, false);
  assert.equal(result.bookingId, submission);
  assert.throws(() => toSubmissionResult({ ...row, customer_total_minor: Number.MAX_SAFE_INTEGER + 1 }));
});


test('confirmation uses historical scalar fields and only customer schedule information', () => {
  const booking = {
    id: submission, venue_id: venue, booking_reference: 'VV-TEST', booking_status: 'requested', payment_status: 'unpaid',
    event_starts_at: '2026-11-14T18:00:00Z', event_ends_at: '2026-11-15T01:00:00Z', event_type: 'Dinner',
    guest_count: 100, currency_code: 'GBP', customer_total_minor: 100, hold_expires_at: null,
    submitted_at: '2026-09-11T12:00:00Z', created_at: '2026-09-11T12:00:00Z',
    venue_name: 'Historical venue', venue_timezone: 'Europe/London',
  };
  const item = { id: space, booking_id: submission, space_id: space, space_layout_id: null,
    item_starts_at: booking.event_starts_at, item_ends_at: booking.event_ends_at, sort_order: 0,
    space_name: 'Historical space', layout_name: null };
  const payment = { id: venue, booking_id: submission, sequence: 1, installment_type: 'deposit',
    amount_minor: 25, currency_code: 'GBP', due_at: null, status: 'pending', paid_at: null,
    created_at: booking.created_at, updated_at: booking.created_at };
  const result = toCustomerConfirmation(booking, [item], [payment]);
  assert.equal(result.venueName, 'Historical venue');
  assert.equal(result.items[0].spaceName, 'Historical space');
  assert.equal(result.schedule[0].dueAt, null);
  assert.equal('hold_expires_at' in result, false);
  assert.equal('selection_snapshot' in result.items[0], false);
  assert.throws(() => toCustomerConfirmation(booking, [{ ...item, booking_id: venue }], [payment]));
  assert.throws(() => toCustomerConfirmation(booking, [item], [{ ...payment, currency_code: 'USD' }]));
});

test('return URL decoding accepts encoded values once and rejects encoded route/authority tricks', () => {
  const url = bookingRequestUrl(venue, params)!;
  // URLSearchParams decodes values once; reconstruction emits the canonical encoding.
  assert.equal(safeBookingReturnPath(url.replace('18%3A00', '18%3a00')), url);
  for (const bad of [
    url.replace('/venues/', '/%2fvenues/'),
    url.replace('/venues/', '/%252fvenues/'),
    url.replace('/request?', '/%72equest?'),
    url.replace('/request?', '/%2572equest?'),
    url.replace('18%3A00', '18%253A00'),
    url.replace('submission=', 'submission=%250a'),
    url.replace('submission=', 'submission=%255c'),
    `//user:password@evil.example${url}`,
    `/user@evil.example${url}`,
    url.replace('/venues/', '/%5cvenues/'),
    url.replace('/venues/', '/%255cvenues/'),
  ]) assert.equal(safeBookingReturnPath(bad), null, bad);
  const login = bookingLoginUrl(url);
  const decodedNext = new URL(login, 'https://vv.test').searchParams.get('next');
  assert.equal(decodedNext, url);
  assert.equal(safeBookingReturnPath(decodedNext), url);
});

test('all submission money fields fail closed for unsafe or invalid numbers', () => {
  const row = { submitted_booking_id: submission, booking_reference: 'VV-TEST', status: 'requested',
    customer_total_minor: 100, deposit_amount_minor: 25, final_amount_minor: 75,
    final_due_at: '2026-10-31T18:00:00Z', items_created: 1 };
  for (const field of ['customer_total_minor', 'deposit_amount_minor', 'final_amount_minor']) {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, -1, 0.5]) {
      assert.throws(() => toSubmissionResult({ ...row, [field]: value }), `${field}: ${value}`);
    }
  }
});
