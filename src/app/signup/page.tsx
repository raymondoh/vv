import { safeBookingReturnPath } from '@/lib/auth/return-path';
import { firstValue, type QueryValue } from '@/lib/booking-request/model';
import { authReturnUrl } from '@/lib/booking-request/presentation';
import Link from 'next/link';
import { AuthForm } from '../auth/auth-form';
import { AuthShell } from '../auth/auth-shell';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: QueryValue }> }) {
  const next = safeBookingReturnPath(firstValue((await searchParams).next));
  return <AuthShell title="Create your account">
    <AuthForm mode="signup" next={next} />
    <p>Already have an account? <Link href={authReturnUrl('/login', next)} className="text-clay underline">Log in</Link></p>
  </AuthShell>;
}
