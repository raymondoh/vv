-- Existing B3B2/preparation/worker rollback suite, preserved without weakening.
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin
 if v is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject(q text,code text) returns void language plpgsql as $$ begin
 begin execute q; exception when others then
  if sqlstate=code then raise notice 'PASS rejection %',code; return; end if; raise; end;
 raise exception 'FAIL expected rejection %: %',code,q;
end $$;
create temp table fixture(bid uuid,pid uuid,oid uuid);
insert into fixture(bid) values(gen_random_uuid());
select set_config('request.jwt.claim.sub','3a6e28c3-427a-42dc-88f9-bd78979c8125',true);
select * from public.submit_booking_request((select bid from fixture),'5d28d971-34b9-44ef-826f-8c35e44b8af1',
 '2026-11-17 18:00+00','2026-11-17 20:00+00','[{"space_id":"b62ebccb-110f-4df1-8360-f11dc67dd930"}]','B3B2 rollback',80,'{"notes":"B3B2 rollback only"}');
select set_config('request.jwt.claim.sub','1316dcb2-7fb6-4ba3-87a4-2d8d03b37059',true);
select * from public.approve_booking_hold((select bid from fixture));
insert into public.organization_payment_accounts(organization_id,provider,provider_account_id,integration_environment,account_status,details_submitted,charges_enabled,payouts_enabled)
 select organization_id,'stripe','acct_B3B2Destination','test','enabled',true,true,true from public.bookings where id=(select bid from fixture);
select pg_temp.ok((select enabled=false and provider_account_scope is null from private.payment_integration_settings),'baseline disabled');
-- Only rollback fixture construction needs B2 activation; disable before B3B2.
update private.payment_integration_settings set enabled=true,provider_account_scope='acct_B3B2Platform';
select set_config('request.jwt.claim.sub','3a6e28c3-427a-42dc-88f9-bd78979c8125',true);
update fixture set pid=(select payment_id from public.prepare_deposit_payment((select bid from fixture)));
select pg_temp.ok((select preparation_result='reused' from public.prepare_deposit_payment((select bid from fixture))),'preparation idempotent');
create function pg_temp.collection(label text,delta jsonb default '{}') returns bigint language plpgsql as $$
declare payload jsonb; eid bigint; tok uuid; begin
 select jsonb_build_object('schema_version',1,'payment_id',p.id::text,'provider_payment_id','pi_B3B2',
 'provider_charge_id','ch_'||label,'destination_account_id',p.provider_destination_account_id,
 'amount_minor',p.amount_minor,'currency_code',p.currency_code,'provider_succeeded_at',extract(epoch from date_trunc('second',p.created_at))::bigint)||delta
 into payload from public.booking_payments p where p.id=(select pid from fixture);
 select event_id into eid from public.ingest_payment_provider_event('stripe','test','acct_B3B2Platform','evt_'||label,'payment_intent.succeeded',date_trunc('second',clock_timestamp()),payload);
 select claim_token into tok from public.claim_payment_provider_events(100) where event_id=eid;
 perform public.record_payment_provider_receipt(eid,tok); return eid;
end $$;
create function pg_temp.settle_collection(eid bigint) returns text language plpgsql as $$ declare tok uuid; val text; begin
 select claim_token into tok from public.claim_payment_provider_events(100) where event_id=eid;
 select outcome into val from public.reconcile_deposit_payment_success(eid,tok);return val;end $$;
savepoint prior_contracts;
select pg_temp.ok((select amount_minor=12500 and currency_code='GBP' and application_fee_minor=1500 from public.get_deposit_payment_creation_context((select pid from fixture))),'preparation historical amount and fee');
select pg_temp.ok((select count(*)=1 from private.booking_payment_terms),'one immutable terms snapshot');
select pg_temp.reject('update private.booking_payment_terms set deposit_amount_minor=1','55000');
select pg_temp.reject('update public.booking_payment_schedule set amount_minor=amount_minor+1 where booking_id=(select bid from fixture)','55000');
select * from public.attach_deposit_payment_provider((select pid from fixture),'stripe','test','pi_B3B2');
select pg_temp.ok((select payment_status='pending' from public.booking_payments where id=(select pid from fixture)),'provider attachment not success');
select pg_temp.ok((select attachment_result='attached' from public.attach_deposit_payment_provider((select pid from fixture),'stripe','test','pi_B3B2')),'same PaymentIntent attachment replay');
select pg_temp.reject('select * from public.attach_deposit_payment_provider((select pid from fixture),''stripe'',''test'',''pi_Different'')','23514');
rollback to prior_contracts;
savepoint event_contracts;
create temp table event_contract as select pg_temp.collection('EventContract') id;
select pg_temp.ok((select processing_status='receipt_recorded' from private.payment_provider_events where id=(select id from event_contract)),'receipt recorded distinct from processed');
select pg_temp.ok((select disposition='unresolved' from private.payment_provider_receipts),'collection receipt initially unresolved');
select pg_temp.ok((select payment_status='pending' from public.booking_payments where id=(select pid from fixture)),'recording alone no payment mutation');
select pg_temp.ok((select ingestion_result='existing' from public.ingest_payment_provider_event('stripe','test','acct_B3B2Platform','evt_EventContract','payment_intent.succeeded',(select occurred_at from private.payment_provider_events where id=(select id from event_contract)),(select payload from private.payment_provider_events where id=(select id from event_contract)))),'scoped event exact replay');
select pg_temp.reject('select * from public.ingest_payment_provider_event(''stripe'',''test'',''acct_B3B2Platform'',''evt_EventContract'',''payment_intent.succeeded'',(select occurred_at from private.payment_provider_events where id=(select id from event_contract)),(select payload||''{"amount_minor":1}''::jsonb from private.payment_provider_events where id=(select id from event_contract)))','23514');
create temp table event_claim as select * from public.claim_payment_provider_events(100);
select pg_temp.ok((select attempt_count=2 from event_claim where event_id=(select id from event_contract)),'receipt reconciliation claim increments');
select pg_temp.reject('select * from public.record_payment_provider_receipt((select id from event_contract),gen_random_uuid())','55000');
select * from public.fail_payment_provider_event((select id from event_contract),(select claim_token from event_claim where event_id=(select id from event_contract)),'NETWORK_ERROR');
select pg_temp.ok((select processing_status='failed' and claim_token is null and lease_expires_at is null from private.payment_provider_events where id=(select id from event_contract)),'event failure clears claim');
select pg_temp.ok((select count(*)=0 from public.claim_payment_provider_events(100)),'event backoff not immediately claimable');
select pg_temp.reject('select * from public.fail_payment_provider_event((select id from event_contract),gen_random_uuid(),''raw database message'')','22023');
rollback to event_contracts;

savepoint before_collection;
select pg_temp.ok(pg_temp.settle_collection(pg_temp.collection('Fulfill'))='confirmed','B2 early PaymentIntent attachment fulfillment');
select pg_temp.ok((select booking_status='confirmed' and payment_status='partially_paid' from public.bookings where id=(select bid from fixture)),'B2 booking confirmation');
select pg_temp.ok((select status='paid' from public.booking_payment_schedule where booking_id=(select bid from fixture) and installment_type='deposit'),'B2 deposit paid');
rollback to before_collection;
update public.booking_space_allocations set allocation_status='released',released_at=clock_timestamp(),release_reason='Rollback' where booking_id=(select bid from fixture);
select pg_temp.ok(pg_temp.settle_collection(pg_temp.collection('Compensate'))='compensation_required','B2 released hold compensation');
update fixture set oid=(select id from private.payment_refund_obligations);
select pg_temp.ok((select payment_status='succeeded' and provider_payment_id='pi_B3B2' from public.booking_payments where id=(select pid from fixture)),'early PaymentIntent attachment preserves money');
update private.payment_integration_settings set enabled=false,provider_account_scope=null;
create function pg_temp.success(refund text default 're_B3B2',source text default 'api_retrieval',event text default null,delta jsonb default '{}') returns uuid language plpgsql as $$
declare x jsonb; eid uuid; begin
 select to_jsonb(o)||delta into x from private.payment_refund_obligations o where id=(select oid from fixture);
 select refund_receipt_id into eid from public.record_payment_refund_success_evidence(
 x->>'provider',x->>'integration_environment',x->>'provider_account_scope',refund,x->>'provider_payment_id',x->>'provider_charge_id',
 (x->>'amount_minor')::bigint,x->>'currency_code',date_trunc('second',now()),source,event);
 return eid;
end $$;
create function pg_temp.apply_success(eid uuid) returns text language sql as $$ select outcome from public.reconcile_payment_refund_success(eid); $$;
create temp table evidence(id uuid);
insert into evidence select pg_temp.success();
select pg_temp.ok((select count(*)=1 from private.payment_provider_refund_receipts),'record retrieval while disabled');
select pg_temp.ok(pg_temp.success()=(select id from evidence),'canonical evidence idempotent');
select pg_temp.ok(pg_temp.success('re_B3B2','webhook','evt_RefundSuccess')=(select id from evidence),'later webhook reuses retrieval evidence');
select pg_temp.ok((select first_verification_source='api_retrieval' and first_provider_event_id is null from private.payment_provider_refund_receipts),'first provenance immutable');
select pg_temp.ok((select count(*)=1 from private.payment_refund_success_events),'later event linkage retained');
select pg_temp.reject('select pg_temp.success(''re_Other'',''webhook'',''evt_RefundSuccess'')','23514');
select pg_temp.reject('select pg_temp.success(''re_B3B2'',''api_retrieval'',null,''{"amount_minor":1}'')','23514');
select pg_temp.reject('select pg_temp.success(''re_B3B2'',''api_retrieval'',null,''{"currency_code":"USD"}'')','23514');
select pg_temp.reject('select pg_temp.success(''re_B3B2'',''api_retrieval'',null,''{"provider_payment_id":"pi_Other"}'')','23514');
select pg_temp.reject('select pg_temp.success(''re_B3B2'',''api_retrieval'',null,''{"provider_charge_id":"ch_Other"}'')','23514');
select pg_temp.reject('select pg_temp.success(''re_Bad'',''api_retrieval'',''evt_Invalid'')','22023');
select pg_temp.reject('select * from public.record_payment_refund_success_evidence(''stripe'',''test'',''acct_A'',''re_A'',''pi_A'',''ch_A'',1,''GBP'',date_trunc(''second'',clock_timestamp())+interval ''1 hour'',''api_retrieval'')','22023');
select pg_temp.reject('select * from public.record_payment_refund_success_evidence(''stripe'',''test'',''acct_A'',''re_A'',''pi_A'',''ch_A'',1,''GBP'',date_trunc(''second'',clock_timestamp())-interval ''0.5 seconds'',''api_retrieval'')','22023');
create temp table unchanged as select jsonb_build_object('booking',(select to_jsonb(b) from public.bookings b where id=(select bid from fixture)),
 'schedule',(select jsonb_agg(to_jsonb(d) order by id) from public.booking_payment_schedule d where booking_id=(select bid from fixture)),
 'inventory',(select jsonb_agg(to_jsonb(a) order by id) from public.booking_space_allocations a where booking_id=(select bid from fixture))) value;
savepoint success_case;
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='applied','early refund success applies while disabled');
set constraints all immediate;
select pg_temp.ok((select state='succeeded' and provider_refund_id='re_B3B2' and succeeded_at>=(select recorded_at from private.payment_provider_refund_receipts where id=(select id from evidence)) and claim_token is null and lease_expires_at is null and next_attempt_at is null from private.payment_refund_obligations),'early re binding and local acceptance');
select pg_temp.ok((select disposition='applied' from private.payment_provider_refund_receipts),'evidence applied');
select pg_temp.ok((select payment_status='refunded' from public.booking_payments where id=(select pid from fixture)),'exceptional payment refunded');
select pg_temp.ok((select count(*)=1 from private.payment_refund_applications a
 join private.payment_refund_obligations o on o.id=a.compensation_obligation_id
 join private.payment_provider_refund_receipts e on e.id=a.refund_receipt_id
 where a.application_kind='compensation' and o.state='succeeded' and e.disposition='applied'
 and private.refund_success_identity_matches(o,e)), 'deferred payment guard accepts canonical compensation triple');

select pg_temp.ok((select disposition='compensation_required' from private.payment_provider_receipts),'collection history unchanged');
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='already_applied','success replay idempotent');
select pg_temp.ok((select value from unchanged)=jsonb_build_object('booking',(select to_jsonb(b) from public.bookings b where id=(select bid from fixture)),
 'schedule',(select jsonb_agg(to_jsonb(d) order by id) from public.booking_payment_schedule d where booking_id=(select bid from fixture)),
 'inventory',(select jsonb_agg(to_jsonb(a) order by id) from public.booking_space_allocations a where booking_id=(select bid from fixture))),'no booking schedule inventory mutation');
select pg_temp.reject('update private.payment_refund_obligations set state=''pending'',succeeded_at=null,next_attempt_at=clock_timestamp()','55000');
select pg_temp.reject('update private.payment_provider_refund_receipts set amount_minor=amount_minor+1','55000');
select pg_temp.reject('delete from private.payment_provider_refund_receipts','55000');
select pg_temp.ok(private.compensation_reserves_payment((select pid from fixture)),'succeeded compensation still reserves money');
rollback to success_case;
-- Worker state compatibility, using only production RPC transitions.
create temp table worker(token uuid);
create function pg_temp.claim_refund() returns uuid language plpgsql as $$ declare t uuid;begin
 update private.payment_integration_settings set enabled=true,provider_account_scope='acct_B3B2Platform';
 select claim_token into t from public.claim_payment_refund_obligations(20) where obligation_id=(select oid from fixture);
 return t;end $$;
select pg_temp.ok((select count(*)=0 from public.claim_payment_refund_obligations(20)),'disabled worker claims nothing');
savepoint active_worker;
insert into worker select pg_temp.claim_refund();
select pg_temp.ok((select attempt_count=1 and state='processing' from private.payment_refund_obligations),'worker claims exactly once');
select pg_temp.ok((select count(*)=0 from public.claim_payment_refund_obligations(20)),'active lease not reclaimable');
select pg_temp.ok((select action='create' from public.get_payment_refund_execution_context((select oid from fixture),(select token from worker))),'worker starts create');
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='applied','success supersedes active worker');
select pg_temp.ok((select attempt_count=1 and claim_token is null and lease_expires_at is null from private.payment_refund_obligations),'success preserves attempts and clears claim');
select pg_temp.reject('select * from public.get_payment_refund_execution_context((select oid from fixture),(select token from worker))','55000');
select pg_temp.reject('select * from public.attach_payment_refund_provider((select oid from fixture),(select token from worker),''re_B3B2'')','55000');
select pg_temp.reject('select * from public.fail_payment_refund_obligation((select oid from fixture),(select token from worker),''NETWORK_ERROR'')','55000');
select pg_temp.reject('select public.review_payment_refund_obligation((select oid from fixture),(select token from worker),''MANUAL_REVIEW_REQUIRED'')','55000');
select pg_temp.ok((select count(*)=0 from public.claim_payment_refund_obligations(20)),'succeeded cannot claim');
set constraints all immediate;
rollback to active_worker;
savepoint attached;
insert into worker select pg_temp.claim_refund();
select * from public.attach_payment_refund_provider((select oid from fixture),(select token from worker),'re_B3B2');
select pg_temp.ok((select state='pending' and provider_refund_id='re_B3B2' and succeeded_at is null from private.payment_refund_obligations),'attachment is pending not success');
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='applied','attached pending success');
set constraints all immediate;
rollback to attached;
savepoint failed;
insert into worker select pg_temp.claim_refund();
select * from public.fail_payment_refund_obligation((select oid from fixture),(select token from worker),'NETWORK_ERROR');
select pg_temp.ok((select state='failed' and next_attempt_at between clock_timestamp()+interval '28 seconds' and clock_timestamp()+interval '31 seconds' from private.payment_refund_obligations),'worker first backoff 30s');
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='applied','failed success');
set constraints all immediate;
rollback to failed;
savepoint reviewed;
insert into worker select pg_temp.claim_refund();
select public.review_payment_refund_obligation((select oid from fixture),(select token from worker),'MANUAL_REVIEW_REQUIRED');
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='applied','manual review superseded by verified success');
set constraints all immediate;
rollback to reviewed;
savepoint conflict;
insert into worker select pg_temp.claim_refund();
select * from public.attach_payment_refund_provider((select oid from fixture),(select token from worker),'re_Different');
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='manual_review','conflicting existing refund ID requires review');
select pg_temp.ok((select state='pending' and provider_refund_id='re_Different' from private.payment_refund_obligations),'conflicting refund never overwritten');
set constraints all immediate;
rollback to conflict;
-- Unknown financial identity is preserved; provenance may start with webhook.
savepoint unknown;
select pg_temp.ok(pg_temp.apply_success(pg_temp.success('re_Unknown','webhook','evt_Unknown','{"provider_charge_id":"ch_Unknown"}'))='unresolved','unknown evidence retryable');
select pg_temp.ok((select first_verification_source='webhook' and first_provider_event_id='evt_Unknown' from private.payment_provider_refund_receipts where provider_refund_id='re_Unknown'),'webhook provenance');
select pg_temp.ok(pg_temp.success('re_Unknown','api_retrieval',null,'{"provider_charge_id":"ch_Unknown"}')=(select id from private.payment_provider_refund_receipts where provider_refund_id='re_Unknown'),'webhook then retrieval converges');
rollback to unknown;
-- Direct unsupported success and deferred pairing attacks.
select pg_temp.reject('update private.payment_refund_obligations set state=''succeeded'',provider_refund_id=''re_NoEvidence'',succeeded_at=clock_timestamp(),next_attempt_at=null','23514');
create function pg_temp.bad_pair(which_one text) returns void language plpgsql as $$begin
 if which_one='receipt' then update private.payment_provider_refund_receipts set disposition='applied';
 else update private.payment_refund_obligations set state='succeeded',provider_refund_id='re_B3B2',succeeded_at=clock_timestamp(),next_attempt_at=null;end if;
 set constraints all immediate;
end $$;
select pg_temp.reject('select pg_temp.bad_pair(''receipt'')','23514');
select pg_temp.reject('select pg_temp.bad_pair(''obligation'')','23514');
-- Existing refunded and partially-refunded states follow legal transitions.
savepoint refunded;
update public.booking_payments set payment_status='refunded' where id=(select pid from fixture);
select pg_temp.ok((select payment_outcome='already_refunded' from public.reconcile_payment_refund_success((select id from evidence))),'already-refunded local payment accepted');
rollback to refunded;
savepoint partial;
update public.booking_payments set payment_status='partially_refunded' where id=(select pid from fixture);
select pg_temp.ok((select payment_outcome='updated' from public.reconcile_payment_refund_success((select id from evidence))),'partially-refunded legal full refund');
rollback to partial;
-- Catalogue actual ACLs including PUBLIC (OID 0), not a role-name assumption.
select pg_temp.ok((select count(*)=2 and bool_and(p.prosecdef and p.proowner='postgres'::regrole and p.proconfig=array['search_path=""'])
 from pg_proc p where p.oid in ('public.record_payment_refund_success_evidence(text,text,text,text,text,text,bigint,text,timestamptz,text,text)'::regprocedure,'public.reconcile_payment_refund_success(uuid)'::regprocedure)),'public owners security definer search paths');
select pg_temp.ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.proname in ('record_payment_refund_success_evidence','reconcile_payment_refund_success') and a.grantee=0),'PUBLIC no execution');
select pg_temp.ok(bool_and(not has_function_privilege(r,p,'EXECUTE')),'browser cannot execute new RPCs') from unnest(array['anon','authenticated']) r cross join unnest(array['public.record_payment_refund_success_evidence(text,text,text,text,text,text,bigint,text,timestamptz,text,text)','public.reconcile_payment_refund_success(uuid)']) p;
select pg_temp.ok(bool_and(has_function_privilege('service_role',p,'EXECUTE')),'service can execute exactly intended RPCs') from unnest(array['public.record_payment_refund_success_evidence(text,text,text,text,text,text,bigint,text,timestamptz,text,text)','public.reconcile_payment_refund_success(uuid)']) p;
select pg_temp.ok(bool_and(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE')),'no direct application evidence access') from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['private.payment_provider_refund_receipts','private.payment_refund_success_events']) t;
select pg_temp.ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.proname in ('protect_payment_refund_success_receipt','refund_success_identity_matches','check_refund_success_pair') and a.grantee<>'postgres'::regrole),'private helpers postgres only');
select pg_temp.ok((select not has_function_privilege('service_role',p.oid,'EXECUTE') from pg_proc p where p.proname='confirm_deposit_payment'),'legacy deposit authority remains retired');
select pg_temp.ok((select booking_status='requested' and payment_status='unpaid' and approved_at is null and hold_expires_at is null and declined_at is null from public.bookings where id='7ca68eab-0fce-46bf-813c-e31f6d354235'),'genuine booking unchanged');
select pg_temp.ok(not exists(select 1 from public.booking_payments where booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235') and not exists(select 1 from public.booking_space_allocations where booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235'),'genuine zero payments allocations');
savepoint late_identity;
create temp table late_evidence as select pg_temp.success('re_Late','webhook','evt_LateRefund','{"provider_charge_id":"ch_Late","provider_payment_id":"pi_Late"}') id;
select pg_temp.ok(pg_temp.apply_success((select id from late_evidence))='unresolved','evidence precedes obligation');
update private.payment_integration_settings set enabled=true,provider_account_scope='acct_B3B2Platform';
select pg_temp.ok(pg_temp.settle_collection(pg_temp.collection('Late','{"payment_id":"11111111-1111-4111-8111-111111111111","provider_payment_id":"pi_Late"}'))='compensation_required','uncorrelated collected money creates obligation');
update private.payment_integration_settings set enabled=false,provider_account_scope=null;
create temp table payment_snapshot as select to_jsonb(p) value from public.booking_payments p where id=(select pid from fixture);
select pg_temp.ok((select outcome='applied' and payment_outcome='uncorrelated' from public.reconcile_payment_refund_success((select id from late_evidence))),'previously unknown evidence now applies uncorrelated');
select pg_temp.ok((select booking_id is null and payment_id is null and state='succeeded' from private.payment_refund_obligations where provider_charge_id='ch_Late'),'no fabricated correlation');
select pg_temp.ok((select value from payment_snapshot)=(select to_jsonb(p) from public.booking_payments p where id=(select pid from fixture)),'uncorrelated refund does not touch VV payment');
select pg_temp.ok((select count(*)=2 from private.payment_refund_obligations),'distinct charge distinct obligation');
set constraints all immediate;
rollback to late_identity;
-- Simulate an unexpected historical local status, transactionally only.
savepoint inconsistent;
-- Flush complete fixture state before temporarily changing a fixture guard.
set constraints all immediate;
set constraints all deferred;
alter table public.booking_payments disable trigger user;
update public.booking_payments set payment_status='failed',succeeded_at=null,failed_at=clock_timestamp() where id=(select pid from fixture);
alter table public.booking_payments enable trigger user;
select pg_temp.ok((select outcome='applied' and payment_outcome='state_follow_up' from public.reconcile_payment_refund_success((select id from evidence))),'unexpected local state cannot lose verified refund');
select pg_temp.ok((select payment_status='failed' from public.booking_payments where id=(select pid from fixture)),'unexpected local status not falsified');
select pg_temp.ok(exists(select 1 from private.audit_events where action='compensation_refund_local_payment_followup' and entity_id=(select id from evidence)),'safe followup audit');
set constraints all immediate;
rollback to inconsistent;
-- Strong immutable mismatch: never mutate the wrong financial record.
savepoint wrong_identity;
-- Flush complete fixture state before temporarily changing a fixture guard.
set constraints all immediate;
set constraints all deferred;
alter table public.booking_payments disable trigger user;
update public.booking_payments set provider_charge_id='ch_Unrelated' where id=(select pid from fixture);
alter table public.booking_payments enable trigger user;
select pg_temp.ok((select outcome='applied' and payment_outcome='identity_follow_up' from public.reconcile_payment_refund_success((select id from evidence))),'identity mismatch isolated from obligation truth');
select pg_temp.ok((select payment_status='succeeded' and provider_charge_id='ch_Unrelated' from public.booking_payments where id=(select pid from fixture)),'unrelated charge not marked refunded');
rollback to wrong_identity;
-- B3B1 expired-claim/backoff/exhaustion contracts using local-only clock fixture edits.
savepoint worker_regression;
insert into worker select pg_temp.claim_refund();
set constraints all immediate;
alter table private.payment_refund_obligations disable trigger protect_payment_refund_obligation;
update private.payment_refund_obligations set lease_expires_at=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 second' where id=(select oid from fixture);
alter table private.payment_refund_obligations enable trigger protect_payment_refund_obligation;
set constraints all deferred;
select pg_temp.reject('select * from public.get_payment_refund_execution_context((select oid from fixture),(select token from worker))','55000');
create temp table reclaimed as select * from public.claim_payment_refund_obligations(20);
select pg_temp.ok((select claim_token<>(select token from worker) and attempt_count=2 from reclaimed),'reclaim fresh token increments once');
select * from public.fail_payment_refund_obligation((select oid from fixture),(select claim_token from reclaimed),'NETWORK_ERROR');
select pg_temp.ok((select next_attempt_at between clock_timestamp()+interval '58 seconds' and clock_timestamp()+interval '61 seconds' from private.payment_refund_obligations),'second backoff 60 seconds');
set constraints all immediate;
alter table private.payment_refund_obligations disable trigger protect_payment_refund_obligation;
update private.payment_refund_obligations set attempt_count=19,next_attempt_at=clock_timestamp()-interval '1 second' where id=(select oid from fixture);
alter table private.payment_refund_obligations enable trigger protect_payment_refund_obligation;
set constraints all deferred;
select pg_temp.ok((select attempt_count=20 from public.claim_payment_refund_obligations(20)),'last attempt exactly twenty');
select * from public.fail_payment_refund_obligation((select oid from fixture),(select claim_token from private.payment_refund_obligations where id=(select oid from fixture)),'NETWORK_ERROR');
select pg_temp.ok((select state='manual_review' and attempt_count=20 and claim_token is null from private.payment_refund_obligations),'exhaustion clears worker');
select pg_temp.ok((select count(*)=0 from public.claim_payment_refund_obligations(20)),'no attempt twenty-one');
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='applied','late real success after exhausted attempt twenty');
set constraints all immediate;
rollback to worker_regression;
-- Scalar input contracts.
select pg_temp.reject('select * from public.record_payment_refund_success_evidence(''stripe'',''test'',''acct_A'',''re_A'',''pi_A'',''ch_A'',1,''GBP'',''infinity'',''webhook'')','22023');
select pg_temp.reject('select pg_temp.success(''re_Bad'',''untrusted'')','22023');
select pg_temp.reject('select pg_temp.success(''bad'')','22023');
select pg_temp.reject('select pg_temp.success(''re_Bad'',''api_retrieval'',null,''{"amount_minor":0}'')','22023');
select pg_temp.reject('select pg_temp.success(''re_Bad'',''api_retrieval'',null,''{"currency_code":"gbp"}'')','22023');
select pg_temp.reject('select pg_temp.success(''re_Bad'',''api_retrieval'',null,''{"provider":"other"}'')','22023');
select pg_temp.reject('select pg_temp.success(''re_Bad'',''api_retrieval'',null,''{"provider_account_scope":"bad"}'')','22023');
select pg_temp.reject('select pg_temp.success(''re_Bad'',''api_retrieval'',null,''{"provider_payment_id":"bad"}'')','22023');
select pg_temp.reject('select pg_temp.success(''re_Bad'',''api_retrieval'',null,''{"provider_charge_id":"bad"}'')','22023');
select pg_temp.ok((select not enabled and provider_account_scope is null from private.payment_integration_settings),'integration disabled after all tests');
savepoint refund_overlap;
select pg_temp.ok(pg_temp.apply_success((select id from evidence))='applied','overlap test compensation succeeded');
select pg_temp.reject('insert into public.payment_refunds(booking_id,booking_payment_id,provider,amount_minor,currency_code,reason) select bid,pid,''stripe'',1,''GBP'',''must reject'' from fixture','23514');
select pg_temp.ok(not exists(select 1 from public.payment_refunds where booking_id=(select bid from fixture)),'ordinary refund cannot double-reserve succeeded compensation');
set constraints all immediate;
rollback to refund_overlap;
-- All compensation states reserve the same identified money.
do $$ declare st text; tok uuid; begin
 foreach st in array array['pending','processing','failed','manual_review','succeeded'] loop
   begin
     if st in ('processing','failed','manual_review') then
       tok:=pg_temp.claim_refund();
       if st='failed' then perform public.fail_payment_refund_obligation((select oid from fixture),tok,'NETWORK_ERROR'); end if;
       if st='manual_review' then perform public.review_payment_refund_obligation((select oid from fixture),tok,'MANUAL_REVIEW_REQUIRED'); end if;
     elsif st='succeeded' then perform pg_temp.apply_success((select id from evidence)); end if;
     perform pg_temp.ok((select state=st from private.payment_refund_obligations where id=(select oid from fixture)),'overlap fixture '||st);
     perform pg_temp.reject('insert into public.payment_refunds(booking_id,booking_payment_id,provider,amount_minor,currency_code) select bid,pid,''stripe'',1,''GBP'' from fixture','23514');
     raise exception using errcode='Z0001',message='rollback isolated state fixture';
   exception when sqlstate 'Z0001' then null; end;
 end loop;
end $$;
