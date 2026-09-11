import type { Database } from '../supabase/database.types';
import { normalizeUuid } from '../booking-request/model';
import { mapEvents, readEventsPage, parsePage, PAGE_SIZE, type Batch, type ItemRow, type CustomerEvent } from '../customer-events/model';

export type HostRow = Database['public']['Views']['operator_booking_summaries']['Row'];
export type HostItemRow = Database['public']['Views']['operator_booking_item_summaries']['Row'];
export type HostBooking = CustomerEvent & {
  organizationName: string; organizationStatus: string; customerName: string | null; notes: string | null;
  commissionMinor: number; venueAmountMinor: number;
};
export type HostPage = { bookings: HostBooking[]; page: number; hasNext: boolean };
export type ReadResult<T> = { ok: true; data: T } | { ok: false; code: 'AUTH_REQUIRED' | 'INVALID_PAGE' | 'INVALID_INPUT' | 'UNEXPECTED' };
function invalid(): never { throw new Error('Invalid host booking data'); }
function money(value: number | null): number {
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
}
function optionalText(value: string | null): string | null {
  return value === null ? null : typeof value === 'string' ? value : invalid();
}
export function mapHostBookings(rows: HostRow[], items: HostItemRow[] = []): HostBooking[] {
  const events = mapEvents(rows, items);
  return events.map((event, index) => {
    const row = rows[index];
    if (!normalizeUuid(row.organization_id ?? '') || !normalizeUuid(row.venue_id ?? '')
      || typeof row.organization_display_name !== 'string' || !row.organization_display_name.trim()
      || !['active', 'suspended', 'closed'].includes(row.organization_status ?? '')) return invalid();
    const commissionMinor = money(row.marketplace_commission_minor), venueAmountMinor = money(row.venue_net_before_fees_minor);
    if (commissionMinor > event.customerTotalMinor || venueAmountMinor !== event.customerTotalMinor - commissionMinor) return invalid();
    return { ...event, organizationName: row.organization_display_name, organizationStatus: row.organization_status!,
      customerName: optionalText(row.customer_display_name), notes: optionalText(row.customer_notes), commissionMinor, venueAmountMinor };
  });
}
export async function readHostPage(page: number, fetch: (from: number, to: number) => PromiseLike<Batch<HostRow>>): Promise<HostPage> {
  if (parsePage(page) === null) return invalid();
  const from = (page - 1) * PAGE_SIZE;
  const result = await fetch(from, from + PAGE_SIZE);
  if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count! < 0
    || result.data.length !== Math.min(PAGE_SIZE + 1, Math.max(0, result.count! - from))) return invalid();
  const bookings = mapHostBookings(result.data);
  if (bookings.some(booking => booking.bookingStatus !== 'requested')) return invalid();
  return { bookings: bookings.slice(0, PAGE_SIZE), page, hasNext: bookings.length > PAGE_SIZE };
}
/** Reuse the customer reader's exact-count batching and item association validation. */
export async function readHostDetail(row: HostRow, fetch: (from: number, to: number) => PromiseLike<Batch<ItemRow>>): Promise<HostBooking> {
  mapHostBookings([row]);
  const result = await readEventsPage(1, {
    summaries: async () => ({ data: [row], count: 1, error: null }),
    items: (_ids, from, to) => fetch(from, to),
  });
  return { ...mapHostBookings([row])[0], items: result.events[0].items };
}
