import { MAX_PAGE, parsePage, type CustomerEvent } from './model';
import { bookingLabel, paymentLabels, reservationNotice, formatEventTime, formatEventTotal } from './presentation';

/** Missing page means page one; duplicates are rejected rather than silently selected. */
export function accountPage(value: string | string[] | undefined): number | null {
  return value === undefined ? 1 : Array.isArray(value) ? null : parsePage(value);
}
export function accountUrl(page: number): string {
  if (parsePage(page) === null) throw new Error('Invalid page');
  return page === 1 ? '/account' : `/account?page=${page}`;
}
export function pageLinks(page: number, hasNext: boolean) {
  return { previous: page > 1 ? accountUrl(page - 1) : null, next: hasNext && page < MAX_PAGE ? accountUrl(page + 1) : null };
}
export function customerEventCard(event: CustomerEvent, now: number) {
  return {
    href: `/account/requests/${event.bookingId}`,
    venueName: event.venueName ?? 'Venue name unavailable',
    reference: event.bookingReference,
    bookingStatus: bookingLabel(event, now), paymentStatus: paymentLabels[event.paymentStatus],
    start: formatEventTime(event.startsAt, event.venueTimezone), end: formatEventTime(event.endsAt, event.venueTimezone),
    guests: event.guests === null ? 'Not specified' : String(event.guests), eventType: event.eventType,
    spaces: event.items.slice(0, 2).map(item => ({
      name: item.historicalSpaceName ?? 'Space name unavailable',
      layout: item.layoutId ? item.historicalLayoutName ?? 'Layout name unavailable' : null,
    })),
    moreSpaces: Math.max(0, event.items.length - 2),
    emptySpaces: event.items.length === 0 ? 'Space details unavailable' : null,
    total: formatEventTotal(event), notice: reservationNotice(event.bookingStatus),
    holdDeadline: event.bookingStatus === 'approved_hold' && event.holdExpiresAt
      ? formatEventTime(event.holdExpiresAt, event.venueTimezone) : null,
  };
}
export type CustomerEventCardModel = ReturnType<typeof customerEventCard>;
