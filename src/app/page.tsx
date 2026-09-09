import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCatalog } from '@/lib/catalog/query';
import type { VenueCardModel } from '@/lib/catalog/model';
import { VenueCard } from './_components/venue-card';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
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
  try {
    venues = await getCatalog();
  } catch {
    catalogFailed = true;
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
      <section aria-labelledby="venues-heading" className="mt-16">
        <h2 id="venues-heading" className="mb-8 text-2xl font-semibold text-navy">Recently published venues</h2>
        {catalogFailed ? <div role="alert" className="rounded-xl border border-clay/30 p-8">
          <h3 className="font-semibold">We couldn’t load the venues</h3>
          <p className="mt-2">Please try again in a moment.</p>
          <form action="/" method="get"><button className="mt-4 text-clay underline">Try again</button></form>
        </div> : venues.length ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => <VenueCard key={venue.id} venue={venue} />)}
        </div> : <div className="rounded-xl border border-navy/15 p-8">
          <h3 className="text-xl font-semibold text-navy">More spaces are on the way</h3>
          <p className="mt-3 text-slate/75">There are no published venues to explore yet. Please check back soon.</p>
        </div>}
      </section>
    </main>
  </div>;
}
