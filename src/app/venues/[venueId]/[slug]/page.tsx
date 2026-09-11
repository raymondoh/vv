import { PublicCatalogImage } from '@/app/_components/public-image';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getVenueDetail } from '@/lib/catalog/detail-query';
import { canonicalVenueRedirect, venuePath } from '@/lib/catalog/detail';
import { formatMoney } from '@/lib/catalog/money';

import { eventContext, eventVenueUrl } from '@/lib/booking-request/presentation';
import { firstValue, requestContextParams, type BookingRequestParams } from '@/lib/booking-request/model';
import { bookingRequestUrl } from '@/lib/booking-request/urls';
import { getEligibleBookingSpaces } from '@/lib/booking-request/query';

export const dynamic = 'force-dynamic';
const units = { hourly: 'per hour', daily: 'per day', flat: 'flat rate' } as const;

export default async function VenuePage({ params, searchParams }: {
  params: Promise<{ venueId: string; slug: string }>;
  searchParams: Promise<BookingRequestParams>;
}) {
  const { venueId, slug } = await params;
  const venue = await getVenueDetail(venueId);
  if (!venue) notFound();
  const query = await searchParams;
  const { absent, context } = eventContext(venueId, query);
  const canonical = canonicalVenueRedirect(venue, slug);
  if (canonical) permanentRedirect(eventVenueUrl(venue.id, venue.slug, query));
  const eligibility = context ? await getEligibleBookingSpaces(context) : null;
  const address = [venue.addressLine1, venue.addressLine2, venue.city, venue.region, venue.postalCode, venue.countryCode].filter(Boolean).join(', ');
  return <main className="mx-auto max-w-6xl px-6 py-12 sm:px-12">
    <Link href="/" className="font-medium text-clay">← Back to discovery</Link>
    <h1 className="mt-10 text-4xl font-semibold text-navy sm:text-6xl">{venue.name}</h1>
    {address && <p className="mt-5 text-slate/75">{address}</p>}
    {venue.heroImage ? <PublicCatalogImage image={venue.heroImage} className="mt-8 h-52 rounded-2xl" /> : <div aria-hidden="true" className="mt-8 flex h-52 items-end justify-center gap-8 overflow-hidden rounded-2xl bg-navy/5 pt-8">
      <div className="h-32 w-20 border border-navy/15 bg-linen" />
      <div className="h-44 w-32 rounded-t-full border border-clay/30 bg-clay/10" />
      <div className="h-24 w-16 border border-navy/15 bg-linen" />
    </div>}
    {venue.description && <p className="mt-8 max-w-3xl whitespace-pre-line leading-8">{venue.description}</p>}
    {venue.galleryImages.length > 0 && <section aria-labelledby="gallery-heading" className="mt-12">
      <h2 id="gallery-heading" className="text-3xl font-semibold text-navy">Gallery</h2>
      <div className={`mt-6 grid gap-6 ${venue.galleryImages.length === 1 ? 'grid-cols-1' : venue.galleryImages.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {venue.galleryImages.map((image) => <figure key={image.id} className="overflow-hidden rounded-2xl border border-navy/15 bg-white/50">
          <PublicCatalogImage image={image} className={venue.galleryImages.length === 1 ? 'aspect-[16/9] h-auto' : 'aspect-[4/3] h-auto'} />
          {image.caption && <figcaption className="p-4 text-sm leading-6 text-slate/80">{image.caption}</figcaption>}
        </figure>)}
      </div>
    </section>}
    <section aria-labelledby="event-heading" className="mt-12 rounded-2xl border border-navy/15 p-6">
      <h2 id="event-heading" className="text-2xl font-semibold text-navy">Your event details</h2>
      <p className="mt-2">Times are local to this venue.</p>
      {!absent && !context && <p role="alert" className="mt-3 text-clay">Enter a valid guest count and both local dates, with the end after the start.</p>}
      <form action={venuePath(venue.id, venue.slug)} method="get" className="mt-5 flex flex-wrap items-end gap-4">
        <label className="grid gap-2">Guests<input name="guests" type="number" min="1" max="100000" step="1" required defaultValue={firstValue(query.guests) ?? ''} className="rounded-lg border border-navy/25 bg-white p-3" /></label>
        <label className="grid gap-2">Start<input name="start" type="datetime-local" step="60" required defaultValue={firstValue(query.start) ?? ''} className="rounded-lg border border-navy/25 bg-white p-3" /></label>
        <label className="grid gap-2">End<input name="end" type="datetime-local" step="60" required defaultValue={firstValue(query.end) ?? ''} className="rounded-lg border border-navy/25 bg-white p-3" /></label>
        <button className="rounded-lg bg-navy px-5 py-3 text-linen focus-visible:outline-2 focus-visible:outline-clay">Check spaces</button>
      </form>
      {eligibility?.ok === false && <p role="alert" className="mt-4 text-clay">We couldn’t check these event details. Check your dates and try again.</p>}
      {eligibility?.ok === true && <p role="status" className="mt-4 text-sm">Availability is a current snapshot. Sending a request does not reserve the space.</p>}
    </section>
    <section aria-labelledby="spaces-heading" className="mt-12">
      <h2 id="spaces-heading" className="text-3xl font-semibold text-navy">Spaces</h2>
      {!venue.spaces.length && <p className="mt-6">Space details are not available yet.</p>}
      <div className="mt-6 space-y-8">
        {venue.spaces.map((space) => <article key={space.id} className="space-y-5 rounded-2xl border border-navy/15 bg-white/50 p-6 sm:p-8">
          {context && eligibility?.ok === true && (eligibility.data.includes(space.id)
            ? <Link className="inline-block font-semibold text-clay underline focus-visible:outline-2" href={bookingRequestUrl(venue.id, { ...requestContextParams(context), space: space.id })!}>Request this space</Link>
            : <p className="text-sm text-slate/75">Not eligible for these event details.</p>)}
          <h3 className="text-2xl font-semibold text-navy">{space.name}</h3>
          {space.heroImage && <PublicCatalogImage image={space.heroImage} className="h-48 rounded-xl sm:h-64" />}
          {space.description && <p className="whitespace-pre-line leading-7">{space.description}</p>}
          <dl className="flex flex-wrap gap-6 text-sm">
            {space.squareMeters !== null && <div><dt>Area</dt><dd>{space.squareMeters.toLocaleString('en')} m²</dd></div>}
            {space.seatedCapacity !== null && <div><dt>Seated capacity</dt><dd>{space.seatedCapacity.toLocaleString('en')}</dd></div>}
            {space.standingCapacity !== null && <div><dt>Standing capacity</dt><dd>{space.standingCapacity.toLocaleString('en')}</dd></div>}
            {space.theatreCapacity !== null && <div><dt>Theatre capacity</dt><dd>{space.theatreCapacity.toLocaleString('en')}</dd></div>}
          </dl>
          {space.galleryImages.length > 0 && <section aria-labelledby={`space-gallery-${space.id}`}>
            <h4 id={`space-gallery-${space.id}`} className="font-semibold text-navy">Space gallery</h4>
            <div className={`mt-3 grid max-w-3xl gap-4 ${space.galleryImages.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
              {space.galleryImages.map((image) => <figure key={image.id} className="overflow-hidden rounded-xl border border-navy/10">
                <PublicCatalogImage image={image} className="h-44 sm:h-52" />
                {image.caption && <figcaption className="p-3 text-sm leading-6 text-slate/80">{image.caption}</figcaption>}
              </figure>)}
            </div>
          </section>}
          {space.layouts.length > 0 && <section aria-labelledby={`layouts-${space.id}`}>
            <h4 id={`layouts-${space.id}`} className="font-semibold text-navy">Layouts</h4>
            <ul className="mt-3 space-y-4">
              {space.layouts.map((layout) => <li key={layout.id} className="border-l-2 border-clay/30 pl-4">
                <h5 className="font-medium">{layout.name}</h5>
                <p className="text-sm text-slate/75">{layout.layoutType.replaceAll('_', ' ')}</p>
                {layout.description && <p className="mt-1 text-sm leading-6">{layout.description}</p>}
                {layout.capacity !== null && <p className="mt-1 text-sm">Capacity: {layout.capacity.toLocaleString('en')}</p>}
              </li>)}
            </ul>
          </section>}
          <div className="border-t border-navy/10 pt-5">
            {space.basePrice ? <>
              <p className="font-semibold text-navy">{formatMoney(space.basePrice.amountMinor, venue.currency)} {units[space.basePrice.model]}</p>
              <p className="mt-1 text-xs leading-5 text-slate/70">Today’s base rate in the venue’s local time ({venue.timezone}). This is not a booking quote; final pricing and availability vary by date.</p>
            </> : <p className="text-sm text-slate/75">Pricing on request</p>}
          </div>
        </article>)}
      </div>
    </section>
  </main>;
}
