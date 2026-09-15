-- Run inside the rollback harness only.
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
 '2026-12-17 18:00+00','2026-12-17 20:00+00','[{"space_id":"b62ebccb-110f-4df1-8360-f11dc67dd930"}]','B3B2 rollback',80,'{"notes":"B3B2 rollback only"}');
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
select pg_temp.ok(pg_temp.settle_collection(pg_temp.collection('Fulfill'))='confirmed','historical fulfilled collection');
update private.payment_integration_settings set enabled=false,provider_account_scope=null;
select set_config('request.jwt.claim.sub','1316dcb2-7fb6-4ba3-87a4-2d8d03b37059',true);
-- Fixture-only timestamp alignment: cancellation uses transaction now(), collection uses clock_timestamp().
alter table public.booking_space_allocations disable trigger user;
update public.booking_space_allocations set confirmed_at=transaction_timestamp() where booking_id=(select bid from fixture);
alter table public.booking_space_allocations enable trigger user;
update public.bookings set confirmed_at=transaction_timestamp() where id=(select bid from fixture);
select * from public.cancel_booking((select bid from fixture),'B4 rollback request authorization');
create temp table requests(id uuid,eid uuid,n integer);
create function pg_temp.new_refund(n integer,amount bigint,bind boolean default true) returns uuid language plpgsql as $$
declare fid uuid:=gen_random_uuid(); eid uuid; begin
 perform public.request_payment_refund(fid,(select pid from fixture),amount,'B4 rollback only');
 if bind then update public.payment_refunds set provider_refund_id='re_B4'||n where id=fid; end if;
 select refund_receipt_id into eid from public.record_payment_refund_success_evidence('stripe','test','acct_B3B2Platform',
 're_B4'||n,'pi_B3B2','ch_Fulfill',amount,'GBP',date_trunc('second',clock_timestamp()),'api_retrieval');
 insert into requests values(fid,eid,n); return fid;
end $$;
create function pg_temp.apply(n integer) returns text language sql as $$
 select outcome from public.apply_ordinary_refund_success((select id from requests where requests.n=$1),(select eid from requests where requests.n=$1)); $$;
create temp table unchanged as select jsonb_build_object(
 'booking',(select to_jsonb(b)-array['payment_status','updated_at'] from public.bookings b where id=(select bid from fixture)),
 'schedule',(select jsonb_agg(to_jsonb(x) order by id) from public.booking_payment_schedule x where booking_id=(select bid from fixture)),
 'inventory',(select jsonb_agg(to_jsonb(x) order by id) from public.booking_space_allocations x where booking_id=(select bid from fixture)),
 'collection',(select jsonb_agg(to_jsonb(x) order by id) from private.payment_provider_receipts x where booking_id=(select bid from fixture))) value;
savepoint before_partials;
select pg_temp.new_refund(1,2500);
select pg_temp.new_refund(2,5000);
select pg_temp.new_refund(3,5000);
select pg_temp.ok(pg_temp.apply(1)='applied','first partial with reservations, no self double count');
set constraints all immediate;
set constraints all deferred;
select pg_temp.ok((select payment_status='partially_refunded' from public.booking_payments where id=(select pid from fixture)),'first partial status');
select pg_temp.ok(pg_temp.apply(2)='applied','second partial');
select pg_temp.ok(pg_temp.apply(3)='applied','final full refund');
set constraints all immediate;
select pg_temp.ok((select payment_status='refunded' from public.booking_payments where id=(select pid from fixture)),'full payment refunded');
select pg_temp.ok((select payment_status='refunded' from public.bookings where id=(select bid from fixture)),'booking refunded');
select pg_temp.ok(pg_temp.apply(1)='already_applied','earlier partial replay after full refund');
select pg_temp.ok((select outcome='conflict' from public.apply_ordinary_refund_success((select id from requests where n=2),(select eid from requests where n=1))),'same receipt different request');
select pg_temp.ok((select count(*)=3 from private.payment_refund_applications),'three exclusive applications');
select pg_temp.ok((select count(*)=2 from private.payment_refund_applications where resulting_booking_payment_status='partially_refunded'),
 'earlier booking snapshots remain partial after final full refund');
select pg_temp.ok((select count(*)=1 from private.payment_refund_applications where resulting_booking_payment_status='refunded'),
 'only final historical snapshot is fully refunded');

select pg_temp.reject('delete from private.payment_refund_applications','55000');
select pg_temp.reject('update private.payment_refund_applications set application_kind=''compensation''','55000');
select pg_temp.reject('update private.payment_refund_applications set refund_receipt_id=gen_random_uuid()','55000');
select pg_temp.reject('update private.payment_refund_applications set ordinary_refund_id=gen_random_uuid()','55000');
select pg_temp.reject('update private.payment_refund_applications set compensation_obligation_id=gen_random_uuid()','55000');
select pg_temp.ok((select value from unchanged)=jsonb_build_object(
 'booking',(select to_jsonb(b)-array['payment_status','updated_at'] from public.bookings b where id=(select bid from fixture)),
 'schedule',(select jsonb_agg(to_jsonb(x) order by id) from public.booking_payment_schedule x where booking_id=(select bid from fixture)),
 'inventory',(select jsonb_agg(to_jsonb(x) order by id) from public.booking_space_allocations x where booking_id=(select bid from fixture)),
 'collection',(select jsonb_agg(to_jsonb(x) order by id) from private.payment_provider_receipts x where booking_id=(select bid from fixture))),'nonfinancial domains unchanged');
rollback to before_partials;
select pg_temp.new_refund(4,100,false);
select pg_temp.ok(pg_temp.apply(4)='manual_review','missing provider binding');
rollback to before_partials;
-- Each provider mismatch is a distinct canonical receipt; immutable evidence is never edited.
select pg_temp.new_refund(5,100);
do $$ declare k text; v text; eid uuid; i integer:=0; d jsonb; res text; begin
 for k,v in select * from (values ('amount','101'),('currency','USD'),('environment','live'),('scope','acct_Other'),
 ('pi','pi_Other'),('charge','ch_Other'),('refund','re_Other')) t(k,v) loop
   i:=i+1;
   select refund_receipt_id into eid from public.record_payment_refund_success_evidence('stripe',
     case when k='environment' then v else 'test' end,case when k='scope' then v else 'acct_B3B2Platform' end,
     case when k='refund' then v else 're_Mismatch'||i end,
     case when k='pi' then v else 'pi_B3B2' end,case when k='charge' then v else 'ch_Fulfill' end,
     case when k='amount' then v::bigint else 100 end,case when k='currency' then v else 'GBP' end,
     date_trunc('second',clock_timestamp()),'api_retrieval');
   -- The request's expected refund ID cannot be reassigned. Test the identity
   -- helper independently as well, so refund-ID mismatch cannot mask other fields.
   select to_jsonb(f) into d from public.payment_refunds f where id=(select id from requests where n=5);
   d:=d||jsonb_build_object('provider_refund_id',case when k='refund' then 're_B45' else 're_Mismatch'||i end);
   perform pg_temp.ok(not private.ordinary_refund_identity_matches(jsonb_populate_record(null::public.payment_refunds,d),
     (select e from private.payment_provider_refund_receipts e where id=eid)),'exact identity rejects '||k);
   select outcome into res from public.apply_ordinary_refund_success((select id from requests where n=5),eid);
   perform pg_temp.ok(res='manual_review','RPC rejects '||k);
 end loop;
end $$;
select pg_temp.reject('select * from public.record_payment_refund_success_evidence(''other'',''test'',''acct_A'',''re_A'',''pi_A'',''ch_A'',1,''GBP'',date_trunc(''second'',clock_timestamp()),''api_retrieval'')','22023');
select pg_temp.reject('select public.request_payment_refund(gen_random_uuid(),(select pid from fixture),12500,''excess reservation'')','23514');
select pg_temp.ok((select count(*)=0 from private.payment_refund_applications),'mismatch never applied');
select pg_temp.ok((select outcome='manual_review' from public.apply_ordinary_refund_success(gen_random_uuid(),(select eid from requests where n=5))),'unknown ordinary request');
select pg_temp.reject('select * from public.confirm_payment_refund((select id from requests where n=5),''re_Claimed'',clock_timestamp())','55000');
select pg_temp.ok(not has_function_privilege('service_role','public.confirm_payment_refund(uuid,text,timestamptz)','EXECUTE'),'legacy service denied');
select pg_temp.ok(has_function_privilege('service_role','public.apply_ordinary_refund_success(uuid,uuid)','EXECUTE'),'new service allowed');
select pg_temp.ok(not has_function_privilege('anon','public.apply_ordinary_refund_success(uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.apply_ordinary_refund_success(uuid,uuid)','EXECUTE'),'browser roles denied');
select pg_temp.ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) x where p.oid='public.apply_ordinary_refund_success(uuid,uuid)'::regprocedure and x.grantee=0),'PUBLIC denied');
select pg_temp.ok((select proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='public.apply_ordinary_refund_success(uuid,uuid)'::regprocedure),'trusted ownership and search path');
select pg_temp.ok(not has_table_privilege('service_role','private.payment_refund_applications','SELECT,INSERT,UPDATE,DELETE'),'private ledger inaccessible');
select pg_temp.ok(not has_table_privilege('service_role','public.payment_refunds','INSERT,UPDATE,DELETE'),'service direct refund DML revoked');
select set_config('test.b4_refund',(select id::text from requests where n=5),true);
select set_config('test.b4_receipt',(select eid::text from requests where n=5),true);
set local role anon;
select pg_temp.reject('select * from public.apply_ordinary_refund_success(current_setting(''test.b4_refund'')::uuid,current_setting(''test.b4_receipt'')::uuid)','42501');
reset role;
set local role authenticated;
select pg_temp.reject('select * from public.apply_ordinary_refund_success(current_setting(''test.b4_refund'')::uuid,current_setting(''test.b4_receipt'')::uuid)','42501');
reset role;
set local role service_role;
select pg_temp.ok((select outcome='applied' from public.apply_ordinary_refund_success(current_setting('test.b4_refund')::uuid,current_setting('test.b4_receipt')::uuid)),'service can apply');
reset role;
set constraints all immediate;
set constraints all deferred;
select pg_temp.ok((select outcome='ordinary_applied' from public.reconcile_payment_refund_success((select eid from requests where n=5))),'compensation refuses ordinary consumed evidence');
select pg_temp.ok((select not enabled and provider_account_scope is null from private.payment_integration_settings),'integration disabled');
select pg_temp.ok((select booking_status='requested' and payment_status='unpaid' and approved_at is null and hold_expires_at is null and declined_at is null from public.bookings where id='7ca68eab-0fce-46bf-813c-e31f6d354235'),'genuine lifecycle unchanged');
select pg_temp.ok(not exists(select 1 from public.booking_payments where booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235') and not exists(select 1 from public.booking_space_allocations where booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235'),'genuine no money/inventory');
rollback to before_partials;
-- Controlled historical final collection; final-payment preparation is not implemented.
-- Bypass only its deposit-only insert guard for this fixture and restore immediately.
-- Receipt/identity constraints remain enabled throughout.
create function pg_temp.second_collection(compensation boolean) returns uuid language plpgsql as $$
declare p public.booking_payments%rowtype; nid uuid:=gen_random_uuid(); ev bigint; rid uuid; begin
 select * into p from public.booking_payments where id=(select pid from fixture);
 p.id:=nid; p.payment_schedule_id:=(select id from public.booking_payment_schedule where booking_id=p.booking_id and installment_type='final');
 p.payment_kind:='final'; p.amount_minor:=37500; p.application_fee_minor:=4500;
 p.provider_payment_id:='pi_Second';p.provider_charge_id:=null;p.provider_success_at:=null;p.payment_status:='pending';p.succeeded_at:=null;
 p.provider_idempotency_key:='b4-second-collection';
 -- Flush complete fixture state before temporarily changing a fixture guard.
set constraints all immediate;
set constraints all deferred;
alter table public.booking_payments disable trigger protect_payment_preparation_binding;
 insert into public.booking_payments select p.*;
 set constraints all immediate;
 set constraints all deferred;
 alter table public.booking_payments enable trigger protect_payment_preparation_binding;
 select event_id into ev from public.ingest_payment_provider_event('stripe','test','acct_B3B2Platform','evt_Second',
 'payment_intent.succeeded',date_trunc('second',clock_timestamp()),'{"schema_version":1}');
 insert into private.payment_provider_receipts(payment_id,booking_id,source_event_id,provider,integration_environment,provider_account_scope,
 provider_payment_id,provider_charge_id,destination_account_id,amount_minor,currency_code,provider_succeeded_at)
 values(nid,p.booking_id,ev,'stripe','test','acct_B3B2Platform','pi_Second','ch_Second',p.provider_destination_account_id,37500,'GBP',date_trunc('second',clock_timestamp())) returning id into rid;
 update public.booking_payments set payment_status='succeeded',provider_charge_id='ch_Second',provider_success_at=date_trunc('second',clock_timestamp()),succeeded_at=clock_timestamp() where id=nid;
 if compensation then perform private.ensure_payment_refund_obligation(rid,'duplicate_payment'); end if;
 update private.payment_provider_receipts set disposition=case when compensation then 'compensation_required' else 'fulfilled' end where id=rid;
 return nid;
end $$;
savepoint multiple_payments;
select pg_temp.second_collection(false);
select pg_temp.new_refund(10,12500);
select pg_temp.ok(pg_temp.apply(10)='applied','full first payment with second settlement');
select pg_temp.ok((select payment_status='partially_refunded' from public.bookings where id=(select bid from fixture)),'second collection remains in settlement denominator');
set constraints all immediate;
rollback to multiple_payments;
select pg_temp.second_collection(true);
select pg_temp.new_refund(11,12500);
select pg_temp.ok(pg_temp.apply(11)='applied','other charge compensation does not reserve first payment');
select pg_temp.ok((select payment_status='refunded' from public.bookings where id=(select bid from fixture)),'compensation money excluded from denominator');
set constraints all immediate;
rollback to multiple_payments;
-- Historical missing/unsafe data never gets invented.
select pg_temp.new_refund(12,100);
set constraints all immediate;
set constraints all deferred;
savepoint missing_collection;
alter table private.payment_provider_receipts disable trigger protect_payment_provider_receipt;
update private.payment_provider_receipts set disposition='manual_review' where payment_id=(select pid from fixture);
set constraints all immediate;
set constraints all deferred;
alter table private.payment_provider_receipts enable trigger protect_payment_provider_receipt;
select pg_temp.ok(pg_temp.apply(12)='manual_review','unproven historical collection');
rollback to missing_collection;
-- Artificial over-capacity request only to test the RPC independently of admission.
set constraints all immediate;
set constraints all deferred;
savepoint excessive;
alter table public.payment_refunds disable trigger validate_payment_refund_context;
insert into public.payment_refunds(booking_id,booking_payment_id,provider,provider_refund_id,amount_minor,currency_code)
select bid,pid,'stripe','re_Excess',13000,'GBP' from fixture;
set constraints all immediate;
set constraints all deferred;
alter table public.payment_refunds enable trigger validate_payment_refund_context;
select pg_temp.ok((select reason_code='CAPACITY_EXCEEDED' from public.apply_ordinary_refund_success(
 (select id from public.payment_refunds where provider_refund_id='re_Excess'),
 (select refund_receipt_id from public.record_payment_refund_success_evidence('stripe','test','acct_B3B2Platform','re_Excess',
 'pi_B3B2','ch_Fulfill',13000,'GBP',date_trunc('second',clock_timestamp()),'api_retrieval')))),'RPC independently rejects excessive verified amount');
rollback to excessive;
select pg_temp.ok(not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private') and t.tgenabled='D'),'all fixture guards restored');
-- Valid request transitions that must not be revived by confirmation.
savepoint failed_request;
update public.payment_refunds set refund_status='failed',failed_at=clock_timestamp() where id=(select id from requests where n=12);
select pg_temp.ok(pg_temp.apply(12)='manual_review','failed ordinary request stays failed');
rollback to failed_request;
savepoint cancelled_request;
update public.payment_refunds set refund_status='cancelled',cancelled_at=clock_timestamp() where id=(select id from requests where n=12);
select pg_temp.ok(pg_temp.apply(12)='manual_review','cancelled ordinary request stays cancelled');
rollback to cancelled_request;
select pg_temp.ok(pg_temp.apply(12)='applied','ordinary valid after rollback');
select pg_temp.ok((select outcome='conflict' from public.apply_ordinary_refund_success((select id from requests where n=12),
 (select refund_receipt_id from public.record_payment_refund_success_evidence('stripe','test','acct_B3B2Platform','re_NewEvidence',
 'pi_B3B2','ch_Fulfill',100,'GBP',date_trunc('second',clock_timestamp()),'api_retrieval')))),'same request different unused receipt conflicts');
select pg_temp.reject('update public.booking_payments set payment_status=''refunded'' where id=(select pid from fixture); set constraints all immediate','23514');
set constraints all immediate;

rollback to before_partials;
select pg_temp.new_refund(90,100);
select pg_temp.reject($q$insert into private.payment_refund_applications(refund_receipt_id,application_kind,ordinary_refund_id,
 prior_refunded_minor,resulting_refunded_minor,previous_payment_status,resulting_payment_status,
 previous_booking_payment_status,resulting_booking_payment_status)
 select eid,'ordinary',id,0,100,'succeeded','partially_refunded','paid','partially_refunded' from requests where n=90$q$,'23514');
select pg_temp.reject($q$insert into private.payment_refund_applications(refund_receipt_id,application_kind,ordinary_refund_id,
 prior_refunded_minor,resulting_refunded_minor,previous_payment_status,resulting_payment_status,
 previous_booking_payment_status,resulting_booking_payment_status)
 select eid,'ordinary',id,0,100,'succeeded','partially_refunded','partially_paid','refunded' from requests where n=90$q$,'23514');
select pg_temp.ok(pg_temp.apply(90)='applied','truthful snapshot accepted after corrupt snapshot rejection');
set constraints all immediate;
set constraints all deferred;
