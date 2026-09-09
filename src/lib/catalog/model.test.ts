import assert from 'node:assert/strict';
import test from 'node:test';
import { toVenueCard, type VenueRow, type SpaceRow, type RateRow } from './model';
import { formatMoney } from './money';

const venue: VenueRow = {
  id: 'v', slug: 'venue', name: 'Venue', description: null, city: null, region: null,
  country_code: 'US', default_currency_code: 'USD', timezone: 'America/Los_Angeles',
};
const space: SpaceRow = { id: 's', venue_id: 'v', seated_capacity: null, standing_capacity: null, theatre_capacity: null };
const rate: RateRow = {
  id: 'r', space_id: 's', pricing_model: 'hourly', unit_amount_minor: 1000,
  currency_code: 'USD', weekdays: [6], valid_from: '2026-09-06', valid_until: '2026-09-07', priority: 0,
};
// Monday UTC is still Sunday at the venue; valid_until is exclusive.
const now = new Date('2026-09-07T01:00:00Z');
const card = (rates: RateRow[], spaces = [space]) => toVenueCard(venue, spaces, rates, now);

test('venue-local dates, weekdays, exclusive expiry, currency and exact integer amounts', () => {
  assert.equal(card([rate]).startingPrice?.amountMinor, 1000);
  for (const patch of [
    { valid_from: '2026-09-07' }, { valid_until: '2026-09-06' }, { weekdays: [0] },
    { currency_code: 'EUR' }, { unit_amount_minor: -1 }, { unit_amount_minor: 1.5 },
    { unit_amount_minor: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.equal(card([{ ...rate, ...patch }]).startingPrice, null);
  assert.equal(card([{ ...rate, unit_amount_minor: 0 }]).startingPrice?.amountMinor, 0);
});

test('priority wins, ties are ambiguous, and different billing units are not compared', () => {
  const higher = { ...rate, id: 'high', priority: 1, unit_amount_minor: 2000 };
  assert.equal(card([rate, higher]).startingPrice?.amountMinor, 2000);
  assert.equal(card([rate, { ...rate, id: 'tie' }]).startingPrice, null);
  const second = { ...space, id: 's2' };
  assert.equal(card([rate, { ...rate, id: 'r2', space_id: 's2', pricing_model: 'daily' }], [space, second]).startingPrice, null);
  assert.equal(card([rate, { ...rate, id: 'r2', space_id: 's2', unit_amount_minor: 500 }], [space, second]).startingPrice?.amountMinor, 500);
});

test('capacity preserves unknown and zero, takes the maximum, and excludes other venues', () => {
  assert.equal(card([]).maximumCapacity, null);
  assert.equal(card([], [{ ...space, seated_capacity: 0 }]).maximumCapacity, 0);
  assert.equal(card([], [
    { ...space, seated_capacity: 20, theatre_capacity: 80 },
    { ...space, id: 's2', standing_capacity: 100 },
    { ...space, id: 'private', venue_id: 'other', standing_capacity: 900 },
  ]).maximumCapacity, 100);
});

test('currency formatting respects zero-, two- and three-decimal currencies', () => {
  assert.equal(formatMoney(1234, 'USD'), 'USD\u00a012.34');
  assert.equal(formatMoney(1234, 'JPY'), 'JPY\u00a01,234');
  assert.equal(formatMoney(1234, 'KWD'), 'KWD\u00a01.234');
});
