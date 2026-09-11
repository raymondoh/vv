import { MAX_PAGE, parsePage } from '../customer-events/model';
import { bookingLabel, paymentLabels, reservationNotice, formatEventTime } from '../customer-events/presentation';
import { formatMoney } from '../catalog/money';
import type { HostBooking } from './model';

export function hostPage(value: string | string[] | undefined): number | null {
  return value === undefined ? 1 : Array.isArray(value) ? null : parsePage(value);
}
export function hostUrl(page: number): string {
  if (parsePage(page) === null) throw new Error('Invalid page');
  return page === 1 ? '/host/requests' : `/host/requests?page=${page}`;
}
export function hostLinks(page: number, hasNext: boolean) {
  return { previous: page > 1 ? hostUrl(page - 1) : null, next: hasNext && page < MAX_PAGE ? hostUrl(page + 1) : null };
}
export function hostPresentation(booking: HostBooking, now: number) {
  const time = (value: string) => formatEventTime(value, booking.venueTimezone);
  return {
    href: `/host/bookings/${booking.bookingId}`, reference: booking.bookingReference,
    organization: booking.organizationName, organizationStatus: booking.organizationStatus,
    venue: booking.venueName ?? 'Venue name unavailable', customer: booking.customerName?.trim() ? booking.customerName : 'Customer name unavailable',
    notes: booking.notes?.trim() ? booking.notes : 'No notes supplied',
    start: time(booking.startsAt), end: time(booking.endsAt), submitted: time(booking.submittedAt),
    eventType: booking.eventType ?? 'Not specified', guests: booking.guests === null ? 'Not specified' : String(booking.guests),
    status: bookingLabel(booking, now), payment: paymentLabels[booking.paymentStatus], notice: reservationNotice(booking.bookingStatus),
    total: formatMoney(booking.customerTotalMinor, booking.currencyCode), commission: formatMoney(booking.commissionMinor, booking.currencyCode),
    venueAmount: formatMoney(booking.venueAmountMinor, booking.currencyCode),
    holdDeadline: booking.holdExpiresAt ? time(booking.holdExpiresAt) : null,
    spaces: booking.items.map(item => ({ id: item.itemId, name: item.historicalSpaceName ?? 'Space name unavailable',
      layout: item.layoutId ? item.historicalLayoutName ?? 'Layout name unavailable' : null, start: time(item.startsAt), end: time(item.endsAt) })),
  };
}
export type HostPresentation = ReturnType<typeof hostPresentation>;
