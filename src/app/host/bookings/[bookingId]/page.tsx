import { DeclineForm } from './decline-form';
import { canDecline } from '@/lib/host-requests/decline';
import Link from 'next/link';
import { ApprovalForm } from './approval-form';
import { canApprove } from '@/lib/host-requests/approval';
import { notFound, redirect } from 'next/navigation';
import { getHostBooking } from '@/lib/host-requests/query';
import { hostPresentation } from '@/lib/host-requests/presentation';
import { bookingLoginUrl } from '@/lib/auth/return-path';
import { BookingFacts, hostLinkStyle } from '../../booking-facts';

export const dynamic = 'force-dynamic';

export default async function HostBookingPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const result = await getHostBooking(bookingId);
  if (!result.ok) {
    if (result.code === 'AUTH_REQUIRED') redirect(bookingLoginUrl(`/host/bookings/${bookingId}`));
    if (result.code === 'INVALID_INPUT') notFound();
    return <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <h1 className="text-3xl font-semibold text-navy">Booking request</h1>
      <p role="alert">We couldn’t load this request. Please try again.</p>
      <Link href="/host/requests" className={hostLinkStyle}>Back to booking requests</Link>
    </main>;
  }
  if (!result.data) notFound();
  // eslint-disable-next-line react-hooks/purity -- One clock for this dynamic server response.
  const booking = hostPresentation(result.data, Date.now());
  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-6 py-12 break-words sm:px-10">
    <Link href="/host/requests" className={hostLinkStyle}>← Booking requests</Link>
    <h1 className="text-3xl font-semibold text-navy">Booking {booking.reference}</h1>
    <section aria-labelledby="booking-venue" className="space-y-5 rounded-2xl border border-navy/15 bg-white/50 p-6">
      <h2 id="booking-venue" className="text-2xl font-semibold text-navy">{booking.venue}</h2>
      <BookingFacts booking={booking} />
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt>Organisation status</dt><dd>{booking.organizationStatus}</dd></div>
        <div><dt>Submitted</dt><dd>{booking.submitted.text} ({booking.submitted.timezone})</dd></div>
        <div><dt>Marketplace commission</dt><dd>{booking.commission}</dd></div>
        <div><dt>Venue amount before fees</dt><dd>{booking.venueAmount}</dd></div>
        {booking.holdDeadline && <div><dt>Recorded hold deadline</dt><dd>{booking.holdDeadline.text} ({booking.holdDeadline.timezone})</dd></div>}
      </dl>
    </section>
    <ApprovalForm key={result.data.bookingId} bookingId={result.data.bookingId} enabled={canApprove(result.data)} />
    <DeclineForm key={`decline:${result.data.bookingId}`} bookingId={result.data.bookingId} enabled={canDecline(result.data)} />
    <section aria-labelledby="notes-heading" className="space-y-3">
      <h2 id="notes-heading" className="text-2xl font-semibold text-navy">Customer notes</h2>
      <p className="whitespace-pre-wrap">{booking.notes}</p>
    </section>
    <section aria-labelledby="spaces-heading" className="space-y-4">
      <h2 id="spaces-heading" className="text-2xl font-semibold text-navy">Selected spaces</h2>
      {booking.spaces.length === 0 ? <p>Space details unavailable</p> : <ul className="space-y-4">
        {booking.spaces.map(space => <li key={space.id} className="space-y-2 rounded-xl border border-navy/15 p-5">
          <h3 className="font-semibold">{space.name}</h3>
          {space.layout && <p>Layout: {space.layout}</p>}
          <p>Start: {space.start.text}</p><p>End: {space.end.text}</p>
        </li>)}
      </ul>}
    </section>
  </main>;
}
