'use server';

import { createClient } from '../supabase/server';
import { mapBookingError } from './errors';
import { normalizeRequestFields, parseBookingRequestContext, type Result, type SubmissionResult } from './model';
import { toSubmissionResult } from './responses';

/** One explicit submission; UUID creation belongs to draft establishment, never retries. */
export async function submitBookingRequest(form: FormData): Promise<Result<SubmissionResult>> {
  if (!(form instanceof FormData)) return { ok: false, code: 'INVALID_INPUT' };
  for (const name of ['venueId', 'guests', 'start', 'end', 'space', 'layout', 'submission', 'eventType', 'notes']) {
    const value = form.get(name);
    if (value !== null && typeof value !== 'string') return { ok: false, code: 'INVALID_INPUT' };
  }
  const read = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : undefined;
  };
  const context = parseBookingRequestContext(read('venueId') ?? '', {
    guests: read('guests'), start: read('start'), end: read('end'),
    space: read('space'), layout: read('layout'), submission: read('submission'),
  });
  const fields = normalizeRequestFields(form.get('eventType'), form.get('notes'));
  if (!context.ok || !fields.ok) return { ok: false, code: 'INVALID_INPUT' };
  const request = context.data;
  if (!request.selectedSpaceId || !request.submissionId) return { ok: false, code: 'INVALID_INPUT' };
  try {
    const supabase = await createClient();
    const { data: identity, error: authError } = await supabase.auth.getClaims();
    if (authError || typeof identity?.claims.sub !== 'string' || !identity.claims.sub) return { ok: false, code: 'AUTH_REQUIRED' };
    const { data, error } = await supabase.rpc('submit_booking_request_local', {
      submission_id: request.submissionId, target_venue_id: request.venueId,
      start_local: request.startLocal, end_local: request.endLocal, guest_count: request.guests,
      selected_space_id: request.selectedSpaceId, selected_layout_id: request.selectedLayoutId ?? undefined,
      event_type: fields.data.eventType ?? undefined, notes: fields.data.notes ?? undefined,
    });
    if (error) return { ok: false, code: mapBookingError(error) };
    if (!data || data.length !== 1) return { ok: false, code: 'UNEXPECTED' };
    return { ok: true, data: toSubmissionResult(data[0]) };
  } catch {
    // A transport failure may have followed a commit. The caller must retain the same UUID/payload.
    return { ok: false, code: 'UNEXPECTED' };
  }
}
