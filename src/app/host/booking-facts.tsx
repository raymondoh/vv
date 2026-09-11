import type { HostPresentation } from '@/lib/host-requests/presentation';

export const hostLinkStyle = 'text-clay underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay';
export function BookingFacts({ booking }: { booking: HostPresentation }) {
  const facts = [
    ['Booking reference', booking.reference], ['Organisation', booking.organization],
    ['Customer', booking.customer], ['Booking status', booking.status], ['Payment status', booking.payment],
    ['Event start', booking.start.text], ['Event end', booking.end.text],
    ['Event type', booking.eventType], ['Guests', booking.guests], ['Customer total', booking.total],
  ];
  return <>
    <dl className="grid gap-4 sm:grid-cols-2">
      {facts.map(([label, value]) => <div key={label}><dt className="text-sm text-slate/75">{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <p className="text-sm text-slate/75">Times shown in {booking.start.timezone}{booking.start.fallback ? ' (historical timezone unavailable)' : ''}.</p>
    {booking.notice && <p className="text-sm">{booking.notice}</p>}
  </>;
}
