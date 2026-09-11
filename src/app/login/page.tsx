import { safeBookingReturnPath } from '@/lib/auth/return-path';
import { firstValue, type QueryValue } from '@/lib/booking-request/model';
import { authReturnUrl } from '@/lib/booking-request/presentation';
import Link from 'next/link';
import { AuthForm } from '../auth/auth-form';
import { AuthShell } from '../auth/auth-shell';

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string; next?: QueryValue }>;
}) {
  const { error, next: suppliedNext } = await searchParams;
  const next = safeBookingReturnPath(firstValue(suppliedNext));
  return <AuthShell title="Welcome back">
    {error === 'callback' && <p role="alert" className="text-clay">This sign-in link could not be verified. It may have expired or been opened in a different browser. Try logging in or use a fresh confirmation link.</p>}
    <AuthForm mode="login" next={next} />
    <p>New to VV? <Link href={authReturnUrl('/signup', next)} className="text-clay underline">Create an account</Link></p>
  </AuthShell>;
}
