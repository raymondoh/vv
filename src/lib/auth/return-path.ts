import { normalizeUuid } from '../booking-request/model';
import { parsePage } from '../customer-events/model';
import { bookingRequestUrl } from '../booking-request/urls';

/** Strict request/host path allowlist. Only canonical local destinations survive. */
export function safeBookingReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('#')) return null;
  try {
    if (/[\\\u0000-\u001f\u007f]/.test(value) || /[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(value))) return null;
    const [path] = value.split('?');
    if (path === '/host' && value === path) return '/host/requests';
    if (path === '/host/requests') {
      const host = new URL(value, 'https://vv.invalid');
      if ([...host.searchParams.keys()].some(key => key !== 'page') || host.searchParams.getAll('page').length > 1) return null;
      const page = host.searchParams.has('page') ? parsePage(host.searchParams.get('page')) : 1;
      return page === null ? null : page === 1 ? path : `${path}?page=${page}`;
    }
    const detail = /^\/host\/bookings\/([0-9a-f-]+)$/i.exec(path);
    if (detail) {
      const id = normalizeUuid(detail[1]);
      return id && value === path ? `/host/bookings/${id}` : null;
    }
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
