import 'server-only';
import { createClient } from '../supabase/server';
import { BOOKING_ORDER, ITEM_ORDER, parsePage, readEventsPage, type EventsResult } from './model';

const summaryColumns = 'id, booking_reference, created_at, submitted_at, venue_name, venue_timezone, event_starts_at, event_ends_at, event_type, guest_count, booking_status, payment_status, hold_expires_at, currency_code, customer_total_minor' as const;
const itemColumns = 'id, booking_id, space_id, space_layout_id, item_starts_at, item_ends_at, sort_order, space_name, layout_name' as const;

export async function getCustomerEventsPage(value: unknown): Promise<EventsResult> {
  const page = parsePage(value);
  if (page === null) return { ok: false, code: 'INVALID_PAGE' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || typeof data?.claims.sub !== 'string' || !data.claims.sub) return { ok: false, code: 'AUTH_REQUIRED' };
    const result = await readEventsPage(page, {
      summaries: (from, to) => supabase.from('my_booking_summaries').select(summaryColumns, { count: 'exact' })
        .order(BOOKING_ORDER[0], { ascending: false }).order(BOOKING_ORDER[1], { ascending: false }).range(from, to),
      items: (ids, from, to) => supabase.from('my_booking_item_summaries').select(itemColumns, { count: 'exact' })
        .in('booking_id', ids).order(ITEM_ORDER[0], { ascending: true }).order(ITEM_ORDER[1], { ascending: true }).range(from, to),
    });
    return { ok: true, data: result };
  } catch {
    return { ok: false, code: 'UNEXPECTED' };
  }
}
