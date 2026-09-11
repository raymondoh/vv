'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { declineBooking } from '@/lib/host-requests/decline-actions';
import { declineMessages, type DeclineState } from '@/lib/host-requests/decline';

export function DeclineForm({ bookingId, enabled }: { bookingId: string; enabled: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: DeclineState, form: FormData) => {
    const result = await declineBooking(previous, form);
    if (result.code && ['STALE', 'UNAVAILABLE', 'INELIGIBLE'].includes(result.code)) router.refresh();
    return result;
  }, {});
  if (!enabled && !state.code) return null;
  return <section aria-label="Request decline" className="space-y-4 rounded-2xl border border-navy/15 p-6">
    {state.code && <p role="alert">{declineMessages[state.code]}</p>}
    {enabled && <form action={action} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p id="decline-explanation">Declining ends this request. Your reason is recorded in internal booking history and is not currently shown to the customer.</p>
      <label htmlFor="decline-reason" className="block font-semibold">Reason for declining</label>
      <textarea id="decline-reason" name="reason" required rows={4} aria-describedby="decline-explanation"
        className="w-full rounded-xl border border-navy/30 bg-white p-3 focus-visible:outline-2 focus-visible:outline-clay" />
      <button type="submit" disabled={pending} aria-describedby="decline-explanation"
        className="rounded-full bg-clay px-6 py-3 font-semibold text-linen focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay disabled:cursor-wait disabled:opacity-60">
        {pending ? 'Declining…' : 'Decline request'}
      </button>
    </form>}
  </section>;
}
