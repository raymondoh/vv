import { normalizeUuid } from '../booking-request/model';
import { timestamp } from '../customer-events/model';
import type { HostBooking } from './model';

export type DeclineCode = 'AUTH_REQUIRED' | 'UNAVAILABLE' | 'STALE' | 'INVALID_REASON' | 'INELIGIBLE' | 'UNEXPECTED';
export type DeclineResult = { ok: true; bookingId: string } | { ok: false; code: DeclineCode };
export type DeclineState = { code?: DeclineCode };
export const declineMessages: Record<DeclineCode, string> = {
  AUTH_REQUIRED: 'Please sign in to continue.',
  UNAVAILABLE: 'This request is unavailable or you do not have permission to decline it.',
  STALE: 'This request is no longer awaiting a decision.',
  INVALID_REASON: 'Enter a reason containing between 1 and 1000 characters.',
  INELIGIBLE: 'This request cannot be declined in its current state. Refresh to check its status.',
  UNEXPECTED: 'We couldn’t verify the decline. Refresh the request to check its status before trying again.',
};
export function declineBookingId(form: FormData): string | null {
  if (!(form instanceof FormData)) return null;
  const values = form.getAll('bookingId');
  return values.length === 1 && typeof values[0] === 'string' ? normalizeUuid(values[0]) : null;
}
export function canDecline(booking: Pick<HostBooking, 'bookingStatus' | 'paymentStatus' | 'organizationStatus'>): boolean {
  return booking.bookingStatus === 'requested' && booking.paymentStatus === 'unpaid' && booking.organizationStatus === 'active';
}
const stale = new Set(['approved_hold', 'hold_expired', 'confirmed', 'declined', 'cancelled', 'completed']
  .map(status => `Only requested bookings may be declined; current status is ${status}`));
const inconsistent = new Set([
  'Requested booking must be unpaid before it can be declined',
  'Requested booking unexpectedly has reservation allocations',
  'Booking cannot be declined while it has an active or successful payment',
  'Requested booking unexpectedly has a paid installment',
]);
/** Only the authentication boundary produces AUTH_REQUIRED. Never return database text. */
export function declineError({ code, message = '' }: { code?: string; message?: string }): DeclineCode {
  if (code === '42501' || code === 'P0002') return 'UNAVAILABLE';
  if (code === '23514' && stale.has(message)) return 'STALE';
  if (code === '23514' && message === 'Decline reason must contain between 1 and 1000 characters') return 'INVALID_REASON';
  if (code === '23514' && inconsistent.has(message)) return 'INELIGIBLE';
  return 'UNEXPECTED';
}
export function declineReason(form: FormData): string | null {
  if (!(form instanceof FormData)) return null;
  const values = form.getAll('reason');
  if (values.length !== 1 || typeof values[0] !== 'string') return null;
  const reason = values[0].trim();
  // PostgreSQL char_length counts Unicode characters, not UTF-16 code units.
  const length = Array.from(reason).length;
  return length >= 1 && length <= 1000 ? reason : null;
}
export function validDeclinePayload(data: unknown, bookingId: string): boolean {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') return false;
  const row = data[0];
  if (typeof row.declined_booking_id !== 'string' || normalizeUuid(row.declined_booking_id) !== bookingId
    || row.status !== 'declined' || row.booking_payment_status !== 'unpaid'
    || !Number.isSafeInteger(row.installments_cancelled) || row.installments_cancelled < 0) return false;
  try { timestamp(row.declined_at); return true; } catch { return false; }
}
export function declineRefreshPaths(bookingId: string): string[] {
  return ['/host/requests', `/host/bookings/${bookingId}`, '/account', `/account/requests/${bookingId}`];
}
