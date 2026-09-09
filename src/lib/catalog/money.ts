/** Format at the presentation edge; ISO currency precision is not always two digits. */
export function formatMoney(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('Invalid minor-unit amount');
  const formatter = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
}
