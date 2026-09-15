import 'server-only';
import { type Decision, type Evidence, type Scope, type ReadResult, failure, object, providerId, uuid } from './model';
import { parseContext } from './context';
import { verifyRefund } from './verify';

export type DbResult = { data: unknown; error: { code?: string } | null };
export interface VerificationPorts {
  context(obligationId: string): Promise<DbResult>;
  read(scope: Scope, refundId: string): Promise<ReadResult>;
  record(evidence: Evidence): Promise<DbResult>;
  reconcile(receiptId: string): Promise<DbResult>;
}
export type VerificationRequest = { refundId: string } & (
  | { obligationId: string; historicalScope?: never }
  // Only a trusted server event/worker may select an explicitly routed scope.
  | { obligationId?: never; historicalScope: Scope }
);
export type ServiceResult = Decision & { receiptId?: string; reconciliation?: string };

/** No DB transaction spans provider I/O. Each port RPC commits independently.
 * Future signed-webhook triggers call this SAME retrieval path. Provenance is
 * api_retrieval: accepting a caller-supplied webhook/event assertion is absent.
 */
export async function verifyAndReconcile(request: VerificationRequest, ports: VerificationPorts): Promise<ServiceResult> {
  let receiptId: string | undefined;
  try {
    if (!providerId(request.refundId, 're')) return failure('MALFORMED_PROVIDER_OBJECT');
    let context = null;
    if (request.obligationId !== undefined) {
      if (!uuid(request.obligationId)) return failure('CONTEXT_UNAVAILABLE');
      const loaded = await ports.context(request.obligationId.toLowerCase());
      if (loaded.error) return failure('DATABASE_RETRY', true);
      context = parseContext(loaded.data, request.obligationId);
      if (!context) return failure('CONTEXT_UNAVAILABLE');
    }
    const scope = context ?? request.historicalScope;
    if (!scope) return failure('CONTEXT_UNAVAILABLE');
    const read = await ports.read(scope, request.refundId);
    if (!read.ok) return read.decision;
    const decision = verifyRefund(read.observation, scope, request.refundId, context);
    if (decision.disposition !== 'accept' || !decision.evidence) {
      // Do not persist a mismatched intended association. Safe classification
      // is returned; evidence fields are not exposed as a success-shaped result.
      return { code: decision.code, disposition: decision.disposition };
    }
    const recorded = await ports.record(decision.evidence);
    if (recorded.error) return failure(recorded.error.code === '23514' || recorded.error.code === '23505' ? 'EVIDENCE_CONFLICT' : 'DATABASE_RETRY', recorded.error.code !== '23514' && recorded.error.code !== '23505');
    const row = Array.isArray(recorded.data) && recorded.data.length === 1 ? object(recorded.data[0]) : null;
    if (!row || !uuid(row.refund_receipt_id) || typeof row.recording_result !== 'string' || !['recorded', 'existing'].includes(row.recording_result)) return failure('DATABASE_RESPONSE_INVALID', true);
    receiptId = row.refund_receipt_id;
    const reconciled = await ports.reconcile(receiptId);
    if (reconciled.error) return { ...failure('DATABASE_RETRY', true), receiptId };
    const result = Array.isArray(reconciled.data) && reconciled.data.length === 1 ? object(reconciled.data[0]) : null;
    if (!result || result.evidence_id !== receiptId
      || (result.obligation_id !== null && !uuid(result.obligation_id))
      || typeof result.outcome !== 'string'
      || !['applied', 'already_applied', 'unresolved', 'manual_review'].includes(result.outcome)
      || typeof result.payment_outcome !== 'string'
      || !['updated', 'already_refunded', 'uncorrelated', 'state_follow_up', 'identity_follow_up', 'unchanged', 'not_correlated'].includes(result.payment_outcome)
      || (['applied', 'already_applied'].includes(result.outcome) && result.obligation_id === null)
      || (context && result.obligation_id !== null && result.obligation_id !== context.obligationId)) return { ...failure('DATABASE_RESPONSE_INVALID', true), receiptId };
    if (result.outcome === 'manual_review' || ['state_follow_up', 'identity_follow_up'].includes(result.payment_outcome)) {
      return { ...failure('VV_CORRELATION_MISMATCH'), receiptId, reconciliation: result.outcome };
    }
    return { code: decision.code, disposition: result.outcome === 'unresolved' ? 'retry' : 'accept', receiptId, reconciliation: result.outcome };
  } catch {
    return { ...failure('DATABASE_RETRY', true), ...(receiptId ? { receiptId } : {}) };
  }
}
