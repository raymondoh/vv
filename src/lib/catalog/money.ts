/** Format at the presentation edge; ISO currency precision is not always two digits. */
export function formatMoney(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('Invalid minor-unit amount');
  const formatter = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(digits);
  const minor = BigInt(amountMinor);
  const whole = minor / scale;
  const fraction = (minor % scale).toString().padStart(digits, '0');
  // Intl supplies grouping, currency placement and separators for the exact integer.
  // Replace only its zero fraction; never convert the monetary value to a float.
  return formatter.formatToParts(whole)
    .map((part) => part.type === 'fraction' ? fraction : part.value).join('');
}
