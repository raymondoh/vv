import { AvailableDaySlot, Venue } from '../types';

/**
 * Parses time string (e.g. "14:00", "09:30", "1:30 PM", "6:30 PM (Golden Hour Tour)") into 24-hour hour & minute.
 */
export function parseTimeStringTo24H(timeStr: string): { hour: number; minute: number } | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();
  const match = trimmed.match(/(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();

  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

/**
 * Returns today's date in YYYY-MM-DD for the given timezone (default Europe/London).
 */
export function getVenueTodayDateString(timezone: string = 'Europe/London'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Checks whether a given slot date and optional time is strictly in the future for the venue's timezone.
 */
export function isSlotInFuture(
  dateStr: string,
  timeStr?: string,
  timezone: string = 'Europe/London'
): boolean {
  if (!dateStr) return false;

  const todayStr = getVenueTodayDateString(timezone);

  // Compare date strings lexicographically (YYYY-MM-DD)
  if (dateStr < todayStr) {
    return false;
  }
  if (dateStr > todayStr) {
    return true;
  }

  // Same day: if no time specified, consider bookable
  if (!timeStr) {
    return true;
  }

  // Same day with time specified: check current hour & minute in venue timezone
  try {
    const now = new Date();
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = timeFormatter.formatToParts(now);
    const currentHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const currentMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

    const parsed = parseTimeStringTo24H(timeStr);
    if (!parsed) return true; // If unparseable, don't arbitrarily reject future same-day

    if (parsed.hour > currentHour) return true;
    if (parsed.hour === currentHour && parsed.minute > currentMinute) return true;

    return false;
  } catch {
    return true;
  }
}

/**
 * Determines period of the day from a time string.
 */
export function determineTimePeriod(timeStr: string): 'morning' | 'afternoon' | 'sunset' {
  const parsed = parseTimeStringTo24H(timeStr);
  if (!parsed) return 'afternoon';
  if (parsed.hour < 12) return 'morning';
  if (parsed.hour < 17) return 'afternoon';
  return 'sunset';
}

/**
 * Returns only genuine customer-bookable future slots for a venue.
 * - Filters out dates before today in the venue's timezone.
 * - Filters out same-day times that have already passed.
 * - Filters out times with available === false.
 * - Excludes days that have zero remaining available times.
 * - Sorts days chronologically.
 */
export function getBookableLiveTourSlots(venue?: Venue | null): AvailableDaySlot[] {
  if (!venue || !Array.isArray(venue.availableSlots) || venue.availableSlots.length === 0) {
    return [];
  }

  const tz = venue.location?.timezone || 'Europe/London';

  const bookableDays: AvailableDaySlot[] = [];

  for (const day of venue.availableSlots) {
    if (!day || !day.date || !Array.isArray(day.times)) continue;

    // Filter times to those that are marked available AND strictly in the future
    const validFutureTimes = day.times.filter((t) => {
      if (!t || t.available === false) return false;
      return isSlotInFuture(day.date, t.time, tz);
    });

    if (validFutureTimes.length > 0) {
      bookableDays.push({
        date: day.date,
        times: validFutureTimes,
      });
    }
  }

  // Sort chronologically by date
  return bookableDays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Returns true only if the venue has at least one genuinely bookable future slot.
 */
export function hasBookableLiveTourSlots(venue?: Venue | null): boolean {
  return getBookableLiveTourSlots(venue).length > 0;
}

/**
 * Returns all future slots for a venue (including booked/unavailable times).
 * Used by the Venue Host to view, add, and remove availability.
 * Filters out times that have already passed (including same-day past times),
 * while retaining both available and booked/unavailable future times.
 */
export function getHostFutureSlots(venue?: Venue | null): AvailableDaySlot[] {
  if (!venue || !Array.isArray(venue.availableSlots) || venue.availableSlots.length === 0) {
    return [];
  }

  const tz = venue.location?.timezone || 'Europe/London';
  const todayStr = getVenueTodayDateString(tz);

  const futureDays: AvailableDaySlot[] = [];

  for (const slot of venue.availableSlots) {
    if (!slot || !slot.date || slot.date < todayStr || !Array.isArray(slot.times)) continue;

    // Filter out past same-day times, retaining both available and unavailable future times
    const validTimes = slot.times.filter((t) => isSlotInFuture(slot.date, t.time, tz));

    if (validTimes.length > 0) {
      futureDays.push({
        date: slot.date,
        times: validTimes,
      });
    }
  }

  return futureDays.sort((a, b) => a.date.localeCompare(b.date));
}
