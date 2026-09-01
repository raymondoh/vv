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
