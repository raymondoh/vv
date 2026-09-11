import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCustomerConfirmation } from '@/lib/booking-request/query';
import { bookingStatusLabel } from '@/lib/booking-request/presentation';
import { formatMoney } from '@/lib/catalog/money';

export const dynamic = 'force-dynamic';

function eventTime(value: string, timezone: string | null): string {
  const date = new Date(value); // Persisted timestamptz, never datetime-local input.
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone ?? 'UTC' }).format(date);
  } catch {
    return `${date.toISOString()} (UTC)`;
  }
}

export default async function ConfirmationPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const result = await getCustomerConfirmation((await params).bookingId);
  if (result.ok === false) {
    if (result.code === 'AUTH_REQUIRED') redirect('/login');
    if (result.code === 'INVALID_INPUT') notFound();
    return <main className="mx-auto max-w-2xl space-y-6 px-6 py-12"><h1 className="text-3xl font-semibold text-navy">Your request</h1><p role="alert">We couldn’t load your request. Please try again.</p><Link href="/account" className="text-clay underline">Back to account</Link></main>;
  }
  if (!result.data) notFound();
  const booking = result.data;
  const requested = booking.bookingStatus === 'requested';
  return <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
    <Link href="/account" className="text-clay underline">← Back to account</Link>
    <h1 className="text-3xl font-semibold text-navy">{requested ? 'Request sent' : 'Your booking request'}</h1>
    {requested ? <><p>Your request has been sent to the venue for review.</p><p>No space is held or reserved yet.</p></> : <p>The current status of your booking request is shown below.</p>}
    <dl className="grid gap-4 rounded-2xl border border-navy/15 bg-white/50 p-6">
      <div><dt>Booking reference</dt><dd className="font-semibold">{booking.bookingReference}</dd></div>
      <div><dt>Venue</dt><dd>{booking.venueName ?? 'Venue name unavailable'}</dd></div>
      <div><dt>Booking status</dt><dd>{bookingStatusLabel(booking.bookingStatus)}</dd></div>
      <div><dt>Event start</dt><dd>{eventTime(booking.eventStartsAt, booking.venueTimezone)}</dd></div>
      <div><dt>Event end</dt><dd>{eventTime(booking.eventEndsAt, booking.venueTimezone)}</dd></div>
      <div><dt>Timezone</dt><dd>{booking.venueTimezone ?? 'UTC'}</dd></div>
      <div><dt>Guests</dt><dd>{booking.guests ?? 'Not specified'}</dd></div>
      {booking.items.map((item) => <div key={item.id}><dt>Selected space</dt><dd>{item.spaceName ?? 'Space name unavailable'}{item.layoutId && <p>Layout: {item.layoutName ?? 'Layout name unavailable'}</p>}</dd></div>)}
      <div><dt>Customer total</dt><dd className="text-xl font-semibold">{formatMoney(booking.customerTotalMinor, booking.currency)}</dd></div>
    </dl>
    <section aria-labelledby="schedule-heading" className="space-y-4">
      <h2 id="schedule-heading" className="text-2xl font-semibold text-navy">Payment schedule</h2>
      {booking.schedule.map((payment) => <dl key={payment.id} className="space-y-2 rounded-xl border border-navy/15 p-5">
        <div><dt>{payment.installment === 'deposit' ? 'Deposit' : 'Final balance'}</dt><dd className="font-semibold">{formatMoney(payment.amountMinor, payment.currency)}</dd></div>
        <div><dt>Status</dt><dd>{payment.status.replaceAll('_', ' ')}</dd></div>
        {payment.dueAt && <div><dt>Due date</dt><dd>{eventTime(payment.dueAt, booking.venueTimezone)}</dd></div>}
      </dl>)}
    </section>
    <Link href="/" className="text-clay underline">Back to discovery</Link>
  </main>;
}
