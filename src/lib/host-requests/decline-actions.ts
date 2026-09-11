'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import { declineRequest, finishDecline } from './decline-request';
import { declineBookingId, type DeclineState, type DeclineResult } from './decline';

export async function declineBooking(_previous: DeclineState, form: FormData): Promise<DeclineState> {
  const bookingId = declineBookingId(form);
  if (!bookingId) return { code: 'UNAVAILABLE' };
  let result: DeclineResult;
  try { result = await declineRequest(await createClient(), form); }
  catch { return { code: 'UNEXPECTED' }; }
  return finishDecline(result, bookingId, { revalidate: revalidatePath, redirect });
}
