import { PublicCatalogImage } from '@/app/_components/public-image';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getVenueDetail } from '@/lib/catalog/detail-query';
import { canonicalVenueRedirect } from '@/lib/catalog/detail';
import { formatMoney } from '@/lib/catalog/money';

export const dynamic = 'force-dynamic';
const units = { hourly: 'per hour', daily: 'per day', flat: 'flat rate' } as const;

export default async function VenuePage({ params }: {
  params: Promise<{ venueId: string; slug: string }>;
}) {
  const { venueId, slug } = await params;
  const venue = await getVenueDetail(venueId);
  if (!venue) notFound();
  const canonical = canonicalVenueRedirect(venue, slug);
  if (canonical) permanentRedirect(canonical);
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
    <section aria-labelledby="spaces-heading" className="mt-12">
      <h2 id="spaces-heading" className="text-3xl font-semibold text-navy">Spaces</h2>
      {!venue.spaces.length && <p className="mt-6">Space details are not available yet.</p>}
      <div className="mt-6 space-y-8">
        {venue.spaces.map((space) => <article key={space.id} className="space-y-5 rounded-2xl border border-navy/15 bg-white/50 p-6 sm:p-8">
          <h3 className="text-2xl font-semibold text-navy">{space.name}</h3>
          {space.description && <p className="whitespace-pre-line leading-7">{space.description}</p>}
          <dl className="flex flex-wrap gap-6 text-sm">
            {space.squareMeters !== null && <div><dt>Area</dt><dd>{space.squareMeters.toLocaleString('en')} m²</dd></div>}
            {space.seatedCapacity !== null && <div><dt>Seated capacity</dt><dd>{space.seatedCapacity.toLocaleString('en')}</dd></div>}
            {space.standingCapacity !== null && <div><dt>Standing capacity</dt><dd>{space.standingCapacity.toLocaleString('en')}</dd></div>}
            {space.theatreCapacity !== null && <div><dt>Theatre capacity</dt><dd>{space.theatreCapacity.toLocaleString('en')}</dd></div>}
          </dl>
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
