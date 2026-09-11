export type CatalogSearch = {
  name: string | null;
  city: string | null;
  guests: number | null;
  startLocal: string | null;
  endLocal: string | null;
  timeError: null | 'incomplete' | 'invalid' | 'order';
};
export type CatalogSearchParams = { q?: string | string[]; city?: string | string[]; guests?: string | string[]; start?: string | string[]; end?: string | string[] };

function normalize(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.trim().slice(0, 120).trim() || null : null;
}

function normalizeGuests(value: string | string[] | undefined): number | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  const text = first.trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const guests = Number(text);
  return Number.isSafeInteger(guests) && guests >= 1 && guests <= 100000 ? guests : null;
}

/** Validate wall-clock components only; venue-specific DST resolution belongs to PostgreSQL. */
function validLocalDatetime(value: string | undefined): string | null {
  if (!value || value.length !== 16) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1] ? value : null;
}

export function normalizeCatalogSearch(params: CatalogSearchParams): CatalogSearch {
  const start = Array.isArray(params.start) ? params.start[0] : params.start;
  const end = Array.isArray(params.end) ? params.end[0] : params.end;
  const startLocal = validLocalDatetime(start);
  const endLocal = validLocalDatetime(end);
  let timeError: CatalogSearch['timeError'] = null;
  // Only the empty string is absent; whitespace is an invalid attempted value.
  if (Boolean(start) !== Boolean(end)) timeError = 'incomplete';
  else if (start && end) {
    if (!startLocal || !endLocal) timeError = 'invalid';
    // Valid, fixed-width Gregorian components sort in local chronological order.
    else if (endLocal <= startLocal) timeError = 'order';
  }
  return {
    name: normalize(params.q), city: normalize(params.city), guests: normalizeGuests(params.guests),
    startLocal, endLocal, timeError,
  };
}
