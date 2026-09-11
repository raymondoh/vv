import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { normalizeUuid } from '../booking-request/model';
import { parsePage } from '../customer-events/model';
import { readHostPage, readHostDetail, type HostPage, type HostBooking, type ReadResult } from './model';

const columns = 'id, booking_reference, organization_id, organization_display_name, organization_status, venue_id, venue_name, venue_timezone, customer_display_name, customer_notes, booking_status, payment_status, event_starts_at, event_ends_at, event_type, guest_count, submitted_at, created_at, hold_expires_at, currency_code, customer_total_minor, marketplace_commission_minor, venue_net_before_fees_minor' as const;
const itemColumns = 'id, booking_id, space_id, space_layout_id, item_starts_at, item_ends_at, sort_order, space_name, layout_name' as const;
type Client = SupabaseClient<Database>;
async function authenticated(client: Client): Promise<boolean> {
  const { data, error } = await client.auth.getClaims();
  return !error && typeof data?.claims.sub === 'string' && !!normalizeUuid(data.claims.sub);
}
export async function readQueue(client: Client, page: unknown): Promise<ReadResult<HostPage>> {
  try {
    if (!await authenticated(client)) return { ok: false, code: 'AUTH_REQUIRED' };
    const parsed = parsePage(page);
    if (parsed === null) return { ok: false, code: 'INVALID_PAGE' };
    const data = await readHostPage(parsed, (from, to) => client.from('operator_booking_summaries')
      .select(columns, { count: 'exact' }).eq('booking_status', 'requested')
      .order('submitted_at', { ascending: true }).order('id', { ascending: true }).range(from, to));
    return { ok: true, data };
  } catch { return { ok: false, code: 'UNEXPECTED' }; }
}
export async function readBooking(client: Client, value: string): Promise<ReadResult<HostBooking | null>> {
  try {
    if (!await authenticated(client)) return { ok: false, code: 'AUTH_REQUIRED' };
    const id = normalizeUuid(value);
    if (!id) return { ok: false, code: 'INVALID_INPUT' };
    const result = await client.from('operator_booking_summaries').select(columns).eq('id', id).maybeSingle();
    if (result.error) return { ok: false, code: 'UNEXPECTED' };
    if (!result.data) return { ok: true, data: null };
    if (normalizeUuid(result.data.id ?? '') !== id) return { ok: false, code: 'UNEXPECTED' };
    const data = await readHostDetail(result.data, (from, to) => client.from('operator_booking_item_summaries')
      .select(itemColumns, { count: 'exact' }).eq('booking_id', id)
      .order('sort_order', { ascending: true }).order('id', { ascending: true }).range(from, to));
    return { ok: true, data };
  } catch { return { ok: false, code: 'UNEXPECTED' }; }
}
