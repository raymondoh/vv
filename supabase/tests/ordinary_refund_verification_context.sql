-- Loaded after the B4A legitimate booking/collection/request fixture by the runner.
select pg_temp.new_refund(1,100);
select set_config('test.ordinary_id',(select id::text from requests where n=1),true);
set constraints all immediate;
set constraints all deferred;
create temp table context_before as select jsonb_build_object(
 'booking',(select to_jsonb(b) from public.bookings b where id=(select bid from fixture)),
 'payment',(select to_jsonb(p) from public.booking_payments p where id=(select pid from fixture)),
 'refund',(select to_jsonb(f) from public.payment_refunds f where id=(select id from requests where n=1)),
 'receipts',(select jsonb_agg(to_jsonb(r) order by id) from private.payment_provider_receipts r),
 'integration',(select to_jsonb(s) from private.payment_integration_settings s)) value;
select pg_temp.ok((select refund_request_id=(select id from requests where n=1) and payment_id=(select pid from fixture)
 and booking_id=(select bid from fixture) and provider='stripe' and amount_minor=100 and currency_code='GBP'
 and provider_refund_id='re_B41' and provider_payment_id='pi_B3B2' and provider_charge_id='ch_Fulfill'
 and provider_account_scope='acct_B3B2Platform' and integration_environment='test' and request_status='pending'
 from public.get_ordinary_refund_verification_context((select id from requests where n=1))), 'exact historical partial context');
select pg_temp.ok((select not enabled and provider_account_scope is null from private.payment_integration_settings),'disabled integration does not supply context scope');
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context(gen_random_uuid())),'unknown request unavailable');
set local role service_role;
select pg_temp.ok((select count(*)=1 from public.get_ordinary_refund_verification_context(current_setting('test.ordinary_id')::uuid)),'service role read allowed');
reset role;
set local role anon;
select pg_temp.reject('select * from public.get_ordinary_refund_verification_context(current_setting(''test.ordinary_id'')::uuid)','42501');
reset role;
set local role authenticated;
select pg_temp.reject('select * from public.get_ordinary_refund_verification_context(current_setting(''test.ordinary_id'')::uuid)','42501');
reset role;
select pg_temp.ok((select proowner='postgres'::regrole and prosecdef and provolatile='s' and proconfig=array['search_path=""']
 from pg_proc where oid='public.get_ordinary_refund_verification_context(uuid)'::regprocedure),'owner stable security definer empty search path');
select pg_temp.ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
 where p.oid='public.get_ordinary_refund_verification_context(uuid)'::regprocedure and a.grantee=0),'PUBLIC has no privilege');
select pg_temp.ok((select value from context_before)=jsonb_build_object(
 'booking',(select to_jsonb(b) from public.bookings b where id=(select bid from fixture)),
 'payment',(select to_jsonb(p) from public.booking_payments p where id=(select pid from fixture)),
 'refund',(select to_jsonb(f) from public.payment_refunds f where id=(select id from requests where n=1)),
 'receipts',(select jsonb_agg(to_jsonb(r) order by id) from private.payment_provider_receipts r),
 'integration',(select to_jsonb(s) from private.payment_integration_settings s)),'read has no mutation');
savepoint missing_binding;
select pg_temp.new_refund(2,100,false);
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context((select id from requests where n=2))),'missing binding unavailable');
rollback to missing_binding;
savepoint replay;
select pg_temp.ok(pg_temp.apply(1)='applied','actual ordinary success');
set constraints all immediate;
select pg_temp.ok((select request_status='succeeded' from public.get_ordinary_refund_verification_context((select id from requests where n=1))),'succeeded replay retains context');
rollback to replay;
-- Deliberately impossible historical fixtures live only within this savepoint.
-- Restore every guard/FK through rollback, never persist invalid financial data.
savepoint unsafe_fixture;
alter table public.payment_refunds disable trigger user;
alter table public.payment_refunds drop constraint payment_refunds_booking_payment_id_fkey;
alter table public.payment_refunds drop constraint payment_refunds_booking_id_fkey;
update public.payment_refunds set booking_payment_id=gen_random_uuid() where id=(select id from requests where n=1);
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context((select id from requests where n=1))),'missing payment unavailable');
update public.payment_refunds set booking_payment_id=(select pid from fixture),booking_id=gen_random_uuid() where id=(select id from requests where n=1);
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context((select id from requests where n=1))),'missing booking unavailable');
update public.payment_refunds set booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235' where id=(select id from requests where n=1);
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context((select id from requests where n=1))),'wrong existing booking relationship unavailable');
update public.payment_refunds set booking_id=(select bid from fixture) where id=(select id from requests where n=1);
alter table public.booking_payments disable trigger user;
update public.booking_payments set booking_id='7ca68eab-0fce-46bf-813c-e31f6d354235' where id=(select pid from fixture);
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context((select id from requests where n=1))),'wrong payment booking identity unavailable');
rollback to unsafe_fixture;
savepoint collection_fixture;
alter table private.payment_provider_receipts disable trigger user;
update private.payment_provider_receipts set disposition='manual_review' where payment_id=(select pid from fixture);
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context((select id from requests where n=1))),'missing qualifying collection unavailable');
update private.payment_provider_receipts set disposition='fulfilled',provider_payment_id='pi_Wrong' where payment_id=(select pid from fixture);
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context((select id from requests where n=1))),'wrong collection/payment identity unavailable');
rollback to collection_fixture;
savepoint ambiguous_fixture;
alter table private.payment_provider_receipts disable trigger user;
alter table private.payment_provider_receipts drop constraint payment_provider_receipts_charge_unique;
do $$ declare r private.payment_provider_receipts%rowtype; begin
 select * into r from private.payment_provider_receipts where payment_id=(select pid from fixture);
 r.id:=gen_random_uuid(); insert into private.payment_provider_receipts select r.*;
end $$;
select pg_temp.ok(not exists(select 1 from public.get_ordinary_refund_verification_context((select id from requests where n=1))),'ambiguous exact collections unavailable');
rollback to ambiguous_fixture;
select pg_temp.ok(not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private') and t.tgenabled='D'),'all guards restored');
set constraints all immediate;
