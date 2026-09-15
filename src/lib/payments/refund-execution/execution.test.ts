import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClaim } from './context';
import { createStripeCreator } from './stripe-create';
import { executeOrdinaryRefund, type Ports } from './service';
import type { Context } from './model';
import type { RouteResolver } from '../refund-verification/stripe-reader';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now=Date.parse('2026-09-15T12:00:00Z');
const row={ action:'create',refund_id:id,claim_token:token,lease_expires_at:'2026-09-15T12:02:00Z',attempt_count:1,
 provider:'stripe',environment:'test',account_scope:'acct_Test',charge_id:'ch_Test',payment_intent_id:'pi_Test',amount_minor:100,currency:'GBP',
 idempotency_key:`vv:test:ordinary-refund:${id}:v1`,first_dispatch_authorized_at:'2026-09-15T12:00:00Z',recovery_deadline:'2026-09-16T11:00:00Z',
 reverse_transfer:true,refund_application_fee:true,contract_version:'v1',api_version:'2025-02-24.acacia',provider_refund_id:null };
const context=():Context=>{const c=parseClaim(row,id); assert.ok(c && 'token' in c);return c;};
const route:RouteResolver=c=>({...c,kind:'platform',secretKey:'test-only-placeholder'});
const refund={object:'refund',id:'re_Test',charge:'ch_Test',payment_intent:'pi_Test',amount:100,currency:'gbp',status:'succeeded'};
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
const good=(data:unknown)=>({data,error:null});
function ports() {
 const calls:string[]=[];
 const p:Ports={
  claim:async()=>{calls.push('claim');return good(row);},
  fresh:async()=>{calls.push('fresh');return good(true);},
  create:async(c,fresh)=>{calls.push('create');assert.equal(c.idempotencyKey,row.idempotency_key);assert.equal(await fresh(),true);return {ok:true,refundId:'re_Test'};},
  attach:async()=>{calls.push('attach');return good({outcome:'bound',provider_refund_id:'re_Test'});},
  report:async(_id,_token,code)=>{calls.push(`report:${code}`);return good({outcome:code==='PROVIDER_RETRY'?'retry':'manual_review'});},
  verify:async r=>{calls.push('B4B');assert.deepEqual(r,{target:{kind:'ordinary',refundRequestId:id},refundId:'re_Test'});return {stage:'provider',code:'PENDING',disposition:'retry'};},
 };
 return {p,calls};
}
test('strict trusted context and fixed horizon',()=>{assert.equal(context().amountMinor,100);assert.equal(parseClaim({...row,recovery_deadline:'2026-09-16T12:00:00Z'},id),null);});
for(const field of ['action','provider','environment','currency','contract_version','api_version'] as const) {
 for(const bad of [null,undefined,{},[],[row[field]],true,7]) test(`context ${field} rejects ${JSON.stringify(bad)}`,()=>{
  assert.equal(parseClaim({...row,[field]:bad},id),null);
 });
}
for(const field of ['refund_id','claim_token','account_scope','charge_id','payment_intent_id','idempotency_key','lease_expires_at','first_dispatch_authorized_at','recovery_deadline']) {
 test(`invalid ${field}`,()=>assert.equal(parseClaim({...row,[field]:'invalid'},id),null));
}
for(const value of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'100',null,{},[]]) test(`amount ${JSON.stringify(value)} rejected`,()=>assert.equal(parseClaim({...row,amount_minor:value},id),null));
for(const value of [0,21,1.5,'1',null]) test(`attempt ${JSON.stringify(value)} rejected`,()=>assert.equal(parseClaim({...row,attempt_count:value},id),null));
for(const action of ['manual_review','not_due','already_claimed','completed','disabled']) test(`idle ${action}`,()=>{
 assert.deepEqual(parseClaim({action},id),{action}); assert.equal(parseClaim({action,claim_token:token},id),null);
});
test('one exact POST, fixed contract, authenticated account before DB freshness',async()=>{
 const calls:string[]=[];
 const creator=createStripeCreator(route,async(url,init)=>{
  calls.push(String(url));
  assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
  const headers=new Headers(init?.headers);
  assert.equal(headers.get('Stripe-Version'),row.api_version);
  if(init?.method==='GET') return response({object:'account',id:'acct_Test'});
  assert.deepEqual(calls,['https://api.stripe.com/v1/account','fresh','https://api.stripe.com/v1/refunds']);
  assert.equal(headers.get('Idempotency-Key'),row.idempotency_key);
  assert.equal(headers.get('Content-Type'),'application/x-www-form-urlencoded');
  assert.equal(init?.body,'charge=ch_Test&amount=100&reverse_transfer=true&refund_application_fee=true');
  return response(refund);
 },()=>now);
 assert.deepEqual(await creator(context(),async()=>{calls.push('fresh');return true;}),{ok:true,refundId:'re_Test'});
});
for(const status of ['succeeded','pending','failed','canceled','requires_action']) test(`create ${status} binds only identity`,async()=>{
 const creator=createStripeCreator(route,async(_u,i)=>response(i?.method==='GET'?{object:'account',id:'acct_Test'}:{...refund,status}),()=>now);
 assert.deepEqual(await creator(context(),async()=>true),{ok:true,refundId:'re_Test'});
});
for(const [field,bad] of [['object',[]],['id','pi_Wrong'],['amount',101],['amount','100'],['currency',['gbp']],['charge','ch_Wrong'],['payment_intent','pi_Wrong'],['status',['succeeded']],['status','unknown']] as const) test(`malformed provider ${field} ${JSON.stringify(bad)}`,async()=>{
 const creator=createStripeCreator(route,async(_u,i)=>response(i?.method==='GET'?{object:'account',id:'acct_Test'}:{...refund,[field]:bad}),()=>now);
 assert.deepEqual(await creator(context(),async()=>true),{ok:false,code:'PROVIDER_RETRY'});
});
for(const status of [429,500,503,401,403,400]) test(`provider HTTP ${status}`,async()=>{
 let post=0;
 const creator=createStripeCreator(route,async(_u,i)=>{if(i?.method==='GET')return response({object:'account',id:'acct_Test'});post++;return response({internal:'never returned'},status);},()=>now);
 const result=await creator(context(),async()=>true);
 assert.deepEqual(result,{ok:false,code:status===429||status>=500?'PROVIDER_RETRY':'PROVIDER_REJECTED'});assert.equal(post,1);
});
for(const kind of ['timeout','network','invalid-json']) test(`ambiguous ${kind}`,async()=>{
 const creator=createStripeCreator(route,async(_u,i)=>{if(i?.method==='GET')return response({object:'account',id:'acct_Test'});if(kind==='invalid-json')return new Response('{');throw new Error(kind);},()=>now);
 assert.deepEqual(await creator(context(),async()=>true),{ok:false,code:'PROVIDER_RETRY'});
});
test('account mismatch, disabled route and expired lease never POST',async()=>{
 let post=0;
 const http:typeof fetch=async(_u,i)=>{if(i?.method==='POST')post++;return response({object:'account',id:'acct_Other'});};
 assert.equal((await createStripeCreator(()=>null,http,()=>now)(context(),async()=>true)).ok,false);
 assert.equal((await createStripeCreator(route,http,()=>now)(context(),async()=>true)).ok,false);
 assert.equal((await createStripeCreator(route,http,()=>now+120_000)(context(),async()=>true)).ok,false);
 assert.equal(post,0);
});
test('freshness false or expiry during account preflight prevents POST',async()=>{
 let posts=0,time=now;
 const creator=createStripeCreator(route,async(_u,i)=>{if(i?.method==='POST')posts++;time=now+120_000;return response({object:'account',id:'acct_Test'});},()=>time);
 assert.equal((await creator(context(),async()=>true)).ok,false);assert.equal(posts,0);
});
test('service creates once, binds then mandatory B4B handoff',async()=>{
 const {p,calls}=ports(); assert.equal((await executeOrdinaryRefund(id,p,()=>now)).outcome,'verification');
 assert.deepEqual(calls,['claim','create','fresh','attach','B4B']);
});
test('known ID skips POST while creation disabled externally',async()=>{
 const {p,calls}=ports();p.claim=async()=>good({...row,action:'retrieve',provider_refund_id:'re_Test'});
 await executeOrdinaryRefund(id,p,()=>now);assert.deepEqual(calls,['B4B','report:VERIFICATION_RETRY']);
});
test('timeout is recorded, same key persists in next invocation',async()=>{
 const {p,calls}=ports();const keys:string[]=[];
 p.create=async c=>{keys.push(c.idempotencyKey);return {ok:false,code:'PROVIDER_RETRY'};};
 await executeOrdinaryRefund(id,p,()=>now);await executeOrdinaryRefund(id,p,()=>now);
 assert.deepEqual(keys,[row.idempotency_key,row.idempotency_key]);assert.equal(calls.includes('attach'),false);
});
for(const code of ['23514','23505','55000']) test(`attachment ${code} never verifies or creates twice`,async()=>{
 const {p,calls}=ports();p.attach=async()=>({data:null,error:{code}});
 const result=await executeOrdinaryRefund(id,p,()=>now);
 assert.equal(result.outcome,code==='55000'?'retry':'manual_review');assert.equal(calls.includes('B4B'),false);assert.equal(calls.filter(c=>c==='create').length,1);
});
test('expired horizon blocks create',async()=>{
 const {p,calls}=ports();await executeOrdinaryRefund(id,p,()=>Date.parse(row.recovery_deadline));assert.equal(calls.includes('create'),false);
});
test('bad target never calls a port',async()=>{const {p,calls}=ports();await executeOrdinaryRefund({},p);assert.deepEqual(calls,[]);});
for(const bad of [null,{},[],true,1,['bound']]) test(`binding outcome ${JSON.stringify(bad)} fails closed`,async()=>{
 const {p,calls}=ports();p.attach=async()=>good({outcome:bad,provider_refund_id:'re_Test'});
 assert.equal((await executeOrdinaryRefund(id,p,()=>now)).outcome,'manual_review');assert.equal(calls.includes('B4B'),false);
});
for(const bad of [null,{},[],true,1,['retry']]) test(`report outcome ${JSON.stringify(bad)} fails closed`,async()=>{
 const {p}=ports();p.create=async()=>({ok:false,code:'PROVIDER_RETRY'});p.report=async()=>good({outcome:bad});
 assert.equal((await executeOrdinaryRefund(id,p,()=>now)).outcome,'manual_review');
});
test('raw exceptions never escape',async()=>{const {p}=ports();p.claim=async()=>{throw new Error('secret raw database details');};assert.deepEqual(await executeOrdinaryRefund(id,p),{outcome:'retry'});});
test('invalid calendar timestamp cannot authorize execution',()=>{
 assert.equal(parseClaim({...row,lease_expires_at:'2026-02-30T12:02:00Z'},id),null);
});
for(const code of ['55000','42501']) test(`unavailable claim ${code} is not retried indefinitely`,async()=>{
 const {p}=ports();p.claim=async()=>({data:null,error:{code}});assert.equal((await executeOrdinaryRefund(id,p)).outcome,'manual_review');
});
test('untrusted create port result cannot reach attachment',async()=>{
 const {p,calls}=ports();p.create=async()=>({ok:true,refundId:'invalid'});
 assert.equal((await executeOrdinaryRefund(id,p,()=>now)).outcome,'retry');assert.equal(calls.includes('attach'),false);
});
test('fresh RPC scalar true required',async()=>{
 let posts=0;
 const {p}=ports();p.fresh=async()=>good(['true']);
 p.create=createStripeCreator(route,async(_u,i)=>{if(i?.method==='POST')posts++;return response({object:'account',id:'acct_Test'});},()=>now);
 await executeOrdinaryRefund(id,p,()=>now);assert.equal(posts,0);
});
for (const code of ['23514','23505']) test(`binding ${code} durably stops a second invocation`,async()=>{
 const {p,calls}=ports();let state:'active'|'manual_review'='active';
 p.claim=async()=>{calls.push('claim');return good(state==='manual_review'?{action:'manual_review'}:row);};
 p.attach=async()=>{calls.push('attach-conflict');return {data:null,error:{code}};};
 p.report=async(target,claim,reason)=>{
  assert.equal(target,id);assert.equal(claim,token);assert.equal(reason,'IDENTITY_CONFLICT');
  state='manual_review';calls.push('durable-review');return good({outcome:'manual_review'});
 };
 assert.equal((await executeOrdinaryRefund(id,p,()=>now)).outcome,'manual_review');
 assert.equal((await executeOrdinaryRefund(id,p,()=>now)).outcome,'manual_review');
 assert.deepEqual(calls,['claim','create','fresh','attach-conflict','durable-review','claim']);
});
test('lost claim cannot pretend binding conflict was durably reviewed',async()=>{
 const {p,calls}=ports();p.attach=async()=>({data:null,error:{code:'23514'}});
 p.report=async(_id,claim,code)=>{assert.equal(claim,token);assert.equal(code,'IDENTITY_CONFLICT');return {data:null,error:{code:'55000'}};};
 assert.equal((await executeOrdinaryRefund(id,p,()=>now)).outcome,'retry');assert.equal(calls.includes('B4B'),false);
});
