import { venuePath } from '../catalog/detail';
import { safeBookingReturnPath } from '../auth/return-path';
import { firstValue, parseBookingRequestContext, requestContextParams, type BookingRequestParams, type BookingRequestContext, type BookingErrorCode } from './model';
import { bookingRequestUrl, venueWithBookingContext } from './urls';

export function eventContext(venueId: string, params: BookingRequestParams) {
  const facts = { guests: params.guests, start: params.start, end: params.end };
  const absent = Object.values(facts).every((value) => !firstValue(value)?.trim());
  const parsed = parseBookingRequestContext(venueId, facts, false);
  return { absent, context: parsed.ok ? parsed.data : null };
}

export function eventVenueUrl(venueId: string, slug: string, params: BookingRequestParams): string {
  const { context } = eventContext(venueId, params);
  return context ? venueWithBookingContext(venueId, slug, requestContextParams(context))! : venuePath(venueId, slug);
}

export function authReturnUrl(route: '/login' | '/signup' | '/auth/callback', next: unknown): string {
  const safe = safeBookingReturnPath(next);
  return safe ? `${route}?${new URLSearchParams({ next: safe })}` : route;
}

export function startOverUrl(context: BookingRequestContext): string {
  return bookingRequestUrl(context.venueId, { ...requestContextParams(context), submission: undefined })!;
}

export function layoutSelectable(capacity: number | null, guests: number): boolean {
  return capacity === null || capacity >= guests;
}

export const bookingErrorCopy: Record<BookingErrorCode, string> = {
  AUTH_REQUIRED: 'Please sign in again to continue.',
  INVALID_INPUT: 'Check your request details and try again.',
  SPACE_NO_LONGER_ELIGIBLE: 'This space no longer matches your event details. Choose another space or change your dates.',
  SUBMISSION_CONFLICT: 'This request can’t be reused with different details. Start a new request.',
  VENUE_UNAVAILABLE: 'This venue is not currently accepting new requests.',
  UNPRICED_CONFIGURATION: 'We can’t price this request right now. Please try another option or contact the venue later.',
  UNEXPECTED: 'We couldn’t send your request. Please try again.',
};

export function bookingStatusLabel(status: string): string {
  return status === 'requested' ? 'Awaiting venue review' : status.replaceAll('_', ' ');
}

/** Compare the actual query (including duplicates/unknown keys) with the allowlisted draft URL. */
export function isCanonicalRequestUrl(venueId: string, query: Record<string, string | string[] | undefined>, canonical: string): boolean {
  const original = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) original.append(key, entry);
  }
  return `/venues/${venueId}/request?${original}` === canonical;
}
