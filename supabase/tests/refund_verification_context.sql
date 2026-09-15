-- Run AFTER transactionally loading B3B2 and the context migration. This script
-- deliberately ends in ROLLBACK, never COMMIT. No provider calls or activation.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'FAIL: %',label;end if;
 raise notice 'PASS: %',label;
end $$;
create function pg_temp.reject_statement(statement text,expected text) returns void language plpgsql as $$begin
 begin execute statement; exception when others then
   if sqlstate=expected then raise notice 'PASS: expected rejection %',expected;return;end if;raise;
 end;
 raise exception 'FAIL: expected rejection %',expected;
end $$;
select pg_temp.assert_true((select not enabled and provider_account_scope is null from private.payment_integration_settings),'integration disabled');
create temp table verification_fixture(booking_id uuid,payment_id uuid,receipt_id uuid,obligation_id uuid,event_id bigint);
insert into verification_fixture(booking_id,payment_id) values(gen_random_uuid(),gen_random_uuid());
select set_config('request.jwt.claim.sub','3a6e28c3-427a-42dc-88f9-bd78979c8125',true);
select * from public.submit_booking_request((select booking_id from verification_fixture),'5d28d971-34b9-44ef-826f-8c35e44b8af1',
 '2026-12-10 18:00+00','2026-12-10 20:00+00','[{"space_id":"b62ebccb-110f-4df1-8360-f11dc67dd930"}]','Verification rollback',80,'{"notes":"B3B3A rollback fixture"}');
-- Construct persisted historical terms without running activation-gated preparation.
insert into public.organization_payment_accounts(organization_id,provider,provider_account_id,integration_environment)
 select organization_id,'stripe','acct_VerificationDestination','test' from public.bookings where id=(select booking_id from verification_fixture);
insert into private.booking_payment_terms(booking_id,deposit_schedule_id,final_schedule_id,customer_total_minor,marketplace_commission_minor,
 deposit_amount_minor,final_amount_minor,deposit_application_fee_minor,final_application_fee_minor,currency_code)
 select b.id,d.id,f.id,b.customer_total_minor,b.marketplace_commission_minor,d.amount_minor,f.amount_minor,
 floor(b.marketplace_commission_minor::numeric*d.amount_minor/b.customer_total_minor)::bigint,
 b.marketplace_commission_minor-floor(b.marketplace_commission_minor::numeric*d.amount_minor/b.customer_total_minor)::bigint,b.currency_code
 from public.bookings b join public.booking_payment_schedule d on d.booking_id=b.id and d.installment_type='deposit'
 join public.booking_payment_schedule f on f.booking_id=b.id and f.installment_type='final' where b.id=(select booking_id from verification_fixture);
insert into public.booking_payments(id,booking_id,payment_schedule_id,payment_kind,provider,provider_payment_id,provider_idempotency_key,
 payment_status,amount_minor,currency_code,integration_environment,organization_payment_account_id,provider_destination_account_id,application_fee_minor)
 select v.payment_id,v.booking_id,t.deposit_schedule_id,'deposit','stripe','pi_Verification','verification-rollback-only',
 'pending',t.deposit_amount_minor,t.currency_code,'test',a.id,a.provider_account_id,t.deposit_application_fee_minor
 from verification_fixture v join private.booking_payment_terms t on t.booking_id=v.booking_id
 join public.bookings b on b.id=v.booking_id join public.organization_payment_accounts a on a.organization_id=b.organization_id and a.provider_account_id='acct_VerificationDestination';
update verification_fixture set event_id=(select event_id from public.ingest_payment_provider_event('stripe','test','acct_Verification','evt_Verification','payment_intent.succeeded',date_trunc('second',clock_timestamp()),'{"schema_version":1}'));
-- Local trusted historical fixture; never enable the integration to construct it.
insert into private.payment_provider_receipts(payment_id,booking_id,source_event_id,provider,integration_environment,provider_account_scope,
 provider_payment_id,provider_charge_id,destination_account_id,amount_minor,currency_code,provider_succeeded_at)
 select payment_id,booking_id,event_id,'stripe','test','acct_Verification','pi_Verification','ch_Verification','acct_VerificationDestination',12500,'GBP',date_trunc('second',clock_timestamp()) from verification_fixture;
update verification_fixture set receipt_id=(select id from private.payment_provider_receipts where provider_charge_id='ch_Verification');
update public.booking_payments set provider_charge_id='ch_Verification',provider_success_at=(select provider_succeeded_at from private.payment_provider_receipts where id=(select receipt_id from verification_fixture)),payment_status='succeeded',succeeded_at=clock_timestamp() where id=(select payment_id from verification_fixture);
update verification_fixture set obligation_id=private.ensure_payment_refund_obligation((select receipt_id from verification_fixture),'hold_unavailable');
update private.payment_provider_receipts set disposition='compensation_required' where id=(select receipt_id from verification_fixture);
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert_true((select correlation_status='matched' and provider_account_scope='acct_Verification' and amount_minor=12500 and currency_code='GBP' and provider_refund_id is null and candidate_count=1 from public.get_payment_refund_verification_context((select obligation_id from verification_fixture))),'immutable context matches while disabled without lease');
select pg_temp.assert_true((select state='pending' and claim_token is null and attempt_count=0 from private.payment_refund_obligations where id=(select obligation_id from verification_fixture)),'context does not claim or execute');
select pg_temp.assert_true((select count(*)=0 from public.get_payment_refund_verification_context(gen_random_uuid())),'missing returns no rows');
select set_config('test.verification_obligation',(select obligation_id::text from verification_fixture),true);
set local role service_role;
select pg_temp.assert_true((select count(*)=1 from public.get_payment_refund_verification_context(current_setting('test.verification_obligation')::uuid)),'service executes read');
reset role;
set local role authenticated;
select pg_temp.reject_statement('select * from public.get_payment_refund_verification_context(current_setting(''test.verification_obligation'')::uuid)','42501');
reset role;
set local role anon;
select pg_temp.reject_statement('select * from public.get_payment_refund_verification_context(current_setting(''test.verification_obligation'')::uuid)','42501');
reset role;
select pg_temp.assert_true((select p.proowner='postgres'::regrole and p.prosecdef and p.proconfig=array['search_path=""'] from pg_proc p where oid='public.get_payment_refund_verification_context(uuid)'::regprocedure),'owner security definer empty path');
select pg_temp.assert_true(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.get_payment_refund_verification_context(uuid)'::regprocedure and a.grantee=0),'PUBLIC no execute');
select pg_temp.assert_true(not has_table_privilege('service_role','private.payment_refund_obligations','SELECT,INSERT,UPDATE,DELETE'),'no direct obligation privilege');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.reconcile_payment_refund_success(uuid)','EXECUTE') and has_function_privilege('service_role','public.reconcile_payment_refund_success(uuid)','EXECUTE'),'B3B2 privilege unchanged');
savepoint mismatched_identity;
alter table public.booking_payments disable trigger user;
update public.booking_payments set provider_payment_id='pi_Different' where id=(select payment_id from verification_fixture);
alter table public.booking_payments enable trigger user;
select pg_temp.assert_true((select correlation_status='mismatch' and provider_payment_id='pi_Verification' from public.get_payment_refund_verification_context((select obligation_id from verification_fixture))),'mismatch retains immutable expected identity');
rollback to mismatched_identity;
savepoint uncorrelated_context;
insert into private.payment_provider_receipts(source_event_id,provider,integration_environment,provider_account_scope,
 provider_payment_id,provider_charge_id,amount_minor,currency_code,provider_succeeded_at)
 select event_id,'stripe','test','acct_Verification','pi_Uncorrelated','ch_Uncorrelated',12500,'GBP',date_trunc('second',clock_timestamp()) from verification_fixture;
select private.ensure_payment_refund_obligation((select id from private.payment_provider_receipts where provider_charge_id='ch_Uncorrelated'),'payment_context_mismatch');
update private.payment_provider_receipts set disposition='compensation_required' where provider_charge_id='ch_Uncorrelated';
select pg_temp.assert_true((select correlation_status='uncorrelated' and payment_id is null and booking_id is null from public.get_payment_refund_verification_context((select id from private.payment_refund_obligations where provider_charge_id='ch_Uncorrelated'))),'uncorrelated context never invents association');
set constraints all immediate;
rollback to uncorrelated_context;
-- B3B2 still atomically pairs success, without changing booking/inventory.
create temp table before_verify as select to_jsonb(b) value from public.bookings b where id=(select booking_id from verification_fixture);
create temp table success_evidence as select refund_receipt_id from public.record_payment_refund_success_evidence('stripe','test','acct_Verification','re_Verification','pi_Verification','ch_Verification',12500,'GBP',date_trunc('second',clock_timestamp()),'api_retrieval');
select pg_temp.assert_true((select outcome='applied' from public.reconcile_payment_refund_success((select refund_receipt_id from success_evidence))),'B3B2 reconciliation compatible');
set constraints all immediate;
select pg_temp.assert_true((select state='succeeded' from private.payment_refund_obligations where id=(select obligation_id from verification_fixture)),'obligation succeeded');
select pg_temp.assert_true((select disposition='applied' from private.payment_provider_refund_receipts where id=(select refund_receipt_id from success_evidence)),'evidence applied');
select pg_temp.assert_true((select value from before_verify)=(select to_jsonb(b) from public.bookings b where id=(select booking_id from verification_fixture)),'booking unchanged');
select pg_temp.assert_true(not exists(select 1 from public.booking_space_allocations where booking_id=(select booking_id from verification_fixture)),'no inventory introduced');
select pg_temp.assert_true((select not enabled and provider_account_scope is null from private.payment_integration_settings),'integration still disabled');
select pg_temp.assert_true((select booking_status='requested' and payment_status='unpaid' and approved_at is null and hold_expires_at is null and declined_at is null from public.bookings where id='7ca68eab-0fce-46bf-813c-e31f6d354235'),'genuine booking unchanged');
select pg_temp.assert_true(not exists(select 1 from public.booking_payments where booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235') and not exists(select 1 from public.booking_space_allocations where booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235'),'genuine no payment or inventory');
rollback;
