import 'server-only';
import { createClient } from '../supabase/server';
import { mapBookingError } from './errors';
import { normalizeUuid, parseBookingRequestContext, type BookingRequestContext, type CustomerConfirmation, type Result } from './model';
import { toCustomerConfirmation } from './responses';

export async function getEligibleBookingSpaces(
  context: Pick<BookingRequestContext, 'venueId' | 'guests' | 'startLocal' | 'endLocal'>,
): Promise<Result<string[]>> {
  const parsed = parseBookingRequestContext(context.venueId, {
    guests: String(context.guests), start: context.startLocal, end: context.endLocal,
  }, false);
  if (parsed.ok === false) return parsed;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_eligible_booking_spaces', {
      target_venue_id: parsed.data.venueId, start_local: parsed.data.startLocal,
      end_local: parsed.data.endLocal, guests: parsed.data.guests,
    });
    if (error) return { ok: false, code: mapBookingError(error) };
    if (!data) return { ok: false, code: 'UNEXPECTED' };
    const ids = data.map((row) => normalizeUuid(row.space_id));
    if (ids.some((id) => id === null)) return { ok: false, code: 'UNEXPECTED' };
    // Empty success means no eligible spaces OR unavailable venue, as the safe RPC intends.
    return { ok: true, data: [...new Set(ids.filter((id) => id !== null))] };
  } catch {
    return { ok: false, code: 'UNEXPECTED' };
  }
}

export async function getCustomerConfirmation(bookingId: string): Promise<Result<CustomerConfirmation | null>> {
  const id = normalizeUuid(bookingId);
  if (!id) return { ok: false, code: 'INVALID_INPUT' };
  try {
    const supabase = await createClient();
    const { data: identity, error: authError } = await supabase.auth.getClaims();
    if (authError || typeof identity?.claims.sub !== 'string' || !identity.claims.sub) return { ok: false, code: 'AUTH_REQUIRED' };
    // These views enforce auth.uid() ownership even for a customer who is also an operator.
    const { data: booking, error } = await supabase.from('my_booking_summaries').select('*').eq('id', id).maybeSingle();
    if (error) return { ok: false, code: mapBookingError(error) };
    if (!booking) return { ok: true, data: null };
    const [items, schedule] = await Promise.all([
      supabase.from('my_booking_item_summaries').select('*').eq('booking_id', id).order('sort_order').order('id'),
      supabase.from('my_booking_payment_schedule').select('*').eq('booking_id', id).order('sequence').order('id'),
    ]);
    if (items.error || schedule.error) return { ok: false, code: mapBookingError(items.error ?? schedule.error) };
    if (!items.data || !schedule.data) return { ok: false, code: 'UNEXPECTED' };
    return { ok: true, data: toCustomerConfirmation(booking, items.data, schedule.data) };
  } catch {
    return { ok: false, code: 'UNEXPECTED' };
  }
}
