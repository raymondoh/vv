import type { Database } from '../supabase/database.types';
import { normalizeUuid } from '../booking-request/model';

export const PAGE_SIZE = 20;
export const MAX_PAGE = 10000;
export const ITEM_BATCH_SIZE = 500;
export const MAX_ITEMS = 10000;
export const BOOKING_ORDER = ['created_at', 'id'] as const;
export const ITEM_ORDER = ['sort_order', 'id'] as const;
export const bookingStatuses = ['requested', 'approved_hold', 'hold_expired', 'confirmed', 'declined', 'cancelled', 'completed'] as const;
export const paymentStatuses = ['unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded'] as const;
export type BookingStatus = typeof bookingStatuses[number];
export type PaymentStatus = typeof paymentStatuses[number];
type Views = Database['public']['Views'];
export type SummaryRow = Omit<Views['my_booking_summaries']['Row'], 'venue_id'>;
export type ItemRow = Views['my_booking_item_summaries']['Row'];
export type CustomerEventItem = {
  itemId: string; spaceId: string; layoutId: string | null; startsAt: string; endsAt: string;
  sortOrder: number; historicalSpaceName: string | null; historicalLayoutName: string | null;
};
export type CustomerEvent = {
  bookingId: string; bookingReference: string; createdAt: string; submittedAt: string;
  venueName: string | null; venueTimezone: string | null; startsAt: string; endsAt: string;
  eventType: string | null; guests: number | null; bookingStatus: BookingStatus; paymentStatus: PaymentStatus;
  holdExpiresAt: string | null; currencyCode: string; customerTotalMinor: number; items: CustomerEventItem[];
};
export type CustomerEventsPage = { events: CustomerEvent[]; page: number; hasNext: boolean };
export type EventsResult = { ok: true; data: CustomerEventsPage } | { ok: false; code: 'INVALID_PAGE' | 'AUTH_REQUIRED' | 'UNEXPECTED' };

export function parsePage(value: unknown): number | null {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 && number <= MAX_PAGE ? number : null;
}
function invalid(): never { throw new Error('Invalid customer event data'); }
function text(value: unknown): string { return typeof value === 'string' && value.trim() ? value : invalid(); }
function optionalText(value: unknown): string | null { return value === null ? null : text(value); }
function uuid(value: unknown): string { return typeof value === 'string' ? normalizeUuid(value) ?? invalid() : invalid(); }
function integer(value: unknown, minimum = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : invalid();
}
function status<T extends string>(value: unknown, allowed: readonly T[]): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : invalid();
}
/** Only persisted timestamps with an explicit offset; reject JS calendar normalization. */
export function timestamp(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return invalid();
  const [, y, m, d, h, minute, second, , , offsetHour, offsetMinute] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(h) > 23 || Number(minute) > 59 || Number(second) > 59
    || Number(offsetHour ?? 0) > 23 || Number(offsetMinute ?? 0) > 59 || !Number.isFinite(Date.parse(value))) return invalid();
  return value;
}
function timestampMicros(value: string): bigint {
  // The caller has validated the persisted timestamp. Date handles only the
  // whole-second instant/offset; all fractional arithmetic remains integer.
  const fraction = /\.(\d{1,6})(?=Z|[+-])/.exec(value);
  const wholeSecond = value.replace(/\.\d{1,6}(?=Z|[+-])/, '');
  return BigInt(Date.parse(wholeSecond)) * 1000n
    + BigInt((fraction?.[1] ?? '').padEnd(6, '0'));
}
function interval(start: unknown, end: unknown): [string, string] {
  const starts = timestamp(start), ends = timestamp(end);
  if (timestampMicros(ends) <= timestampMicros(starts)) return invalid();
  return [starts, ends];
}

export function mapEvents(rows: SummaryRow[], items: ItemRow[]): CustomerEvent[] {
  const seen = new Set<string>();
  const events = rows.map((row): CustomerEvent => {
    const bookingId = uuid(row.id);
    if (seen.has(bookingId)) return invalid();
    seen.add(bookingId);
    const [startsAt, endsAt] = interval(row.event_starts_at, row.event_ends_at);
    const currencyCode = text(row.currency_code);
    if (!/^[A-Z]{3}$/.test(currencyCode)) return invalid();
    const bookingStatus = status(row.booking_status, bookingStatuses);
    const holdExpiresAt = row.hold_expires_at === null ? null : timestamp(row.hold_expires_at);
    if ((bookingStatus === 'approved_hold' || bookingStatus === 'hold_expired') && !holdExpiresAt) return invalid();
    return { bookingId, bookingReference: text(row.booking_reference), createdAt: timestamp(row.created_at),
      submittedAt: timestamp(row.submitted_at), venueName: optionalText(row.venue_name), venueTimezone: optionalText(row.venue_timezone),
      startsAt, endsAt, eventType: optionalText(row.event_type), guests: row.guest_count === null ? null : integer(row.guest_count, 1),
      bookingStatus, paymentStatus: status(row.payment_status, paymentStatuses), holdExpiresAt,
      currencyCode, customerTotalMinor: integer(row.customer_total_minor), items: [] };
  });
  const byId = new Map(events.map((event) => [event.bookingId, event]));
  const itemIds = new Set<string>();
  for (const row of items) {
    const event = byId.get(uuid(row.booking_id));
    const itemId = uuid(row.id);
    if (!event || itemIds.has(itemId)) return invalid();
    itemIds.add(itemId);
    const [startsAt, endsAt] = interval(row.item_starts_at, row.item_ends_at);
    event.items.push({ itemId, spaceId: uuid(row.space_id), layoutId: row.space_layout_id === null ? null : uuid(row.space_layout_id),
      startsAt, endsAt, sortOrder: integer(row.sort_order), historicalSpaceName: optionalText(row.space_name), historicalLayoutName: optionalText(row.layout_name) });
  }
  for (const event of events) event.items.sort((a, b) => a.sortOrder - b.sortOrder || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  return events; // Preserve the database's created_at DESC, id DESC order, including timestamp microseconds.
}

export type Batch<T> = { data: T[] | null; count: number | null; error: unknown };
export type EventsSource = {
  summaries: (from: number, to: number) => PromiseLike<Batch<SummaryRow>>;
  items: (ids: string[], from: number, to: number) => PromiseLike<Batch<ItemRow>>;
};
function batch<T>(result: Batch<T>): { rows: T[]; count: number } {
  if (result.error || !Array.isArray(result.data)) return invalid();
  return { rows: result.data, count: integer(result.count) };
}
/** Injectable read boundary allows pagination tests without a database or server client. */
export async function readEventsPage(page: number, source: EventsSource): Promise<CustomerEventsPage> {
  if (parsePage(page) === null) return invalid();
  const from = (page - 1) * PAGE_SIZE;
  const summaries = batch(await source.summaries(from, from + PAGE_SIZE));
  if (summaries.rows.length !== Math.min(PAGE_SIZE + 1, Math.max(0, summaries.count - from))) return invalid();
  // Validate the sentinel too, but never fetch its items or expose it on this page.
  mapEvents(summaries.rows, []);
  const retained = summaries.rows.slice(0, PAGE_SIZE);
  const ids = retained.map((row) => uuid(row.id));
  const children: ItemRow[] = [];
  if (ids.length) {
    let expected: number | null = null;
    // Advance by actual rows returned: a server cap below our batch size cannot truncate the result.
    for (let requests = 0; requests < 100; requests++) {
      const result = batch(await source.items(ids, children.length, children.length + ITEM_BATCH_SIZE - 1));
      if (result.count > MAX_ITEMS || (expected !== null && expected !== result.count)) return invalid();
      expected = result.count;
      children.push(...result.rows);
      if (children.length > expected) return invalid();
      if (children.length === expected) break;
      if (!result.rows.length || requests === 99) return invalid();
    }
  }
  return { events: mapEvents(retained, children), page, hasNext: summaries.rows.length > PAGE_SIZE };
}
