import 'server-only';
import { type Decision, type Evidence, type Scope, type ReadResult, type FinancialContext, type RefundWorkflowTarget,
  failure, object, providerId, parseTarget, uuid } from './model';
import { parseContext, parseOrdinaryContext } from './context';
import { verifyRefund } from './verify';
import { type ApplicationDecision, parseOrdinaryApplication, parseCompensationApplication } from './application';

export type DbResult = { data: unknown; error: { code?: string } | null };
export interface VerificationPorts {
  context(obligationId: string): Promise<DbResult>;
  ordinaryContext(refundRequestId: string): Promise<DbResult>;
  read(scope: Scope, refundId: string): Promise<ReadResult>;
  record(evidence: Evidence): Promise<DbResult>;
  reconcile(receiptId: string): Promise<DbResult>;
  applyOrdinary(refundRequestId: string, receiptId: string): Promise<DbResult>;
}
export type VerificationRequest = { refundId: string; target: RefundWorkflowTarget };
export type ProviderResult = { stage: 'provider'; code: Decision['code']; disposition: Decision['disposition']; receiptId?: string };
export type EvidenceResult = { stage: 'evidence'; code: 'VERIFIED_SUCCESS' | 'VERIFIED_UNCORRELATED'; disposition: 'accept'; receiptId: string };
export type ApplicationResult = ApplicationDecision & { stage: 'application'; target: RefundWorkflowTarget; receiptId: string };
export type ServiceResult = ProviderResult | EvidenceResult | ApplicationResult;
const providerFailure = (code: Decision['code'], retry = false): ProviderResult => ({ stage: 'provider', ...failure(code, retry) });

/** Shared evidence-only operation. No database transaction spans HTTP; recording
 * commits before callers may invoke financial application. Never expose evidence
 * from a mismatched intended context or accept caller-supplied provider objects. */
async function recordVerified(scope: Scope, refundId: string, context: FinancialContext | null, ports: VerificationPorts): Promise<ProviderResult | EvidenceResult> {
  try {
    const read = await ports.read(scope, refundId);
    if (!read.ok) return { stage: 'provider', code: read.decision.code, disposition: read.decision.disposition };
    const decision = verifyRefund(read.observation, scope, refundId, context);
    if (decision.disposition !== 'accept' || !decision.evidence) return { stage: 'provider', code: decision.code, disposition: decision.disposition };
    const recorded = await ports.record(decision.evidence);
    if (recorded.error) return providerFailure(recorded.error.code === '23514' || recorded.error.code === '23505' ? 'EVIDENCE_CONFLICT' : 'DATABASE_RETRY', recorded.error.code !== '23514' && recorded.error.code !== '23505');
    const r = Array.isArray(recorded.data) && recorded.data.length === 1 ? object(recorded.data[0]) : null;
    // A malformed record response never authorizes application; replay recovers its ID.
    if (!r || !uuid(r.refund_receipt_id) || typeof r.recording_result !== 'string' || !['recorded','existing'].includes(r.recording_result)) return providerFailure('DATABASE_RESPONSE_INVALID', true);
    return { stage: 'evidence', code: decision.code === 'VERIFIED_UNCORRELATED' ? 'VERIFIED_UNCORRELATED' : 'VERIFIED_SUCCESS', disposition: 'accept', receiptId: r.refund_receipt_id.toLowerCase() };
  } catch { return providerFailure('DATABASE_RETRY', true); }
}

export async function verifyAndReconcile(request: VerificationRequest, ports: VerificationPorts): Promise<ServiceResult> {
  const r = object(request), target = parseTarget(r?.target);
  if (!r || !target) return providerFailure('CONTEXT_UNAVAILABLE');
  if (!providerId(r.refundId, 're')) return providerFailure('MALFORMED_PROVIDER_OBJECT');
  let context: FinancialContext | null;
  try {
    const id = target.kind === 'ordinary' ? target.refundRequestId : target.obligationId;
    const loaded = await (target.kind === 'ordinary' ? ports.ordinaryContext(id) : ports.context(id));
    if (loaded.error) return providerFailure('DATABASE_RETRY', true);
    context = target.kind === 'ordinary' ? parseOrdinaryContext(loaded.data, id) : parseContext(loaded.data, id);
    if (!context) return providerFailure('CONTEXT_UNAVAILABLE');
    if (target.kind === 'ordinary' && context.refundId !== r.refundId) return providerFailure('REFUND_ID_CONFLICT');
  } catch { return providerFailure('DATABASE_RETRY', true); }
  const evidence = await recordVerified(context, r.refundId, context, ports);
  if (evidence.stage !== 'evidence') return evidence;
  const base = { stage: 'application' as const, target, receiptId: evidence.receiptId };
  try {
    const applied = target.kind === 'ordinary' ? await ports.applyOrdinary(target.refundRequestId, evidence.receiptId) : await ports.reconcile(evidence.receiptId);
    if (applied.error) return { ...base, code: 'DATABASE_RETRY', disposition: 'retry' };
    return { ...base, ...(target.kind === 'ordinary' ? parseOrdinaryApplication(applied.data, context.amountMinor) : parseCompensationApplication(applied.data, evidence.receiptId, target.obligationId)) };
  } catch { return { ...base, code: 'DATABASE_RETRY', disposition: 'retry' }; }
}

/** No target means no financial RPC. Only trusted historical scope is accepted. */
export async function verifyHistoricalEvidence(request: { refundId: string; historicalScope: Scope }, ports: VerificationPorts): Promise<ProviderResult | EvidenceResult> {
  const r = object(request), scope = object(r?.historicalScope);
  if (!r || Object.keys(r).some(k => !['refundId','historicalScope'].includes(k)) || !scope
    || scope.provider !== 'stripe' || (scope.environment !== 'test' && scope.environment !== 'live')
    || !providerId(scope.accountScope, 'acct') || !providerId(r.refundId, 're')) return providerFailure('CONTEXT_UNAVAILABLE');
  return recordVerified({ provider: scope.provider, environment: scope.environment, accountScope: scope.accountScope }, r.refundId, null, ports);
}
