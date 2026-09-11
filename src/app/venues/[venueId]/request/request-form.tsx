'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitBookingRequest } from '@/lib/booking-request/actions';
import type { BookingRequestContext, Result, SubmissionResult } from '@/lib/booking-request/model';
import { bookingErrorCopy, layoutSelectable, startOverUrl } from '@/lib/booking-request/presentation';
import { bookingLoginUrl } from '@/lib/auth/return-path';

type Layout = { id: string; name: string; layoutType: string; capacity: number | null };
type State = Result<SubmissionResult> | null;

export function RequestForm({ context, canonical, layouts }: {
  context: BookingRequestContext; canonical: string; layouts: Layout[];
}) {
  const router = useRouter();
  const [eventType, setEventType] = useState('');
  const [notes, setNotes] = useState('');
  const [layout, setLayout] = useState(context.selectedLayoutId ?? '');
  const retryPayload = useRef<FormData | null>(null);
  const succeeded = useRef<SubmissionResult | null>(null);
  const [state, action, pending] = useActionState<State, FormData>(async (_previous, form) => {
    if (succeeded.current) return { ok: true, data: succeeded.current };
    // A possibly committed response must be retried with the exact original payload.
    const payload = retryPayload.current ?? form;
    retryPayload.current = payload;
    let result: Result<SubmissionResult>;
    try { result = await submitBookingRequest(payload); }
    catch { result = { ok: false, code: 'UNEXPECTED' }; }
    if (result.ok === true) succeeded.current = result.data;
    else if (result.code !== 'UNEXPECTED') retryPayload.current = null;
    return result;
  }, null);
  const successId = state?.ok === true ? state.data.bookingId : null;
  useEffect(() => {
    if (successId) router.replace(`/account/requests/${successId}`);
  }, [successId, router]);
  const uncertain = state?.ok === false && state.code === 'UNEXPECTED';
  const frozen = pending || uncertain || successId !== null;
  const inputClass = 'w-full rounded-lg border border-navy/25 bg-white p-3 focus-visible:outline-2 focus-visible:outline-clay disabled:opacity-60';
  return <form action={action} className="space-y-5">
    <input type="hidden" name="venueId" value={context.venueId} />
    <input type="hidden" name="guests" value={context.guests} />
    <input type="hidden" name="start" value={context.startLocal} />
    <input type="hidden" name="end" value={context.endLocal} />
    <input type="hidden" name="space" value={context.selectedSpaceId ?? ''} />
    <input type="hidden" name="layout" value={layout} />
    <input type="hidden" name="submission" value={context.submissionId ?? ''} />
    <fieldset disabled={frozen} className="space-y-5">
      <legend className="mb-4 text-xl font-semibold text-navy">Your request</legend>
      <label className="block space-y-2"><span>Optional layout</span>
        <select value={layout} onChange={(event) => setLayout(event.target.value)} className={inputClass}>
          <option value="">No specific layout</option>
          {layouts.map((item) => <option key={item.id} value={item.id} disabled={!layoutSelectable(item.capacity, context.guests)}>{item.name} — {item.layoutType.replaceAll('_', ' ')}{item.capacity === null ? '' : ` (capacity ${item.capacity})`}</option>)}
        </select>
      </label>
      <label className="block space-y-2"><span>Event type (optional)</span><input name="eventType" value={eventType} onChange={(event) => setEventType(event.target.value)} maxLength={120} className={inputClass} /></label>
      <label className="block space-y-2"><span>Notes (optional)</span><textarea name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={5} className={inputClass} /></label>
    </fieldset>
    <p>Submit a request for the venue to review. Your event total and payment schedule will be shown after submission. No payment is collected now.</p>
    {state?.ok === false && <div role="alert" className="space-y-3 text-clay">
      <p>{bookingErrorCopy[state.code]}</p>
      {uncertain && <p className="text-sm">Retrying sends the same request details. Keep this page open to retry.</p>}
      {state.code === 'AUTH_REQUIRED' && <Link href={bookingLoginUrl(canonical)} className="underline">Sign in again</Link>}
      {state.code === 'SUBMISSION_CONFLICT' && <Link href={startOverUrl(context)} className="underline">Start a new request</Link>}
    </div>}
    {successId ? <p role="status">Request received. <Link href={`/account/requests/${successId}`} replace className="text-clay underline">View your request</Link></p>
      : <button disabled={pending || (state?.ok === false && state.code === 'SUBMISSION_CONFLICT')} className="rounded-lg bg-navy px-6 py-3 font-semibold text-linen focus-visible:outline-2 focus-visible:outline-clay disabled:opacity-60">{pending ? 'Sending request…' : 'Request to book'}</button>}
    {pending && <p role="status">Sending request…</p>}
  </form>;
}
