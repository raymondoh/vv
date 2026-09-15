import 'server-only';
import { object, providerId, uuid } from '../refund-verification/model';
import type { DbResult, ServiceResult, VerificationRequest } from '../refund-verification/service';
import { parseClaim, canDispatch } from './context';
import type { Context, CreateResult, ErrorCode } from './model';
export interface Ports {
 claim(id:string):Promise<DbResult>;
 fresh(id:string,token:string):Promise<DbResult>;
 create(c:Context,fresh:()=>Promise<boolean>):Promise<CreateResult>;
 attach(id:string,token:string,refundId:string):Promise<DbResult>;
 report(id:string,token:string,code:ErrorCode):Promise<DbResult>;
 verify(request:VerificationRequest):Promise<ServiceResult>;
}
export type Result = { outcome:'manual_review'|'not_due'|'already_claimed'|'completed'|'disabled'|'retry'|'verification'; verification?:ServiceResult };
/** Internal entry: one invocation, at most one create. No caller financial inputs. */
export async function executeOrdinaryRefund(id:unknown, ports:Ports, now=Date.now):Promise<Result> {
 if (!uuid(id)) return { outcome:'manual_review' };
 const target=id.toLowerCase();
 try {
  const loaded=await ports.claim(target);
  if (loaded.error) return { outcome:loaded.error.code==='55000' || loaded.error.code==='42501' ? 'manual_review':'retry' };
  const c=parseClaim(loaded.data,target);
  if (!c) return { outcome:'manual_review' };
  if (!('token' in c)) return { outcome:c.action };
  const report=async(code:ErrorCode):Promise<Result>=>{
   const result=await ports.report(target,c.token,code);
   if (result.error) return { outcome:'retry' };
   const r=object(result.data);
   return r?.outcome==='retry' || r?.outcome==='manual_review' ? { outcome:r.outcome } : { outcome:'manual_review' };
  };
  let refundId=c.providerRefundId;
  let attached=false;
  if (c.action==='create') {
   if (!canDispatch(c,now())) return await report('CONTEXT_UNAVAILABLE');
   const made=await ports.create(c,async()=>{
    const checked=await ports.fresh(target,c.token);
    return !checked.error && checked.data===true && canDispatch(c,now());
   });
   if (!made.ok) return await report(made.code);
   if (!providerId(made.refundId,'re')) return await report('PROVIDER_RETRY');
   const binding=await ports.attach(target,c.token,made.refundId);
   if (binding.error) {
    // Persist contradictions while we still own the claim. A stale/superseded
    // report fails safely to retry; it must never acquire ownership by exception.
    if (binding.error.code==='23514' || binding.error.code==='23505') return await report('IDENTITY_CONFLICT');
    return { outcome:'retry' };
   }
   const b=object(binding.data);
   if (b?.outcome!=='bound' || b.provider_refund_id!==made.refundId) return { outcome:'manual_review' };
   refundId=made.refundId; attached=true;
  }
  if (!refundId) return { outcome:'manual_review' };
  const verification=await ports.verify({ target:{kind:'ordinary',refundRequestId:target},refundId });
  // Attachment consumed the create claim. Its ready row provides durable retry
  // if this immediate handoff fails. A later retrieve claim records outcomes.
  if (!attached && verification.disposition!=='accept') {
   await report(verification.disposition==='retry' ? 'VERIFICATION_RETRY':'PROVIDER_REJECTED');
  }
  return { outcome:'verification',verification };
 } catch { return { outcome:'retry' }; }
}
