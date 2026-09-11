import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDraftSubmissionId, type QueryValue } from './model';

/** Call only when establishing a draft URL, never in a submission action or retry. */
export function establishSubmissionId(value: QueryValue): string {
  return resolveDraftSubmissionId(value, randomUUID);
}
