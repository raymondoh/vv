import 'server-only';

import { getVenueHeroes } from './media-query';

import { createClient } from '../supabase/server';
import { allRows } from './query';
import { toVenueDetail, type DetailSpaceRow, type LayoutRow } from './detail';
import type { RateRow } from './model';

export async function getVenueDetail(venueId: string) {
  // Invalid UUIDs are missing resources, not Postgres cast errors.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venueId)) return null;
  const supabase = await createClient();
  const { data: venue, error } = await supabase.from('catalog_venues')
    .select('id, slug, name, description, timezone, default_currency_code, published_at, address_line_1, address_line_2, city, region, postal_code, country_code, latitude, longitude')
    .eq('id', venueId).maybeSingle();
  if (error) throw new Error('Public venue query failed');
  if (!venue) return null;
  const spaces = await allRows<DetailSpaceRow>((from, to) => supabase.from('spaces')
    .select('id, venue_id, slug, name, description, square_meters, seated_capacity, standing_capacity, theatre_capacity')
    .eq('venue_id', venueId).eq('status', 'active').order('sort_order').order('id').range(from, to));
  const layouts: LayoutRow[] = [];
  const rates: RateRow[] = [];
  for (let start = 0; start < spaces.length; start += 100) {
    const ids = spaces.slice(start, start + 100).map((space) => space.id);
    layouts.push(...await allRows<LayoutRow>((from, to) => supabase.from('space_layouts')
      .select('id, space_id, name, layout_type, description, capacity')
      .in('space_id', ids).eq('status', 'active').order('sort_order').order('id').range(from, to)));
    rates.push(...await allRows<RateRow>((from, to) => supabase.from('catalog_space_rate_plans')
      .select('id, space_id, pricing_model, unit_amount_minor, currency_code, weekdays, valid_from, valid_until, priority')
      .in('space_id', ids).order('id').range(from, to)));
  }
  if (!venue.id) throw new Error('Missing public venue ID');
  const heroes = await getVenueHeroes(supabase, [venue.id]);
  return toVenueDetail(venue, spaces, layouts, rates, new Date(), heroes.get(venue.id) ?? null);
}
