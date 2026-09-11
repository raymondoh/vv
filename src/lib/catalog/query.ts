import 'server-only';

import { normalizeCatalogSearch, type CatalogSearch } from './search';

import { getVenueHeroes } from './media-query';

import { createClient } from '../supabase/server';
import { toVenueCard, type SpaceRow, type RateRow } from './model';

export async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error || !data) throw new Error('Public catalog query failed');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function getCatalog(search: CatalogSearch = normalizeCatalogSearch({})) {
  if (search.timeError !== null) throw new Error('Invalid catalog event times');
  const supabase = await createClient();
  // PostgreSQL owns all discovery predicates, ordering and the 24-venue bound.
  // Omit absent arguments to use SQL DEFAULT NULL, as required by generated types.
  const { data: venues, error } = await supabase.rpc('search_catalog_venues', {
    name_query: search.name ?? undefined,
    city_query: search.city ?? undefined,
    guests: search.guests ?? undefined,
    start_local: search.startLocal ?? undefined,
    end_local: search.endLocal ?? undefined,
  });
  if (error || !venues) throw new Error('Public catalog query failed');
  if (!venues.length) return [];
  const ids = venues.map((venue) => {
    if (!venue.id) throw new Error('Missing public venue ID');
    return venue.id;
  });
  // Explicit active filter also applies when signed-in owners have broader RLS access.
  const spaces = await allRows<SpaceRow>((from, to) => supabase.from('spaces')
    .select('id, venue_id, seated_capacity, standing_capacity, theatre_capacity')
    .in('venue_id', ids).eq('status', 'active').order('id').range(from, to));
  const rates: RateRow[] = [];
  for (let start = 0; start < spaces.length; start += 100) {
    const spaceIds = spaces.slice(start, start + 100).map((space) => space.id);
    rates.push(...await allRows<RateRow>((from, to) => supabase.from('catalog_space_rate_plans')
      .select('id, space_id, pricing_model, unit_amount_minor, currency_code, weekdays, valid_from, valid_until, priority')
      .in('space_id', spaceIds).order('id').range(from, to)));
  }
  const heroes = await getVenueHeroes(supabase, ids);
  const now = new Date();
  return venues.map((venue) => toVenueCard(venue, spaces, rates, now, heroes.get(venue.id!) ?? null));
}
