'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { authenticate, type AuthState } from './actions';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [state, action, pending] = useActionState(authenticate.bind(null, mode), {} as AuthState);
  const signup = mode === 'signup';
  if (state.confirmation) {
    return <div role="status" className="space-y-4 leading-7">
      <h2 className="text-xl font-semibold text-navy">Check your email</h2>
      <p>If confirmation is needed, follow the link in your email in this browser to finish signing up. If you already have an account, sign in.</p>
      <Link href="/login" className="text-clay underline">Go to login</Link>
    </div>;
  }
  return <form action={action} className="space-y-5">
    <div>
      <label htmlFor="email" className="mb-2 block font-medium">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required
        className="w-full rounded-lg border border-navy/25 bg-white p-3 focus:outline-2 focus:outline-clay" />
    </div>
    <div>
      <label htmlFor="password" className="mb-2 block font-medium">Password</label>
      <input id="password" name="password" type="password" required minLength={signup ? 8 : undefined}
        autoComplete={signup ? 'new-password' : 'current-password'} aria-describedby={signup ? 'password-hint' : undefined}
        className="w-full rounded-lg border border-navy/25 bg-white p-3 focus:outline-2 focus:outline-clay" />
      {signup && <p id="password-hint" className="mt-2 text-sm">Use at least 8 characters.</p>}
    </div>
    {state.error && <p role="alert" className="text-sm text-clay">{state.error}</p>}
    <button disabled={pending} className="w-full rounded-lg bg-navy px-5 py-3 font-semibold text-linen disabled:opacity-60">
      {pending ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
    </button>
  </form>;
}
