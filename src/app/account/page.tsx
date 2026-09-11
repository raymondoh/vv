import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCustomerEventsPage } from '@/lib/customer-events/query';
import { accountPage, accountUrl, customerEventCard, pageLinks } from '@/lib/customer-events/cards';
import { CustomerEventCard } from './_components/customer-event-card';
import { LogoutForm } from './logout-form';

export const dynamic = 'force-dynamic';
const linkStyle = 'text-clay underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay';

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = accountPage((await searchParams).page);
  const result = await getCustomerEventsPage(page);
  if (result.ok === false && result.code === 'AUTH_REQUIRED') redirect('/login');
  // One clock snapshot for this dynamic server response, shared by every card.
  // eslint-disable-next-line react-hooks/purity -- Server-only request-time deadline presentation.
  const now = Date.now();
  const links = result.ok ? pageLinks(result.data.page, result.data.hasNext) : null;
  return <main className="mx-auto min-h-screen max-w-4xl px-6 py-12 sm:px-10">
    <header className="mb-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><Link href="/" className={linkStyle}>← Venue discovery</Link><LogoutForm /></div>
      <div><h1 className="text-4xl font-semibold text-navy">My events</h1><p className="mt-3 text-slate/75">Your booking requests and events.</p></div>
    </header>
    {result.ok === false ? <section className="space-y-4 rounded-2xl border border-navy/15 p-6">
      <h2 className="text-xl font-semibold text-navy">{result.code === 'INVALID_PAGE' ? 'This page could not be opened' : 'Your events could not be loaded'}</h2>
      <p role="alert">{result.code === 'INVALID_PAGE' ? 'Return to My events to continue.' : 'Please try again.'}</p>
      <Link href={result.code === 'INVALID_PAGE' ? '/account' : accountUrl(page!)} className={linkStyle}>{result.code === 'INVALID_PAGE' ? 'Back to My events' : 'Try again'}</Link>
    </section> : result.data.events.length === 0 ? <section className="space-y-4 rounded-2xl border border-navy/15 p-6">
      <h2 className="text-xl font-semibold text-navy">{result.data.page === 1 ? 'No booking requests yet.' : 'No events on this page'}</h2>
      {result.data.page === 1 && <p>Find a venue and send your first request.</p>}
      <Link href={result.data.page === 1 ? '/' : '/account'} className={linkStyle}>{result.data.page === 1 ? 'Find a venue' : 'Back to My events'}</Link>
    </section> : <ul className="space-y-6" aria-label="Your booking requests and events">
      {result.data.events.map(event => <li key={event.bookingId}><CustomerEventCard card={customerEventCard(event, now)} /></li>)}
    </ul>}
    {links && (links.previous || links.next) && <nav aria-label="Events pagination" className="mt-8 flex flex-wrap items-center gap-6">
      {links.previous && <Link href={links.previous} className={linkStyle} aria-label="Previous page of events">Previous</Link>}
      <span>Page {page}</span>
      {links.next && <Link href={links.next} className={linkStyle} aria-label="Next page of events">Next</Link>}
    </nav>}
    {result.ok && result.data.hasNext && links && !links.next && <p role="status" className="mt-4 text-sm">The page limit has been reached. Further events cannot be displayed here.</p>}
  </main>;
}
