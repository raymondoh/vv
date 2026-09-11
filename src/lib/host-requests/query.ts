import 'server-only';
import { createClient } from '../supabase/server';
import { readQueue, readBooking } from './read';
import type { ReadResult, HostPage, HostBooking } from './model';

export async function getHostRequests(page: unknown): Promise<ReadResult<HostPage>> {
  try { return await readQueue(await createClient(), page); }
  catch { return { ok: false, code: 'UNEXPECTED' }; }
}
export async function getHostBooking(id: string): Promise<ReadResult<HostBooking | null>> {
  try { return await readBooking(await createClient(), id); }
  catch { return { ok: false, code: 'UNEXPECTED' }; }
}
