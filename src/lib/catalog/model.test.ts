import { selectHeroAsset, selectGalleryAssets, toSpaceMedia, type SpaceMediaAttachment, toVenueMedia, toPublicImage, type HeroAsset } from './media';
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

test('gallery ordering, captions and explicit public eligibility are preserved', () => {
  const assets = ['a', 'b', 'c'].map((id) => ({ ...heroAsset, id }));
  const attachment = { venue_id: 'v', purpose: 'gallery', sort_order: 2, caption: null };
  const attachments = [
    { ...attachment, media_asset_id: 'c' },
    { ...attachment, media_asset_id: 'b', caption: 'Real caption' },
    { ...attachment, media_asset_id: 'a', sort_order: 1 },
  ];
  const gallery = selectGalleryAssets('v', attachments, assets);
  assert.deepEqual(gallery.map(({ asset }) => asset.id), ['a', 'b', 'c']);
  assert.deepEqual(gallery.map(({ caption }) => caption), [null, 'Real caption', null]);
  for (const patch of [
    { status: 'processing' }, { status: 'failed' }, { status: 'archived' },
    { media_kind: 'video' }, { media_kind: 'document' }, { storage_bucket: 'other' },
  ]) {
    assert.deepEqual(selectGalleryAssets('v', attachments, [assets[0], { ...assets[1], ...patch }, assets[2]])
      .map(({ asset }) => asset.id), ['a', 'c']);
  }
  assert.deepEqual(selectGalleryAssets('v', attachments.map((item) => ({ ...item, purpose: 'hero' })), assets), []);
  assert.deepEqual(selectGalleryAssets('v', [], assets), []);
  assert.deepEqual(selectGalleryAssets('other', attachments, assets), []);
  assert.deepEqual(selectGalleryAssets('v', attachments, [assets[0]]).map(({ asset }) => asset.id), ['a']);
});

test('unsigned gallery objects alone are omitted; detail gets galleries and cards stay hero-only', () => {
  const assets = [heroAsset, { ...heroAsset, id: 'a' }, { ...heroAsset, id: 'b' }];
  const attachments = [
    { ...heroAttachment, sort_order: 0, caption: null },
    { venue_id: 'v', media_asset_id: 'a', purpose: 'gallery', sort_order: 1, caption: 'Caption' },
    { venue_id: 'v', media_asset_id: 'b', purpose: 'gallery', sort_order: 2, caption: null },
  ];
  // No signed URL for b simulates an isolated Storage signing failure.
  const media = toVenueMedia('v', attachments, assets, new Map([['hero', 'https://example.test/hero'], ['a', 'https://example.test/a']]));
  assert.equal(media.heroImage?.id, 'hero');
  assert.deepEqual(media.galleryImages.map((image) => image.id), ['a']);
  assert.equal(media.galleryImages[0].caption, 'Caption');
  assert.deepEqual(toVenueMedia('v', [], assets, new Map()).galleryImages, []);
  const detailVenue = {
    ...venue, address_line_1: null, address_line_2: null, postal_code: null,
    latitude: null, longitude: null, published_at: null,
  };
  const detail = toVenueDetail(detailVenue, [], [], [], now, media.heroImage, media.galleryImages);
  assert.deepEqual(detail.galleryImages, media.galleryImages);
  assert.deepEqual(detail.heroImage, media.heroImage);
  assert.deepEqual(toVenueDetail(detailVenue, [], [], [], now).galleryImages, []);
  const discovery = toVenueCard(venue, [], [], now, media.heroImage);
  assert.equal('galleryImages' in discovery, false);
  assert.deepEqual(discovery.heroImage, media.heroImage);
});

const spaceAttachment: SpaceMediaAttachment = { space_id: 's', media_asset_id: 'hero', purpose: 'hero', sort_order: 0, caption: null };

test('space heroes and galleries are isolated by exact space ID without fallback', () => {
  const assets = [heroAsset, { ...heroAsset, id: 'a' }, { ...heroAsset, id: 'b' }, { ...heroAsset, id: 'c' }];
  const attachments = [
    spaceAttachment,
    { ...spaceAttachment, media_asset_id: 'c', purpose: 'gallery', sort_order: 2 },
    { ...spaceAttachment, media_asset_id: 'b', purpose: 'gallery', sort_order: 2, caption: 'Room detail' },
    { ...spaceAttachment, media_asset_id: 'a', purpose: 'gallery', sort_order: 1 },
  ];
  const urls = new Map(assets.map((asset) => [asset.id, `https://example.test/${asset.id}`]));
  const media = toSpaceMedia('s', attachments, assets, urls);
  assert.equal(media.heroImage?.id, 'hero');
  assert.deepEqual(media.galleryImages.map((image) => image.id), ['a', 'b', 'c']);
  assert.deepEqual(media.galleryImages.map((image) => image.caption), [null, 'Room detail', null]);
  assert.deepEqual(toSpaceMedia('other', attachments, assets, urls), { heroImage: null, galleryImages: [] });
  assert.equal(toSpaceMedia('s', attachments.slice(1), assets, urls).heroImage, null);
  assert.deepEqual(toSpaceMedia('s', [spaceAttachment], assets, urls).galleryImages, []);
  assert.deepEqual(toSpaceMedia('s', [], assets, urls), { heroImage: null, galleryImages: [] });
  assert.deepEqual(toSpaceMedia('s', attachments, [], urls), { heroImage: null, galleryImages: [] });
  for (const purpose of ['floor_plan', 'walkthrough', 'document']) {
    assert.deepEqual(toSpaceMedia('s', [{ ...spaceAttachment, purpose }], assets, urls), { heroImage: null, galleryImages: [] });
  }
});

test('space media eligibility is enforced even with broader operator-visible rows', () => {
  const attachments = [spaceAttachment, { ...spaceAttachment, purpose: 'gallery' }];
  const urls = new Map([['hero', 'https://example.test/hero']]);
  for (const patch of [
    { status: 'processing' }, { status: 'failed' }, { status: 'archived' },
    { media_kind: 'video' }, { media_kind: 'document' }, { storage_bucket: 'other' },
  ]) {
    assert.deepEqual(toSpaceMedia('s', attachments, [{ ...heroAsset, ...patch }], urls), { heroImage: null, galleryImages: [] });
  }
});

test('a missing signed URL omits only that space image and never substitutes other media', () => {
  const assets = [heroAsset, { ...heroAsset, id: 'a' }, { ...heroAsset, id: 'b' }];
  const attachments = [spaceAttachment,
    { ...spaceAttachment, purpose: 'gallery', media_asset_id: 'a', caption: 'Kept' },
    { ...spaceAttachment, purpose: 'gallery', media_asset_id: 'b' }];
  // Hero and b signing failed; a is still rendered in its explicit gallery role.
  const media = toSpaceMedia('s', attachments, assets, new Map([['a', 'https://example.test/a']]));
  assert.equal(media.heroImage, null);
  assert.deepEqual(media.galleryImages.map((image) => image.id), ['a']);
  assert.equal(media.galleryImages[0].caption, 'Kept');
  assert.equal('storage_path' in media.galleryImages[0], false);
  assert.equal('storage_bucket' in media.galleryImages[0], false);
});

test('detail adds exact-space media while preserving pricing, capacities, layouts and discovery', () => {
  const detailVenue = { ...venue, address_line_1: null, address_line_2: null, postal_code: null, latitude: null, longitude: null, published_at: null };
  const detailSpace = { ...space, slug: 'room', name: 'Room', description: 'Description', square_meters: 50, seated_capacity: 20, standing_capacity: 30, theatre_capacity: 25 };
  const layout = { id: 'l', space_id: 's', name: 'Dinner', layout_type: 'banquet', description: null, capacity: 12 };
  const urls = new Map([['hero', 'https://example.test/hero']]);
  const media = toSpaceMedia('s', [spaceAttachment, { ...spaceAttachment, purpose: 'gallery', caption: 'Caption' }], [heroAsset], urls);
  const venueMedia = toVenueMedia('v', [{ ...heroAttachment, sort_order: 0, caption: null }], [heroAsset], urls);
  const spaces = [detailSpace, { ...detailSpace, id: 's2' }];
  const before = toVenueDetail(detailVenue, spaces, [layout], [rate], now, venueMedia.heroImage);
  const after = toVenueDetail(detailVenue, spaces, [layout], [rate], now, venueMedia.heroImage, [], new Map([['s', media]]));
  assert.deepEqual(after, { ...before, spaces: [{ ...before.spaces[0], ...media }, before.spaces[1]] });
  assert.equal(after.spaces[1].heroImage, null);
  assert.deepEqual(after.spaces[1].galleryImages, []);
  assert.equal(after.spaces[0].basePrice?.amountMinor, 1000);
  assert.equal(after.spaces[0].layouts[0].capacity, 12);
  const discovery = toVenueCard(venue, [detailSpace], [rate], now, venueMedia.heroImage);
  assert.equal('spaces' in discovery, false);
  assert.equal('galleryImages' in discovery, false);
  assert.deepEqual(discovery.heroImage, venueMedia.heroImage);
});
