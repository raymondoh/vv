import { PublicCatalogImage } from './public-image';
import Link from 'next/link';
import { eventVenueUrl } from '@/lib/booking-request/presentation';
import type { BookingRequestParams } from '@/lib/booking-request/model';
import type { VenueCardModel } from '@/lib/catalog/model';
import { formatMoney } from '@/lib/catalog/money';

const units = { hourly: 'per hour', daily: 'per day', flat: 'flat rate' } as const;

export function VenueCard({ venue, bookingContext = {} }: { venue: VenueCardModel; bookingContext?: BookingRequestParams }) {
  const location = [venue.city, venue.region, venue.countryCode].filter(Boolean).join(', ');
  return <article className="overflow-hidden rounded-2xl border border-navy/15 bg-white/50">
    {venue.heroImage ? <PublicCatalogImage image={venue.heroImage} className="h-40" /> : <div aria-hidden="true" className="flex h-40 items-end justify-center gap-4 overflow-hidden bg-navy/5 px-12 pt-8">
      <div className="h-24 w-16 border border-navy/15 bg-linen" />
      <div className="h-32 w-24 rounded-t-full border border-clay/30 bg-clay/10" />
      <div className="h-20 w-12 border border-navy/15 bg-linen" />
    </div>}
    <div className="space-y-4 p-6">
      <h3 className="text-xl font-semibold text-navy">{venue.name}</h3>
      {location && <p className="text-sm text-slate/75">{location}</p>}
      {venue.description && <p className="line-clamp-3 text-sm leading-6 text-slate/80">{venue.description}</p>}
      {venue.maximumCapacity !== null && <p className="text-sm">Up to {venue.maximumCapacity.toLocaleString('en')} guests</p>}
      <div className="border-t border-navy/10 pt-4">
        {venue.startingPrice ? <>
          <p className="font-semibold text-navy">From {formatMoney(venue.startingPrice.amountMinor, venue.currency)} <span className="text-sm font-normal">{units[venue.startingPrice.model]}</span></p>
          <p className="mt-1 text-xs leading-5 text-slate/70">Today’s base rate in the venue’s local time. Final pricing and availability vary by date.</p>
        </> : <p className="text-sm text-slate/75">Pricing on request</p>}
      </div>
      <Link href={eventVenueUrl(venue.id, venue.slug, bookingContext)} className="inline-block font-medium text-clay underline" aria-label={`View ${venue.name}`}>View venue</Link>
    </div>
  </article>;
}
