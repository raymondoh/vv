import Link from 'next/link';
import type { CustomerEventCardModel } from '@/lib/customer-events/cards';

export function CustomerEventCard({ card }: { card: CustomerEventCardModel }) {
  return <article className="min-w-0 space-y-5 rounded-2xl border border-navy/15 bg-white/50 p-6 break-words sm:p-8">
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold text-navy">{card.venueName}</h2>
      <p className="text-sm text-slate/75">Booking reference: {card.reference}</p>
    </header>
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-sm text-slate/75">Booking status</dt><dd className="font-semibold">{card.bookingStatus}</dd></div>
      <div><dt className="text-sm text-slate/75">Payment status</dt><dd>{card.paymentStatus}</dd></div>
      <div><dt className="text-sm text-slate/75">Start</dt><dd>{card.start.text}</dd></div>
      <div><dt className="text-sm text-slate/75">End</dt><dd>{card.end.text}</dd></div>
      <div><dt className="text-sm text-slate/75">Guests</dt><dd>{card.guests}</dd></div>
      {card.eventType && <div><dt className="text-sm text-slate/75">Event type</dt><dd>{card.eventType}</dd></div>}
    </dl>
    <p className="text-sm text-slate/75">Times shown in {card.start.timezone}{card.start.fallback ? ' (historical timezone unavailable)' : ''}.</p>
    <div>
      <h3 className="font-medium">Spaces</h3>
      {card.emptySpaces ? <p className="mt-2 text-sm">{card.emptySpaces}</p> : <ul className="mt-2 space-y-2">
        {card.spaces.map((space, index) => <li key={index}>{space.name}{space.layout && <span className="text-slate/75"> — {space.layout}</span>}</li>)}
      </ul>}
      {card.moreSpaces > 0 && <p className="mt-2 text-sm">+ {card.moreSpaces} more spaces</p>}
    </div>
    <p className="font-semibold text-navy">Total: {card.total}</p>
    {card.notice && <p className="text-sm">{card.notice}</p>}
    {card.holdDeadline && <p className="text-sm">Hold deadline: {card.holdDeadline.text} ({card.holdDeadline.timezone})</p>}
    <Link href={card.href} className="inline-block font-semibold text-clay underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay" aria-label={`View details for booking ${card.reference}`}>View details</Link>
  </article>;
}
