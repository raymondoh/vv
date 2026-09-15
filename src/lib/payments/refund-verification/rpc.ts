import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/database.types';
import type { Evidence } from './model';
import { createStripeReader, environmentRoute } from './stripe-reader';
import { verifyAndReconcile, type VerificationRequest, type VerificationPorts } from './service';

/** Exact narrow RPC contracts for unapplied migrations. Do not hand-edit the
 * generated database file; replace this overlay after authorized regeneration.
 */
type ContextRow = {
  obligation_id: string; provider: string; integration_environment: string;
  provider_account_scope: string; provider_refund_id: string | null;
  provider_payment_id: string; provider_charge_id: string; amount_minor: number;
  currency_code: string; booking_id: string | null; payment_id: string | null;
  correlation_status: string; candidate_count: number;
};
type VerificationDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & { Functions: Database['public']['Functions'] & {
    get_payment_refund_verification_context: { Args: { target_obligation_id: string }; Returns: ContextRow[] };
    record_payment_refund_success_evidence: { Args: {
      provider_value: string; environment_value: string; account_scope_value: string;
      refund_id_value: string; payment_id_value: string; charge_id_value: string;
      amount_minor_value: number; currency_value: string; refund_created_at_value: string;
      verification_source_value: string;
    }; Returns: { refund_receipt_id: string; recording_result: string }[] };
    reconcile_payment_refund_success: { Args: { refund_receipt_id: string }; Returns: {
      evidence_id: string; obligation_id: string | null; outcome: string; payment_outcome: string;
    }[] };
  } };
};

function createPorts(): VerificationPorts {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Refund verification configuration unavailable');
  const db = createClient<VerificationDatabase>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    context: async (id) => db.rpc('get_payment_refund_verification_context', { target_obligation_id: id }),
    read: createStripeReader(environmentRoute),
    record: async (e: Evidence) => db.rpc('record_payment_refund_success_evidence', {
      provider_value: e.provider, environment_value: e.environment, account_scope_value: e.accountScope,
      refund_id_value: e.refundId, payment_id_value: e.paymentIntentId, charge_id_value: e.chargeId,
      amount_minor_value: e.amountMinor, currency_value: e.currency,
      refund_created_at_value: e.providerCreatedAt, verification_source_value: 'api_retrieval',
    }),
    reconcile: async (id) => db.rpc('reconcile_payment_refund_success', { refund_receipt_id: id }),
  };
}

/** Trusted server entry only; intentionally not a Server Action or route. */
export async function verifyHistoricalRefund(request: VerificationRequest) {
  try { return await verifyAndReconcile(request, createPorts()); }
  catch { return { code: 'CONTEXT_UNAVAILABLE', disposition: 'manual_review' } as const; }
}
