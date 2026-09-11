import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { normalizeUuid } from '../booking-request/model';
import { bookingLoginUrl } from '../auth/return-path';
import { declineBookingId, declineReason, declineError, declineRefreshPaths, validDeclinePayload, type DeclineState, type DeclineResult } from './decline';

/** No mutable-state pre-read: the RPC owns authorization, locking and all eligibility checks. */
export async function declineRequest(client: SupabaseClient<Database>, form: FormData): Promise<DeclineResult> {
  const bookingId = declineBookingId(form);
  if (!bookingId) return { ok: false, code: 'UNAVAILABLE' };
  const reason = declineReason(form);
  if (reason === null) return { ok: false, code: 'INVALID_REASON' };
  try {
    const { data: identity, error: authError } = await client.auth.getClaims();
    if (authError && (isAuthRetryableFetchError(authError) || (authError.status ?? 0) >= 500)) {
      return { ok: false, code: 'UNEXPECTED' };
    }
    if (authError || typeof identity?.claims.sub !== 'string' || !normalizeUuid(identity.claims.sub)) {
      return { ok: false, code: 'AUTH_REQUIRED' };
    }
    const { data, error } = await client.rpc('decline_booking', { target_booking_id: bookingId, decline_reason: reason });
    if (error) return { ok: false, code: declineError(error) };
    return validDeclinePayload(data, bookingId) ? { ok: true, bookingId } : { ok: false, code: 'UNEXPECTED' };
  } catch { return { ok: false, code: 'UNEXPECTED' }; }
}

/** Framework effects are supplied by the Server Action; only validated results reach redirects. */
export function finishDecline(result: DeclineResult, bookingId: string, effects: {
  revalidate: (path: string) => void; redirect: (path: string) => never;
}): DeclineState {
  const detail = `/host/bookings/${bookingId}`;
  if (!result.ok && result.code === 'AUTH_REQUIRED') effects.redirect(bookingLoginUrl(detail));
  if (result.ok || ['STALE', 'UNAVAILABLE', 'INELIGIBLE'].includes(result.code)) {
    for (const path of declineRefreshPaths(bookingId)) effects.revalidate(path);
  }
  if (result.ok) effects.redirect(detail);
  return { code: result.code };
}
