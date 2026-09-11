import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import { normalizeUuid } from '../booking-request/model';
import { bookingLoginUrl } from '../auth/return-path';
import { approvalBookingId, approvalError, approvalRefreshPaths, validApprovalPayload, type ApprovalState, type ApprovalResult } from './approval';

/** No mutable-state pre-read: the RPC owns authorization, locking and all eligibility checks. */
export async function approveRequest(client: SupabaseClient<Database>, form: FormData): Promise<ApprovalResult> {
  const bookingId = approvalBookingId(form);
  if (!bookingId) return { ok: false, code: 'UNAVAILABLE' };
  try {
    const { data: identity, error: authError } = await client.auth.getClaims();
    if (authError && (isAuthRetryableFetchError(authError) || (authError.status ?? 0) >= 500)) {
      return { ok: false, code: 'UNEXPECTED' };
    }
    if (authError || typeof identity?.claims.sub !== 'string' || !normalizeUuid(identity.claims.sub)) {
      return { ok: false, code: 'AUTH_REQUIRED' };
    }
    const { data, error } = await client.rpc('approve_booking_hold', { target_booking_id: bookingId });
    if (error) return { ok: false, code: approvalError(error) };
    return validApprovalPayload(data, bookingId) ? { ok: true, bookingId } : { ok: false, code: 'UNEXPECTED' };
  } catch { return { ok: false, code: 'UNEXPECTED' }; }
}

/** Framework effects are supplied by the Server Action; only validated results reach redirects. */
export function finishApproval(result: ApprovalResult, bookingId: string, effects: {
  revalidate: (path: string) => void; redirect: (path: string) => never;
}): ApprovalState {
  const detail = `/host/bookings/${bookingId}`;
  if (!result.ok && result.code === 'AUTH_REQUIRED') effects.redirect(bookingLoginUrl(detail));
  if (result.ok || ['STALE', 'UNAVAILABLE', 'INELIGIBLE', 'INVENTORY'].includes(result.code)) {
    for (const path of approvalRefreshPaths(bookingId)) effects.revalidate(path);
  }
  if (result.ok) effects.redirect(detail);
  return { code: result.code };
}
