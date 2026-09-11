import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getHostRequests } from '@/lib/host-requests/query';
import { hostPage, hostUrl, hostLinks, hostPresentation } from '@/lib/host-requests/presentation';
import { bookingLoginUrl } from '@/lib/auth/return-path';
import { BookingFacts, hostLinkStyle } from '../booking-facts';

export const dynamic = 'force-dynamic';

export default async function HostRequestsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = hostPage((await searchParams).page);
  const result = await getHostRequests(page);
  if (!result.ok && result.code === 'AUTH_REQUIRED') redirect(bookingLoginUrl(hostUrl(page ?? 1)));
  // eslint-disable-next-line react-hooks/purity -- One clock for this dynamic server response.
  const now = Date.now();
  const links = result.ok ? hostLinks(result.data.page, result.data.hasNext) : null;
  return <main className="mx-auto min-h-screen max-w-4xl space-y-8 px-6 py-12 sm:px-10">
    <header className="space-y-4">
      <Link href="/" className={hostLinkStyle}>← Venue discovery</Link>
      <h1 className="text-4xl font-semibold text-navy">Host booking requests</h1>
      <p>Awaiting review across the organisations you can operate. Oldest submitted requests appear first.</p>
    </header>
    {!result.ok ? <section className="space-y-4 rounded-2xl border border-navy/15 p-6">
      <h2 className="text-xl font-semibold text-navy">{result.code === 'INVALID_PAGE' ? 'This page could not be opened' : 'Requests could not be loaded'}</h2>
      <p role="alert">{result.code === 'INVALID_PAGE' ? 'Return to booking requests to continue.' : 'Please try again.'}</p>
      <Link href={hostUrl(page ?? 1)} className={hostLinkStyle}>{result.code === 'INVALID_PAGE' ? 'Back to booking requests' : 'Try again'}</Link>
    </section> : result.data.bookings.length === 0 ? <section className="space-y-4 rounded-2xl border border-navy/15 p-6">
      <h2 className="text-xl font-semibold text-navy">{page === 1 ? 'No requests awaiting review' : 'No requests on this page'}</h2>
      <p>{page === 1 ? 'There are no awaiting-review requests available to your account.' : 'Return to the first page to see current requests.'}</p>
      {page !== 1 && <Link href="/host/requests" className={hostLinkStyle}>Back to booking requests</Link>}
    </section> : <ul className="space-y-6" aria-label="Booking requests awaiting review">
      {result.data.bookings.map(booking => {
        const card = hostPresentation(booking, now);
        return <li key={booking.bookingId}><article className="min-w-0 space-y-5 rounded-2xl border border-navy/15 bg-white/50 p-6 break-words sm:p-8">
          <h2 className="text-2xl font-semibold text-navy">{card.venue}</h2>
          <BookingFacts booking={card} />
          <Link href={card.href} className={hostLinkStyle} aria-label={`View request ${card.reference}`}>View request</Link>
        </article></li>;
      })}
    </ul>}
    {links && (links.previous || links.next) && <nav aria-label="Host requests pagination" className="flex flex-wrap items-center gap-6">
      {links.previous && <Link href={links.previous} className={hostLinkStyle} aria-label="Previous page of requests">Previous</Link>}
      <span>Page {page}</span>
      {links.next && <Link href={links.next} className={hostLinkStyle} aria-label="Next page of requests">Next</Link>}
    </nav>}
    {result.ok && result.data.hasNext && links && !links.next && <p role="status">The page limit has been reached. Further requests cannot be displayed here.</p>}
  </main>;
}
