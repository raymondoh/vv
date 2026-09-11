import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getVenueDetail } from '@/lib/catalog/detail-query';
import { bookingLoginUrl } from '@/lib/auth/return-path';
import { establishSubmissionId } from '@/lib/booking-request/draft';
import { normalizeUuid, parseBookingRequestContext, requestContextParams, type BookingRequestParams } from '@/lib/booking-request/model';
import { bookingRequestUrl } from '@/lib/booking-request/urls';
import { eventVenueUrl, layoutSelectable, isCanonicalRequestUrl } from '@/lib/booking-request/presentation';
import { getEligibleBookingSpaces } from '@/lib/booking-request/query';
import { RequestForm } from './request-form';

export const dynamic = 'force-dynamic';

export default async function RequestPage({ params, searchParams }: {
  params: Promise<{ venueId: string }>;
  searchParams: Promise<BookingRequestParams>;
}) {
  const { venueId } = await params;
  const query = await searchParams;
  // Malformed/missing submission identities are handled only after the event and selection validate.
  const parsed = parseBookingRequestContext(venueId, { ...query, submission: undefined }, false);
  if (parsed.ok === false || !parsed.data.selectedSpaceId) {
    return <main className="mx-auto max-w-2xl space-y-6 px-6 py-12"><h1 className="text-3xl font-semibold text-navy">Check your request details</h1><p role="alert">Choose a space with a valid guest count and both event dates from the venue page.</p><Link href="/" className="text-clay underline">Back to discovery</Link></main>;
  }
  const existingId = normalizeUuid(query.submission);
  const context = { ...parsed.data, submissionId: existingId ?? establishSubmissionId(query.submission) };
  const canonical = bookingRequestUrl(context.venueId, requestContextParams(context))!;
  if (!existingId || !isCanonicalRequestUrl(venueId, query, canonical)) redirect(canonical);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims.sub !== 'string' || !data.claims.sub) redirect(bookingLoginUrl(canonical));
  const venue = await getVenueDetail(context.venueId);
  if (!venue) notFound();
  const back = eventVenueUrl(venue.id, venue.slug, requestContextParams(context));
  const eligibility = await getEligibleBookingSpaces(context);
  const space = venue.spaces.find((item) => item.id === context.selectedSpaceId);
  const layout = space?.layouts.find((item) => item.id === context.selectedLayoutId);
  const stale = !space || (eligibility.ok === true && !eligibility.data.includes(space.id))
    || (context.selectedLayoutId !== null && (!layout || !layoutSelectable(layout.capacity, context.guests)));
  return <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
    <Link href={back} className="text-clay underline">← Back to venue and event details</Link>
    <h1 className="text-3xl font-semibold text-navy">Request to book</h1>
    {eligibility.ok === false ? <p role="alert">We couldn’t check these event details. Please try again.</p>
      : stale || !space ? <p role="alert">This space or layout no longer matches your event details. Choose another space or change your dates.</p>
      : <>
        <dl className="grid gap-4 rounded-2xl border border-navy/15 bg-white/50 p-6">
          <div><dt className="text-sm">Venue</dt><dd className="font-semibold">{venue.name}</dd></div>
          <div><dt className="text-sm">Selected space</dt><dd>{space.name}</dd></div>
          <div><dt className="text-sm">Guests</dt><dd>{context.guests}</dd></div>
          <div><dt className="text-sm">Local event start</dt><dd>{context.startLocal.replace('T', ' ')}</dd></div>
          <div><dt className="text-sm">Local event end</dt><dd>{context.endLocal.replace('T', ' ')}</dd></div>
        </dl>
        <p>Times are local to this venue.</p>
        <p className="text-sm">Availability is a current snapshot. Sending a request does not reserve the space.</p>
        <RequestForm key={context.submissionId} context={context} canonical={canonical} layouts={space.layouts.map(({ id, name, layoutType, capacity }) => ({ id, name, layoutType, capacity }))} />
      </>}
  </main>;
}
