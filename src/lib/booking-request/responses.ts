import type { Database } from '../supabase/database.types';
import { normalizeUuid, type CustomerConfirmation, type SubmissionResult } from './model';

type Views = Database['public']['Views'];
type SubmissionRow = Database['public']['Functions']['submit_booking_request_local']['Returns'][number];

function text(value: string | null): string {
  if (!value) throw new Error('Incomplete customer response');
  return value;
}
function id(value: string | null): string {
  const result = normalizeUuid(value ?? undefined);
  if (!result) throw new Error('Invalid customer identifier');
  return result;
}
function money(value: number | null): number {
  if (value === null || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid customer amount');
  return value;
}

export function toSubmissionResult(row: SubmissionRow): SubmissionResult {
  return {
    bookingId: id(row.submitted_booking_id), bookingReference: text(row.booking_reference), status: text(row.status),
    customerTotalMinor: money(row.customer_total_minor), depositAmountMinor: money(row.deposit_amount_minor),
    finalAmountMinor: money(row.final_amount_minor), finalDueAt: text(row.final_due_at),
  };
}

export function toCustomerConfirmation(
  booking: Views['my_booking_summaries']['Row'],
  items: Views['my_booking_item_summaries']['Row'][],
  schedule: Views['my_booking_payment_schedule']['Row'][],
): CustomerConfirmation {
  const bookingId = id(booking.id);
  const currency = text(booking.currency_code);
  return {
    bookingId, bookingReference: text(booking.booking_reference), venueId: id(booking.venue_id),
    bookingStatus: text(booking.booking_status), paymentStatus: text(booking.payment_status),
    eventStartsAt: text(booking.event_starts_at), eventEndsAt: text(booking.event_ends_at),
    guests: booking.guest_count, currency, customerTotalMinor: money(booking.customer_total_minor),
    venueName: booking.venue_name, venueTimezone: booking.venue_timezone,
    items: items.map((item) => {
      if (item.booking_id !== bookingId) throw new Error('Mismatched customer item');
      return { id: id(item.id), spaceId: id(item.space_id), layoutId: item.space_layout_id === null ? null : id(item.space_layout_id),
        startsAt: text(item.item_starts_at), endsAt: text(item.item_ends_at), spaceName: item.space_name, layoutName: item.layout_name };
    }),
    schedule: schedule.map((payment) => {
      if (payment.booking_id !== bookingId || payment.currency_code !== currency
          || (payment.installment_type !== 'deposit' && payment.installment_type !== 'final')) throw new Error('Invalid customer schedule');
      return { id: id(payment.id), installment: payment.installment_type, amountMinor: money(payment.amount_minor),
        currency, dueAt: payment.due_at, status: text(payment.status), paidAt: payment.paid_at };
    }),
  };
}
