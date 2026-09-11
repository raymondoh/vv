import { safeBookingReturnPath } from '@/lib/auth/return-path';
import { authReturnUrl } from '@/lib/booking-request/presentation';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safeBookingReturnPath(request.nextUrl.searchParams.get('next'));
  const failure = new URL(authReturnUrl('/login', next), request.url);
  failure.searchParams.set('error', 'callback');
  let destination = failure.pathname + failure.search;
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) destination = next ?? '/account';
    } catch {
      // Do not log authorization codes or return provider internals.
    }
  }
  // Validated same-origin destinations prevent open redirects. The shared server
  // client writes session cookies through Next's Route Handler cookie store.
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
