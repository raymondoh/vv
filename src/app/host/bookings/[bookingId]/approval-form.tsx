'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { approveBooking } from '@/lib/host-requests/approval-actions';
import { approvalMessages, type ApprovalState } from '@/lib/host-requests/approval';

export function ApprovalForm({ bookingId, enabled }: { bookingId: string; enabled: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: ApprovalState, form: FormData) => {
    const result = await approveBooking(previous, form);
    if (result.code && ['STALE', 'UNAVAILABLE', 'INELIGIBLE', 'INVENTORY'].includes(result.code)) router.refresh();
    return result;
  }, {});
  if (!enabled && !state.code) return null;
  return <section aria-label="Request approval" className="space-y-4 rounded-2xl border border-navy/15 p-6">
    {state.code && <p role="alert">{approvalMessages[state.code]}</p>}
    {enabled && <form action={action} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p id="approval-explanation">Approval creates a 30-minute temporary reservation hold while the customer proceeds to the deposit stage. It does not collect payment or confirm the booking.</p>
      <button type="submit" disabled={pending} aria-describedby="approval-explanation"
        className="rounded-full bg-navy px-6 py-3 font-semibold text-linen focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay disabled:cursor-wait disabled:opacity-60">
        {pending ? 'Approving…' : 'Approve request and hold space'}
      </button>
    </form>}
  </section>;
}
