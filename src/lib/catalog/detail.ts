import type { PublicImage } from './media';
import type { Database } from '../supabase/database.types';
import { selectBasePrice, type VenueCardModel, type RateRow } from './model';

export type VenueDetailModel = {
  heroImage: PublicImage | null;
  id: string; slug: string; name: string; description: string | null;
  timezone: string; currency: string;
  addressLine1: string | null; addressLine2: string | null;
  city: string | null; region: string | null; postalCode: string | null;
  countryCode: string | null; latitude: number | null; longitude: number | null;
  spaces: {
    id: string; slug: string; name: string; description: string | null;
    squareMeters: number | null;
    seatedCapacity: number | null; standingCapacity: number | null; theatreCapacity: number | null;
    basePrice: VenueCardModel['startingPrice'];
    layouts: { id: string; name: string; layoutType: string; description: string | null; capacity: number | null }[];
  }[];
};
export type DetailVenueRow = Database['public']['Views']['catalog_venues']['Row'];
export type DetailSpaceRow = Pick<Database['public']['Tables']['spaces']['Row'],
  'id' | 'venue_id' | 'slug' | 'name' | 'description' | 'square_meters' | 'seated_capacity' | 'standing_capacity' | 'theatre_capacity'>;
export type LayoutRow = Pick<Database['public']['Tables']['space_layouts']['Row'],
  'id' | 'space_id' | 'name' | 'layout_type' | 'description' | 'capacity'>;

export function venuePath(id: string, slug: string) {
  return `/venues/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`;
}

export function canonicalVenueRedirect(venue: Pick<VenueDetailModel, 'id' | 'slug'>, suppliedSlug: string) {
  return suppliedSlug === venue.slug ? null : venuePath(venue.id, venue.slug);
}

export function toVenueDetail(venue: DetailVenueRow, spaces: DetailSpaceRow[], layouts: LayoutRow[], rates: RateRow[], now: Date, heroImage: PublicImage | null = null): VenueDetailModel {
  const { id, slug, name, timezone, default_currency_code: currency } = venue;
  if (!id || !slug || !name || !timezone || !currency) throw new Error('Incomplete public venue summary');
  return {
    heroImage, id, slug, name, timezone, currency, description: venue.description,
    addressLine1: venue.address_line_1, addressLine2: venue.address_line_2,
    city: venue.city, region: venue.region, postalCode: venue.postal_code,
    countryCode: venue.country_code, latitude: venue.latitude, longitude: venue.longitude,
    spaces: spaces.filter((space) => space.venue_id === id).map((space) => ({
      id: space.id, slug: space.slug, name: space.name, description: space.description,
      squareMeters: space.square_meters,
      seatedCapacity: space.seated_capacity, standingCapacity: space.standing_capacity, theatreCapacity: space.theatre_capacity,
      basePrice: selectBasePrice(space.id, currency, timezone, rates, now),
      layouts: layouts.filter((layout) => layout.space_id === space.id).map((layout) => ({
        id: layout.id, name: layout.name, layoutType: layout.layout_type,
        description: layout.description, capacity: layout.capacity,
      })),
    })),
  };
}
