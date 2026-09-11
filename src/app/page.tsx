import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { normalizeCatalogSearch, type CatalogSearchParams } from '@/lib/catalog/search';
import { getCatalog } from '@/lib/catalog/query';
import type { VenueCardModel } from '@/lib/catalog/model';
import { VenueCard } from './_components/venue-card';

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const search = normalizeCatalogSearch(await searchParams);
  const availabilityActive = search.timeError === null && search.startLocal !== null && search.endLocal !== null;
  const searchActive = search.name !== null || search.city !== null || search.guests !== null || availabilityActive || search.timeError !== null;
  const timeMessages = {
    incomplete: 'Enter both a start and end time.',
    invalid: 'Enter valid dates and times.',
    order: 'The end time must be after the start time. Use separate dates for overnight events.',
  };
  let venues: VenueCardModel[] = [];
  let catalogFailed = false;
  let authenticated = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && typeof data?.claims.sub === 'string' && !!data.claims.sub;
  } catch {
    // Navigation may fall back to login; catalog failures have their own visible state.
  }
  if (search.timeError === null) {
    try {
      venues = await getCatalog(search);
    } catch {
      catalogFailed = true;
    }
  }
  return <div className="min-h-screen">
    <header className="border-b border-navy/10 px-6 py-6 sm:px-12">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
        <span className="text-xl font-extrabold tracking-tight text-navy">VV<span className="text-clay">.</span></span>
        <nav aria-label="Account" className="flex gap-5 text-sm font-medium">
          {authenticated ? <Link href="/account" className="text-clay">Your account</Link> : <>
            <Link href="/login">Log in</Link><Link href="/signup" className="text-clay">Sign up</Link>
          </>}
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12 sm:py-24">
      <p className="mb-6 text-xs font-bold tracking-[0.2em] text-clay uppercase">A closer look at your next venue</p>
      <h1 className="max-w-3xl text-5xl leading-[1.1] font-semibold text-navy sm:text-7xl">Find a space.<br />Imagine the possibilities.</h1>
      <p className="mt-8 max-w-xl text-lg leading-8 text-slate/75">Discover spaces and start imagining your next gathering.</p>
      <form method="get" action="/" className="mt-10 flex flex-col gap-4 rounded-xl border border-navy/15 p-6 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex-1">
          <label htmlFor="venue-search" className="block text-sm font-medium text-navy">Venue name</label>
          <input id="venue-search" name="q" type="search" defaultValue={search.name ?? ''} maxLength={120} placeholder="Search venue names" className="mt-2 w-full rounded-lg border border-navy/20 bg-white/50 px-4 py-3 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20" />
        </div>
        <div className="flex-1">
          <label htmlFor="city-search" className="block text-sm font-medium text-navy">City</label>
          <input id="city-search" name="city" type="text" defaultValue={search.city ?? ''} maxLength={120} placeholder="London" className="mt-2 w-full rounded-lg border border-navy/20 bg-white/50 px-4 py-3 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20" />
        </div>
        <div className="flex-1">
          <label htmlFor="guests-search" className="block text-sm font-medium text-navy">Guests</label>
          <input id="guests-search" name="guests" type="number" min="1" max="100000" step="1" defaultValue={search.guests ?? ''} placeholder="100" className="mt-2 w-full rounded-lg border border-navy/20 bg-white/50 px-4 py-3 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20" />
        </div>
        <div className="w-full">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="start-search" className="block text-sm font-medium text-navy">Start</label>
              <input id="start-search" name="start" type="datetime-local" step="60" defaultValue={search.startLocal ?? ''} aria-describedby="event-time-help" className="mt-2 w-full rounded-lg border border-navy/20 bg-white/50 px-4 py-3 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20" />
            </div>
            <div>
              <label htmlFor="end-search" className="block text-sm font-medium text-navy">End</label>
              <input id="end-search" name="end" type="datetime-local" step="60" defaultValue={search.endLocal ?? ''} aria-describedby="event-time-help" className="mt-2 w-full rounded-lg border border-navy/20 bg-white/50 px-4 py-3 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20" />
            </div>
          </div>
          <p id="event-time-help" className="mt-2 text-sm text-slate/75">Times are local to each venue.</p>
        </div>
        <button type="submit" className="rounded-lg bg-clay px-6 py-3 font-medium text-white hover:bg-clay/90">Search</button>
        {searchActive && <Link href="/" className="py-3 text-sm font-medium text-clay underline">Clear search</Link>}
      </form>
      <section aria-labelledby="venues-heading" className="mt-16">
        <h2 id="venues-heading" className="mb-8 text-2xl font-semibold text-navy">{search.timeError !== null ? 'Check your event times' : availabilityActive ? 'Venues matching your requested time' : searchActive ? 'Venues matching your search' : 'Recently published venues'}</h2>
        {availabilityActive && <p className="mb-8 text-slate/75">Availability is a current snapshot. No space is held until the booking process advances.</p>}
        {search.timeError !== null ? <div role="alert" className="rounded-xl border border-clay/30 p-8">
          <p>{timeMessages[search.timeError]}</p>
          <Link href="/" className="mt-4 inline-block text-clay underline">Clear search</Link>
        </div> : catalogFailed ? <div role="alert" className="rounded-xl border border-clay/30 p-8">
          <h3 className="font-semibold">We couldn’t load the venues</h3>
          <p className="mt-2">Please try again in a moment.</p>
          <form action="/" method="get">
            {search.name !== null && <input type="hidden" name="q" value={search.name} />}
            {search.city !== null && <input type="hidden" name="city" value={search.city} />}
            {search.guests !== null && <input type="hidden" name="guests" value={search.guests} />}
            {search.startLocal !== null && <input type="hidden" name="start" value={search.startLocal} />}
            {search.endLocal !== null && <input type="hidden" name="end" value={search.endLocal} />}
            <button className="mt-4 text-clay underline">Try again</button></form>
        </div> : venues.length ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => <VenueCard key={venue.id} venue={venue} />)}
        </div> : searchActive ? <div className="rounded-xl border border-navy/15 p-8">
          <h3 className="text-xl font-semibold text-navy">{availabilityActive ? 'No venues match your requested time' : 'No venues match your search'}</h3>
          <p className="mt-3 text-slate/75">{availabilityActive ? 'Try a different venue name, city, guest count, or event times, or clear your search.' : 'Try a different venue name, city, or guest count, or clear your search.'}</p>
          <Link href="/" className="mt-4 inline-block text-clay underline">Clear search</Link>
        </div> : <div className="rounded-xl border border-navy/15 p-8">
          <h3 className="text-xl font-semibold text-navy">More spaces are on the way</h3>
          <p className="mt-3 text-slate/75">There are no published venues to explore yet. Please check back soon.</p>
        </div>}
      </section>
    </main>
  </div>;
}
