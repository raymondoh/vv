'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import { approveRequest, finishApproval } from './approve';
import { approvalBookingId, type ApprovalState, type ApprovalResult } from './approval';

export async function approveBooking(_previous: ApprovalState, form: FormData): Promise<ApprovalState> {
  const bookingId = approvalBookingId(form);
  if (!bookingId) return { code: 'UNAVAILABLE' };
  let result: ApprovalResult;
  try { result = await approveRequest(await createClient(), form); }
  catch { return { code: 'UNEXPECTED' }; }
  return finishApproval(result, bookingId, { revalidate: revalidatePath, redirect });
}
