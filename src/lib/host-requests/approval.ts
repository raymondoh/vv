import { normalizeUuid } from '../booking-request/model';
import { timestamp } from '../customer-events/model';
import type { HostBooking } from './model';

export type ApprovalCode = 'AUTH_REQUIRED' | 'UNAVAILABLE' | 'STALE' | 'INVENTORY' | 'INELIGIBLE' | 'UNEXPECTED';
export type ApprovalResult = { ok: true; bookingId: string } | { ok: false; code: ApprovalCode };
export type ApprovalState = { code?: ApprovalCode };
export const approvalMessages: Record<ApprovalCode, string> = {
  AUTH_REQUIRED: 'Please sign in to continue.',
  UNAVAILABLE: 'This request is unavailable or you do not have permission to approve it.',
  STALE: 'This request is no longer awaiting approval.',
  INVENTORY: 'The requested space is no longer available. The request was not approved.',
  INELIGIBLE: 'Current availability or booking rules no longer permit approval.',
  UNEXPECTED: 'We couldn’t verify approval. Refresh the request to check its status before trying again.',
};
export function approvalBookingId(form: FormData): string | null {
  if (!(form instanceof FormData)) return null;
  const values = form.getAll('bookingId');
  return values.length === 1 && typeof values[0] === 'string' ? normalizeUuid(values[0]) : null;
}
export function canApprove(booking: Pick<HostBooking, 'bookingStatus' | 'paymentStatus' | 'organizationStatus'>): boolean {
  return booking.bookingStatus === 'requested' && booking.paymentStatus === 'unpaid' && booking.organizationStatus === 'active';
}
const eligibility = new Set([
  'Booking payment status must be unpaid before approval', 'Booking organization is not active',
  'Booking venue is not currently published', 'Booking contains no reservable spaces',
  'Cannot approve a booking whose event has already started', 'One or more selected spaces are not active',
  'Current space capacity does not accommodate the guest count', 'Selected layout is no longer eligible for this booking',
  'Booking already has active reservation allocations', 'Booking item is shorter than the minimum duration for its space',
  'Booking item exceeds the maximum duration for its space', 'Booking item does not satisfy the minimum notice period',
  'Booking item is beyond the maximum advance-booking period',
]);
const stale = new Set(['approved_hold', 'hold_expired', 'confirmed', 'declined', 'cancelled', 'completed']
  .map(status => `Booking must be requested before approval; current status is ${status}`));
/** Only getClaims may produce AUTH_REQUIRED; an authenticated 42501 is not a login failure. */
export function approvalError(error: { code?: string; message?: string }): ApprovalCode {
  const { code, message = '' } = error;
  if ((code === '42501' && ['Authentication required', 'You are not permitted to approve this booking'].includes(message))
    || (code === 'P0002' && ['Booking not found', 'Booking organization not found', 'Booking venue not found'].includes(message))) return 'UNAVAILABLE';
  if (code === '23514' && stale.has(message)) return 'STALE';
  if (code === '23514' && eligibility.has(message)) return 'INELIGIBLE';
  if (code === '23P01' && ['Booking conflicts with an active venue blackout', 'Booking conflicts with an active space blackout',
    'One or more requested spaces are no longer available'].includes(message)) return 'INVENTORY';
  return 'UNEXPECTED';
}
export function validApprovalPayload(data: unknown, bookingId: string): boolean {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') return false;
  const row = data[0];
  if (typeof row.approved_booking_id !== 'string' || normalizeUuid(row.approved_booking_id) !== bookingId
    || row.status !== 'approved_hold' || !Number.isSafeInteger(row.allocations_created) || row.allocations_created < 1) return false;
  try { timestamp(row.hold_expires_at); return true; } catch { return false; }
}
export function approvalRefreshPaths(bookingId: string): string[] {
  return ['/host/requests', `/host/bookings/${bookingId}`, '/account', `/account/requests/${bookingId}`];
}
