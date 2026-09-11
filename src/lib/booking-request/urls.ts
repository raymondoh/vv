import { venuePath } from '../catalog/detail';
import { normalizeCatalogSearch } from '../catalog/search';
import { normalizeUuid, parseBookingRequestContext, type BookingRequestParams } from './model';

export function venueWithBookingContext(venueId: string, slug: string, params: BookingRequestParams): string | null {
  const id = normalizeUuid(venueId);
  const search = normalizeCatalogSearch(params);
  if (!id || !slug || search.timeError !== null) return null;
  const query = new URLSearchParams();
  if (search.guests !== null) query.set('guests', String(search.guests));
  if (search.startLocal !== null) query.set('start', search.startLocal);
  if (search.endLocal !== null) query.set('end', search.endLocal);
  return appendQuery(venuePath(id, slug), query);
}

export function bookingRequestUrl(venueId: string, params: BookingRequestParams): string | null {
  const parsed = parseBookingRequestContext(venueId, params, false);
  if (!parsed.ok) return null;
  const context = parsed.data;
  const query = new URLSearchParams({ guests: String(context.guests), start: context.startLocal, end: context.endLocal });
  if (context.selectedSpaceId) query.set('space', context.selectedSpaceId);
  if (context.selectedLayoutId) query.set('layout', context.selectedLayoutId);
  if (context.submissionId) query.set('submission', context.submissionId);
  return appendQuery(`/venues/${context.venueId}/request`, query);
}

function appendQuery(path: string, query: URLSearchParams): string {
  return query.size ? `${path}?${query.toString()}` : path;
}
