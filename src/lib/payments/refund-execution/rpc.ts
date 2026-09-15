import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../supabase/database.types';
import { environmentRoute } from '../refund-verification/stripe-reader';
import { verifyHistoricalRefund } from '../refund-verification/rpc';
import { createStripeCreator } from './stripe-create';
import { executeOrdinaryRefund, type Ports, type Result } from './service';
// Unapplied migration overlay only; generated types remain untouched.
type ExecutionDatabase = Omit<Database,'public'> & { public:Omit<Database['public'],'Functions'> & {
 Functions:Database['public']['Functions'] & {
  claim_ordinary_refund_execution:{Args:{target_refund_id:string};Returns:Json};
  check_ordinary_refund_dispatch:{Args:{target_refund_id:string;claim_token:string};Returns:boolean};
  attach_ordinary_refund_provider:{Args:{target_refund_id:string;claim_token:string;provider_refund_id:string};Returns:Json};
  report_ordinary_refund_execution:{Args:{target_refund_id:string;claim_token:string;error_code:string};Returns:Json};
 };
} };
/** No route, Server Action, timer or scheduler invokes this entry. */
export async function runOrdinaryRefundExecution(refundId:unknown):Promise<Result> {
 try {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {outcome:'manual_review'};
  const db=createClient<ExecutionDatabase>(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const ports:Ports={
   claim:async id=>db.rpc('claim_ordinary_refund_execution',{target_refund_id:id}),
   fresh:async(id,token)=>db.rpc('check_ordinary_refund_dispatch',{target_refund_id:id,claim_token:token}),
   attach:async(id,token,refundId)=>db.rpc('attach_ordinary_refund_provider',{target_refund_id:id,claim_token:token,provider_refund_id:refundId}),
   report:async(id,token,code)=>db.rpc('report_ordinary_refund_execution',{target_refund_id:id,claim_token:token,error_code:code}),
   create:createStripeCreator(environmentRoute),verify:verifyHistoricalRefund,
  };
  return await executeOrdinaryRefund(refundId,ports);
 } catch { return {outcome:'manual_review'}; }
}
