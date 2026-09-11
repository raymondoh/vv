import { formatMoney } from '../catalog/money';
import { timestamp, type BookingStatus, type PaymentStatus, type CustomerEvent } from './model';

export const bookingLabels: Record<BookingStatus, string> = {
  requested: 'Awaiting venue review', approved_hold: 'Approved — temporary hold', hold_expired: 'Hold expired',
  confirmed: 'Confirmed', declined: 'Request declined', cancelled: 'Cancelled', completed: 'Completed',
};
export const paymentLabels: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid', partially_paid: 'Partially paid', paid: 'Paid', partially_refunded: 'Partially refunded', refunded: 'Refunded',
};
export function bookingLabel(event: Pick<CustomerEvent, 'bookingStatus' | 'holdExpiresAt'>, now: number): string {
  if (!Number.isFinite(now)) throw new Error('Invalid display time');
  if (event.bookingStatus === 'approved_hold' && event.holdExpiresAt && Date.parse(timestamp(event.holdExpiresAt)) <= now) {
    return 'Approved — hold deadline passed';
  }
  return bookingLabels[event.bookingStatus];
}
export function reservationNotice(status: BookingStatus): string | null {
  return status === 'requested' ? 'No space is held or reserved yet.' : null;
}
export function formatEventTime(value: string, historicalTimezone: string | null): { text: string; timezone: string; fallback: boolean } {
  let date: Date;
  try { date = new Date(timestamp(value)); }
  catch { return { text: 'Date unavailable', timezone: 'UTC', fallback: true }; }
  let timezone = historicalTimezone ?? 'UTC';
  let fallback = historicalTimezone === null;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(date); }
  catch { timezone = 'UTC'; fallback = true; }
  return { text: new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(date), timezone, fallback };
}
export function formatEventTotal(event: Pick<CustomerEvent, 'customerTotalMinor' | 'currencyCode'>): string {
  return formatMoney(event.customerTotalMinor, event.currencyCode);
}
