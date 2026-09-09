'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type AuthState = { error?: string; confirmation?: boolean };

export async function authenticate(mode: 'login' | 'signup', _state: AuthState, form: FormData): Promise<AuthState> {
  const emailValue = form.get('email');
  const password = form.get('password');
  const email = typeof emailValue === 'string' ? emailValue.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || !password) {
    return { error: 'Enter a valid email address and your password.' };
  }
  if (mode !== 'login' && mode !== 'signup') return { error: 'Invalid request.' };
  if (mode === 'signup' && password.length < 8) {
    return { error: 'Use at least 8 characters for your password.' };
  }

  try {
    const supabase = await createClient();
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: 'Unable to sign in. Check your email and password, and confirm your email if required.' };
    } else {
      // Next.js validates Server Action origins against the host. Do not accept a redirect URL from form data.
      const origin = (await headers()).get('origin');
      if (!origin || !/^https?:$/.test(new URL(origin).protocol)) {
        return { error: 'Unable to start signup. Reload this page and try again.' };
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: new URL('/auth/callback', origin).toString() },
      });
      // Profile creation belongs exclusively to the database trigger; no metadata or profile writes.
      if (error) return { error: 'Unable to create an account. Check your details and password requirements, or try again later.' };
      if (!data.session) return { confirmation: true };
    }
  } catch {
    return { error: 'Authentication is temporarily unavailable. Please try again.' };
  }
  revalidatePath('/', 'layout');
  redirect('/account');
}

export async function logout(): Promise<AuthState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return { error: 'Unable to sign out. Please try again.' };
  } catch {
    return { error: 'Unable to sign out. Please try again.' };
  }
  revalidatePath('/', 'layout');
  redirect('/login');
}
