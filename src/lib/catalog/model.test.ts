import { selectHeroAsset, toPublicImage, type HeroAsset } from './media';
import { toVenueDetail, canonicalVenueRedirect, venuePath } from './detail';
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

test('detail shares discovery pricing and preserves actual capacities and layouts', () => {
  const detailVenue = {
    ...venue, address_line_1: null, address_line_2: null, postal_code: null,
    latitude: null, longitude: null, published_at: null,
  };
  const detailSpace = {
    ...space, slug: 'room', name: 'Room', description: null, square_meters: null,
    seated_capacity: 20, standing_capacity: 30,
  };
  const layout = { id: 'l', space_id: 's', name: 'Dinner', layout_type: 'banquet', description: null, capacity: 12 };
  const detail = toVenueDetail(detailVenue, [detailSpace], [layout], [rate], now);
  assert.deepEqual(detail.spaces[0].basePrice, card([rate], [detailSpace]).startingPrice);
  assert.equal(detail.spaces[0].seatedCapacity, 20);
  assert.equal(detail.spaces[0].standingCapacity, 30);
  assert.equal(detail.spaces[0].theatreCapacity, null);
  assert.equal(detail.spaces[0].layouts[0].capacity, 12);
  const ambiguous = [rate, { ...rate, id: 'tie' }];
  assert.equal(toVenueDetail(detailVenue, [detailSpace], [], ambiguous, now).spaces[0].basePrice, null);
  assert.equal(card(ambiguous).startingPrice, null);
  assert.deepEqual(toVenueDetail(detailVenue, [detailSpace], [], [], now).spaces[0].layouts, []);
  assert.deepEqual(toVenueDetail(detailVenue, [], [layout], [], now).spaces, []);
});

test('canonical URLs use authoritative IDs and the current slug', () => {
  assert.equal(canonicalVenueRedirect({ id: 'id', slug: 'current' }, 'old'), '/venues/id/current');
  assert.equal(canonicalVenueRedirect({ id: 'id', slug: 'current' }, 'current'), null);
  assert.notEqual(venuePath('first', 'same-slug'), venuePath('second', 'same-slug'));
  assert.equal(venuePath('id', 'a/b'), '/venues/id/a%2Fb');
});

const heroAsset: HeroAsset = {
  id: 'hero', status: 'ready', media_kind: 'image', storage_bucket: 'venue-media',
  storage_path: 'organization/hero/photo.jpg', alt_text: null, width_px: 1200, height_px: 800,
};
const heroAttachment = { venue_id: 'v', media_asset_id: 'hero', purpose: 'hero' };

test('only a ready image in the expected bucket and explicit hero attachment is selected', () => {
  assert.equal(selectHeroAsset('v', [heroAttachment], [heroAsset]), heroAsset);
  for (const status of ['processing', 'failed', 'archived']) {
    assert.equal(selectHeroAsset('v', [heroAttachment], [{ ...heroAsset, status }]), null);
  }
  for (const media_kind of ['video', 'document']) {
    assert.equal(selectHeroAsset('v', [heroAttachment], [{ ...heroAsset, media_kind }]), null);
  }
  assert.equal(selectHeroAsset('v', [heroAttachment], [{ ...heroAsset, storage_bucket: 'other' }]), null);
  assert.equal(selectHeroAsset('v', [{ ...heroAttachment, purpose: 'gallery' }], [heroAsset]), null);
  assert.equal(selectHeroAsset('other', [heroAttachment], [heroAsset]), null);
  assert.equal(selectHeroAsset('v', [], [heroAsset]), null);
  assert.equal(selectHeroAsset('v', [heroAttachment], []), null);
});

test('resolved image metadata is identical on discovery/detail and does not expose storage fields', () => {
  const image = toPublicImage(heroAsset, 'https://example.test/signed-image');
  assert.deepEqual(image, { id: 'hero', url: 'https://example.test/signed-image', altText: null, width: 1200, height: 800 });
  assert.equal(toPublicImage({ ...heroAsset, alt_text: 'Courtyard' }, image.url).altText, 'Courtyard');
  const detailVenue = {
    ...venue, address_line_1: null, address_line_2: null, postal_code: null,
    latitude: null, longitude: null, published_at: null,
  };
  assert.deepEqual(toVenueCard(venue, [], [], now, image).heroImage,
    toVenueDetail(detailVenue, [], [], [], now, image).heroImage);
  assert.equal(toVenueCard(venue, [], [], now).heroImage, null);
  assert.equal(toVenueDetail(detailVenue, [], [], [], now).heroImage, null);
});
