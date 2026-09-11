import { bookingRequestUrl } from '../booking-request/urls';

/** Strict booking-request path allowlist. No host or raw path is carried forward. */
export function safeBookingReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('#')) return null;
  try {
    if (/[\\\u0000-\u001f\u007f]/.test(value) || /[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(value))) return null;
    const [path] = value.split('?');
    const match = /^\/venues\/([0-9a-f-]+)\/request$/i.exec(path);
    if (!match) return null;
    const url = new URL(value, 'https://vv.invalid');
    if (url.origin !== 'https://vv.invalid' || url.pathname !== path) return null;
    const first = (key: string) => url.searchParams.get(key) ?? undefined;
    return bookingRequestUrl(match[1], {
      guests: first('guests'), start: first('start'), end: first('end'),
      space: first('space'), layout: first('layout'), submission: first('submission'),
    });
  } catch {
    return null;
  }
}

export function bookingLoginUrl(returnPath: unknown): string {
  const safe = safeBookingReturnPath(returnPath);
  return safe ? `/login?${new URLSearchParams({ next: safe }).toString()}` : '/login';
}
