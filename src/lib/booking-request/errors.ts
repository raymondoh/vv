import type { BookingErrorCode } from './model';

const inputMessages = new Set([
  'Submission ID is required', 'Event start and end times are required',
  'Event end time must be after event start time', 'Booking request event must start in the future',
  'Event type must contain between 1 and 120 characters', 'Guest count must be between 1 and 100000',
  'Selected items must be a JSON array', 'At least one space must be selected',
  'A booking request may contain at most 20 selected spaces', 'Request details must be a JSON object',
  'Every selected item must be a JSON object', 'Every selected item requires a space_id',
  'Booking item end time must be after its start time', 'Booking item period must fall within the overall event period',
  'Selected space does not belong to booking venue', 'Selected space is not active',
  'The same space cannot be selected for overlapping item periods',
  'Selected layout does not belong to selected space', 'Selected layout is not active',
  'Guest count exceeds the selected layout capacity',
  'Booking item is shorter than the minimum duration for its space',
  'Booking item exceeds the maximum duration for its space',
  'Booking item does not satisfy the minimum notice period',
  'Booking item is beyond the maximum advance-booking period',
]);
const pricingMessages = new Set([
  'Venue organization has no effective commercial terms',
  'Selected space has no applicable active rate plan for the event date',
  'Selected space has multiple applicable rate plans with the same highest priority',
  'Calculated billing units must be positive', 'Calculated booking item amount cannot be negative',
  'Booking request contains no priced booking items',
  'Booking total is too small for the configured deposit/final payment model',
  'Configured deposit percentage cannot produce positive deposit and final installments for this booking total',
]);

/** SQLSTATE first; message allowlists disambiguate shared constraint/not-found codes. */
export function mapBookingError(error: unknown): BookingErrorCode {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'UNEXPECTED';
  const code = error.code;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  if (code === '42501') return 'AUTH_REQUIRED';
  if (['22023', '22P02', '22007', '22008'].includes(String(code))) return 'INVALID_INPUT';
  if (code === '23P01' && message === 'This space no longer matches your dates and guest count.') return 'SPACE_NO_LONGER_ELIGIBLE';
  if (code === '23505' && ['Submission ID has already been used', 'Submission ID has already been used with different request data'].includes(message)) return 'SUBMISSION_CONFLICT';
  if ((code === 'P0002' && message === 'Venue not found') || (code === '23514' && message === 'Venue is not currently published')) return 'VENUE_UNAVAILABLE';
  if (code === '23514') {
    if (inputMessages.has(message)) return 'INVALID_INPUT';
    if (pricingMessages.has(message) || message.startsWith('Unsupported pricing model ')) return 'UNPRICED_CONFIGURATION';
  }
  return 'UNEXPECTED';
}
