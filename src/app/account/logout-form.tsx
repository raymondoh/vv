'use client';

import { useActionState } from 'react';
import { logout, type AuthState } from '../auth/actions';

export function LogoutForm() {
  const [state, action, pending] = useActionState(logout, {} as AuthState);
  return <form action={action} className="space-y-3">
    {state.error && <p role="alert" className="text-clay">{state.error}</p>}
    <button disabled={pending} className="rounded-lg bg-navy px-5 py-3 font-semibold text-linen disabled:opacity-60">
      {pending ? 'Signing out…' : 'Log out'}
    </button>
  </form>;
}
