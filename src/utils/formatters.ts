/**
 * Currency and Location Formatting Helpers
 */

export function getCurrencySymbol(currency: string = 'GBP'): string {
  switch (currency.toUpperCase()) {
    case 'GBP':
      return '£';
    case 'EUR':
      return '€';
    case 'USD':
      return '$';
    case 'CAD':
      return 'CA$';
    case 'AUD':
      return 'A$';
    default:
      return '£';
  }
}

export function formatCurrency(
  amount: number,
  currency: string = 'GBP',
  includeDecimals: boolean = false
): string {
  const symbol = getCurrencySymbol(currency);
  const formattedNumber = includeDecimals
    ? amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amount.toLocaleString('en-GB');

  return `${symbol}${formattedNumber}`;
}

export function formatLocationString(location: {
  city: string;
  state?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}): string {
  const city = location.city || '';
  const area = location.region || location.state || '';
  const country = location.country && location.countryCode !== 'GB' && location.country !== 'United Kingdom' ? location.country : '';

  const parts = [city, area, country].filter(Boolean);
  return parts.join(', ');
}

export const formatLocation = formatLocationString;

/**
 * Shared date display formatter for UI presentation.
 * Uses UK (en-GB) display formatting by default.
 * Internal/API dates remain ISO strings (e.g., '2026-11-25' or ISO timestamps).
 *
 * @param dateInput ISO date string (e.g. "2026-11-25"), ISO timestamp, or Date object
 * @param format 'readable' (e.g. "25 November 2026"), 'compact' (e.g. "25/11/2026"), or 'short' (e.g. "25 Nov 2026")
 * @param locale default 'en-GB'
 */
export function formatDateDisplay(
  dateInput: string | Date | undefined | null,
  format: 'readable' | 'compact' | 'short' = 'readable',
  locale: string = 'en-GB'
): string {
  if (!dateInput) return '';

  try {
    let date: Date;
    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      // Safe parsing of plain date strings like "2026-11-25" avoiding timezone shifts
      const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10) - 1;
        const day = parseInt(ymdMatch[3], 10);
        date = new Date(year, month, day);
      } else {
        date = new Date(trimmed);
      }
    } else {
      date = dateInput;
    }

    if (isNaN(date.getTime())) return String(dateInput);

    if (format === 'compact') {
      // 25/11/2026
      return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }

    if (format === 'short') {
      // 25 Nov 2026
      return date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }

    // Default 'readable': 25 November 2026
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(dateInput);
  }
}

export function formatCompactDate(
  dateInput: string | Date | undefined | null,
  locale: string = 'en-GB'
): string {
  return formatDateDisplay(dateInput, 'compact', locale);
}

export function formatReadableDate(
  dateInput: string | Date | undefined | null,
  locale: string = 'en-GB'
): string {
  return formatDateDisplay(dateInput, 'readable', locale);
}

