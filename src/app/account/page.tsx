import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AuthShell } from '../auth/auth-shell';
import { LogoutForm } from './logout-form';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;
  if (error || typeof subject !== 'string' || !subject) redirect('/login');

  const email = typeof data?.claims.email === 'string' ? data.claims.email : null;
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles').select('id, display_name, locale').eq('id', subject).maybeSingle();

  return <AuthShell title="Your account">
    <p className="font-medium text-navy">You are authenticated.</p>
    <dl className="space-y-4 rounded-xl border border-navy/15 p-6">
      {email && <div><dt className="text-sm">Email</dt><dd className="break-words font-medium">{email}</dd></div>}
      {profile?.display_name && <div><dt className="text-sm">Display name</dt><dd className="font-medium">{profile.display_name}</dd></div>}
      <div><dt className="text-sm">Locale</dt><dd className="font-medium">{profile?.locale ?? 'Unavailable'}</dd></div>
      <div><dt className="text-sm">User/profile ID match</dt><dd className="font-medium">{profile ? (profile.id === subject ? 'Matched' : 'Not matched') : 'Unavailable'}</dd></div>
    </dl>
    {profileError ? <p role="alert" className="text-clay">Your profile could not be loaded. Please try again later.</p>
      : !profile && <p role="status">No accessible profile was found for your account.</p>}
    <LogoutForm />
  </AuthShell>;
}
