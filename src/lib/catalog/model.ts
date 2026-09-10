import type { Database } from '../supabase/database.types';

export type VenueCardModel = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  currency: string;
  maximumCapacity: number | null;
  startingPrice: { amountMinor: number; model: 'hourly' | 'daily' | 'flat' } | null;
};

export type VenueRow = Pick<Database['public']['Views']['catalog_venues']['Row'],
  'id' | 'slug' | 'name' | 'description' | 'city' | 'region' | 'country_code' | 'default_currency_code' | 'timezone'>;
export type SpaceRow = Pick<Database['public']['Tables']['spaces']['Row'],
  'id' | 'venue_id' | 'seated_capacity' | 'standing_capacity' | 'theatre_capacity'>;
export type RateRow = Pick<Database['public']['Views']['catalog_space_rate_plans']['Row'],
  'id' | 'space_id' | 'pricing_model' | 'unit_amount_minor' | 'currency_code' | 'weekdays' | 'valid_from' | 'valid_until' | 'priority'>;

export function toVenueCard(venue: VenueRow, spaces: SpaceRow[], rates: RateRow[], now: Date): VenueCardModel {
  const { id, slug, name, default_currency_code: currency, timezone } = venue;
  if (!id || !slug || !name || !currency || !timezone) throw new Error('Incomplete public venue summary');
  const publicSpaces = spaces.filter((space) => space.venue_id === id);
  const capacities = publicSpaces.flatMap((space) => [space.seated_capacity, space.standing_capacity, space.theatre_capacity])
    .filter((value): value is number => value !== null && Number.isSafeInteger(value) && value >= 0);
  const candidates: NonNullable<VenueCardModel['startingPrice']>[] = [];
  for (const space of publicSpaces) {
    const price = selectBasePrice(space.id, currency, timezone, rates, now);
    if (price) candidates.push(price);
  }
  // Different billing units are not comparable; never advertise a numeric minimum across them.
  const comparable = new Set(candidates.map((price) => price.model)).size === 1;
  const startingPrice = comparable ? candidates.reduce((min, price) => price.amountMinor < min.amountMinor ? price : min) : null;
  return {
    id, slug, name, description: venue.description, city: venue.city, region: venue.region,
    countryCode: venue.country_code, currency,
    maximumCapacity: capacities.length ? Math.max(...capacities) : null,
    startingPrice,
  };
}

/** The single per-space pricing interpretation shared by discovery and detail. */
export function selectBasePrice(spaceId: string, currency: string, timezone: string, rates: RateRow[], now: Date): VenueCardModel['startingPrice'] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const applicable = rates.filter((rate) => rate.space_id === spaceId && rate.currency_code === currency
    && rate.valid_from !== null && rate.valid_from <= date
    && (rate.valid_until === null || date < rate.valid_until) && rate.weekdays?.includes(weekday)
    && rate.priority !== null && Number.isSafeInteger(rate.priority) && rate.priority >= 0);
  const priority = applicable.reduce((max, rate) => Math.max(max, rate.priority!), -1);
  const winners = applicable.filter((rate) => rate.priority === priority);
  // Ambiguous highest-priority plans do not produce a usable public price.
  if (winners.length !== 1) return null;
  const rate = winners[0];
  if (rate.unit_amount_minor === null || !Number.isSafeInteger(rate.unit_amount_minor) || rate.unit_amount_minor < 0) return null;
  if (rate.pricing_model !== 'hourly' && rate.pricing_model !== 'daily' && rate.pricing_model !== 'flat') return null;
  return { amountMinor: rate.unit_amount_minor, model: rate.pricing_model };
}
