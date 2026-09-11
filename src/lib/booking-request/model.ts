import { normalizeCatalogSearch } from '../catalog/search';

export type QueryValue = string | string[] | undefined;
export type BookingRequestParams = {
  guests?: QueryValue; start?: QueryValue; end?: QueryValue;
  space?: QueryValue; layout?: QueryValue; submission?: QueryValue;
};
export type BookingRequestContext = {
  venueId: string; guests: number; startLocal: string; endLocal: string;
  selectedSpaceId: string | null; selectedLayoutId: string | null;
  submissionId: string | null;
};
export type RequestFields = { eventType: string | null; notes: string | null };
export type BookingErrorCode = 'AUTH_REQUIRED' | 'INVALID_INPUT' | 'SPACE_NO_LONGER_ELIGIBLE'
  | 'SUBMISSION_CONFLICT' | 'VENUE_UNAVAILABLE' | 'UNPRICED_CONFIGURATION' | 'UNEXPECTED';
export type Result<T> = { ok: true; data: T } | { ok: false; code: BookingErrorCode };
export type SubmissionResult = {
  bookingId: string; bookingReference: string; status: string;
  customerTotalMinor: number; depositAmountMinor: number; finalAmountMinor: number;
  finalDueAt: string;
};
export type CustomerConfirmation = {
  bookingId: string; bookingReference: string; venueId: string;
  bookingStatus: string; paymentStatus: string; eventStartsAt: string; eventEndsAt: string;
  guests: number | null; currency: string; customerTotalMinor: number;
  venueName: string | null; venueTimezone: string | null;
  items: { id: string; spaceId: string; layoutId: string | null; startsAt: string; endsAt: string;
    spaceName: string | null; layoutName: string | null }[];
  schedule: { id: string; installment: 'deposit' | 'final'; amountMinor: number;
    currency: string; dueAt: string | null; status: string; paidAt: string | null }[];
};

export function firstValue(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Canonical UUID structure, without imposing an unrelated UUID version requirement. */
export function normalizeUuid(value: QueryValue): string | null {
  const first = firstValue(value);
  return typeof first === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(first)
    ? first.toLowerCase() : null;
}

export function parseBookingRequestContext(
  venueId: string, params: BookingRequestParams, requireSubmission = true,
): Result<BookingRequestContext> {
  // Reuse discovery's exact calendar, local-order, duplicate and guest rules.
  // Both dates and guests are mandatory here, even though discovery permits absence.
  const search = normalizeCatalogSearch(params);
  const venue = normalizeUuid(venueId);
  const selectedSpaceId = normalizeUuid(params.space);
  const selectedLayoutId = normalizeUuid(params.layout);
  const submissionId = normalizeUuid(params.submission);
  const attempted = (value: QueryValue) => !!firstValue(value)?.trim();
  if (!venue || search.guests === null || search.timeError !== null || !search.startLocal || !search.endLocal
      || (attempted(params.space) && !selectedSpaceId)
      || (attempted(params.layout) && !selectedLayoutId)
      || (selectedLayoutId !== null && selectedSpaceId === null)
      || (attempted(params.submission) && !submissionId)
      || (requireSubmission && !submissionId)) return { ok: false, code: 'INVALID_INPUT' };
  return { ok: true, data: {
    venueId: venue, guests: search.guests, startLocal: search.startLocal, endLocal: search.endLocal,
    selectedSpaceId, selectedLayoutId, submissionId,
  } };
}

export function normalizeRequestFields(eventType: unknown, notes: unknown): Result<RequestFields> {
  if ((eventType != null && typeof eventType !== 'string') || (notes != null && typeof notes !== 'string')) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  const event = typeof eventType === 'string' ? eventType.trim() || null : null;
  const detail = typeof notes === 'string' ? notes.trim() || null : null;
  // Count Unicode code points, not UTF-16 units. SQL remains authoritative.
  if ((event && Array.from(event).length > 120) || (detail && Array.from(detail).length > 2000)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  return { ok: true, data: { eventType: event, notes: detail } };
}

export function requestContextParams(context: BookingRequestContext): BookingRequestParams {
  return { guests: String(context.guests), start: context.startLocal, end: context.endLocal,
    space: context.selectedSpaceId ?? undefined, layout: context.selectedLayoutId ?? undefined,
    submission: context.submissionId ?? undefined };
}

/** For draft establishment only. Submission/retry paths must never call this. */
export function resolveDraftSubmissionId(value: QueryValue, generate: () => string): string {
  const existing = normalizeUuid(value);
  if (existing) return existing;
  const created = normalizeUuid(generate());
  if (!created) throw new Error('Invalid generated submission identity');
  return created;
}
