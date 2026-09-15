-- Existing fixture is a real requested/approved/collected/cancelled booking.
select pg_temp.new_refund(1,100,false);
create temp table claims(v jsonb);
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='disabled','disabled blocks create');
select pg_temp.ok(not exists(select 1 from private.ordinary_refund_executions),'disabled creates no execution');
update private.payment_integration_settings set provider_account_scope='acct_B3B2Platform',enabled=true;
insert into claims select public.claim_ordinary_refund_execution((select id from requests));
select pg_temp.ok((select v->>'action'='create' and (v->>'attempt_count')::integer=1 from claims),'first claim');
select pg_temp.ok((select refund_status='processing' from public.payment_refunds where id=(select id from requests)),'claim reserves processing');
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='already_claimed','active claim excluded');
select pg_temp.ok(public.check_ordinary_refund_dispatch((select id from requests),(select (v->>'claim_token')::uuid from claims)),'fresh dispatch check');
select pg_temp.reject('select public.attach_ordinary_refund_provider((select id from requests),gen_random_uuid(),''re_Test'')','55000');
select pg_temp.reject('update private.ordinary_refund_executions set provider_idempotency_key=''changed''','55000');
select pg_temp.reject('update private.ordinary_refund_executions set amount_minor=101','23514');
select pg_temp.reject('update private.ordinary_refund_executions set reverse_transfer=false','55000');
select pg_temp.reject('update private.ordinary_refund_executions set recovery_deadline=recovery_deadline+interval ''1 hour''','55000');
select pg_temp.reject('delete from private.ordinary_refund_executions','55000');
select pg_temp.reject('update public.payment_refunds set refund_status=''failed'',failed_at=clock_timestamp() where id=(select id from requests)','55000');
select pg_temp.reject('update public.payment_refunds set refund_status=''cancelled'',cancelled_at=clock_timestamp() where id=(select id from requests)','55000');
savepoint active_claim;
-- Test-only simulated expiry; no wall-clock waiting or production time bypass.
alter table private.ordinary_refund_executions disable trigger protect_ordinary_execution;
update private.ordinary_refund_executions set claimed_at=transaction_timestamp()-interval '121 seconds',
 lease_expires_at=transaction_timestamp()-interval '1 second',next_attempt_at=transaction_timestamp()-interval '1 second';
alter table private.ordinary_refund_executions enable trigger protect_ordinary_execution;
select pg_temp.reject('select public.attach_ordinary_refund_provider((select id from requests),(select (v->>''claim_token'')::uuid from claims),''re_Test'')','55000');
select pg_temp.reject('select public.check_ordinary_refund_dispatch((select id from requests),(select (v->>''claim_token'')::uuid from claims))','55000');
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'claim_token'<>(select v->>'claim_token' from claims),'reclaim fresh token');
select pg_temp.ok((select attempt_count=2 from private.ordinary_refund_executions),'reclaim increments once');
rollback to active_claim;
update private.payment_integration_settings set enabled=false,provider_account_scope=null;
select pg_temp.ok(not public.check_ordinary_refund_dispatch((select id from requests),(select (v->>'claim_token')::uuid from claims)),'deactivation blocks dispatch');
select pg_temp.ok((public.attach_ordinary_refund_provider((select id from requests),(select (v->>'claim_token')::uuid from claims),'re_B41'))->>'outcome'='bound','response survives deactivation');
select pg_temp.ok((select state='ready' and claim_token is null and provider_bound_at is not null from private.ordinary_refund_executions),'attachment clears lease');
-- Make retrieval due inside this rollback fixture.
alter table private.ordinary_refund_executions disable trigger protect_ordinary_execution;
update private.ordinary_refund_executions set next_attempt_at=clock_timestamp()-interval '1 second';
alter table private.ordinary_refund_executions enable trigger protect_ordinary_execution;
update claims set v=public.claim_ordinary_refund_execution((select id from requests));
select pg_temp.ok((select v->>'action'='retrieve' from claims),'known ID retrieves while disabled');
select pg_temp.reject('select public.attach_ordinary_refund_provider((select id from requests),(select (v->>''claim_token'')::uuid from claims),''re_Different'')','23514');
savepoint retrieve_claim;
select pg_temp.ok((public.attach_ordinary_refund_provider((select id from requests),(select (v->>'claim_token')::uuid from claims),'re_B41'))->>'outcome'='bound','fresh same-ID replay');
rollback to retrieve_claim;
select pg_temp.ok(pg_temp.apply(1)='applied','B4A success');
select pg_temp.ok((select state='completed' and claim_token is null and completed_at is not null from private.ordinary_refund_executions),'canonical completion clears claim');
select pg_temp.reject('select public.report_ordinary_refund_execution((select id from requests),(select (v->>''claim_token'')::uuid from claims),''PROVIDER_RETRY'')','55000');
set constraints all immediate;
set constraints all deferred;
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='completed','success replay');
rollback to active_claim;
select pg_temp.ok((public.report_ordinary_refund_execution((select id from requests),(select (v->>'claim_token')::uuid from claims),'PROVIDER_RETRY'))->>'outcome'='retry','ambiguous retry');
select pg_temp.ok((select state='ready' and next_attempt_at between clock_timestamp()+interval '28 seconds' and clock_timestamp()+interval '31 seconds' from private.ordinary_refund_executions),'30 second backoff');
select pg_temp.ok((select refund_status='processing' from public.payment_refunds where id=(select id from requests)),'retry retains money');
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='not_due','backoff respected');
rollback to active_claim;
select pg_temp.ok((public.report_ordinary_refund_execution((select id from requests),(select (v->>'claim_token')::uuid from claims),'PROVIDER_REJECTED'))->>'outcome'='manual_review','terminal provider retains review');
select pg_temp.ok((select refund_status='processing' from public.payment_refunds where id=(select id from requests)),'manual review retains reservation');
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='manual_review','review terminal');
rollback to active_claim;
alter table private.ordinary_refund_executions disable trigger protect_ordinary_execution;
update private.ordinary_refund_executions set attempt_count=20,claimed_at=transaction_timestamp()-interval '121 seconds',
 lease_expires_at=transaction_timestamp()-interval '1 second',next_attempt_at=transaction_timestamp()-interval '1 second';
alter table private.ordinary_refund_executions enable trigger protect_ordinary_execution;
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='manual_review','attempt 21 prohibited');
select pg_temp.ok((select attempt_count=20 and last_error_code='ATTEMPTS_EXHAUSTED' from private.ordinary_refund_executions),'exhaustion count fixed');
rollback to active_claim;
alter table private.ordinary_refund_executions disable trigger protect_ordinary_execution;
update private.ordinary_refund_executions set first_dispatch_authorized_at=transaction_timestamp()-interval '24 hours',
 recovery_deadline=transaction_timestamp()-interval '1 hour',claimed_at=transaction_timestamp()-interval '121 seconds',
 lease_expires_at=transaction_timestamp()-interval '1 second',next_attempt_at=transaction_timestamp()-interval '1 second';
alter table private.ordinary_refund_executions enable trigger protect_ordinary_execution;
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='manual_review','23 hour limit');
rollback to active_claim;
do $$ declare role_name text; p regprocedure; begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  perform pg_temp.ok(not has_table_privilege(role_name,'private.ordinary_refund_executions','SELECT,INSERT,UPDATE,DELETE'),'private table '||role_name);
 end loop;
 for p in select oid::regprocedure from pg_proc where proname in ('claim_ordinary_refund_execution','check_ordinary_refund_dispatch','attach_ordinary_refund_provider','report_ordinary_refund_execution') loop
  perform pg_temp.ok(has_function_privilege('service_role',p,'EXECUTE') and not has_function_privilege('anon',p,'EXECUTE') and not has_function_privilege('authenticated',p,'EXECUTE'),'RPC ACL '||p);
  perform pg_temp.ok((select proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""'] from pg_proc where oid=p),'owner/search path '||p);
  perform pg_temp.ok(not exists(select 1 from pg_proc x, lateral aclexplode(coalesce(x.proacl,acldefault('f',x.proowner))) a where x.oid=p and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC revoked '||p);
 end loop;
end $$;
-- Neither key rotation nor a second ordinary reservation can escape the model.
select pg_temp.reject('select public.request_payment_refund(gen_random_uuid(),(select pid from fixture),12500,''over capacity'')','23514');
select pg_temp.reject('select public.report_ordinary_refund_execution((select id from requests),(select (v->>''claim_token'')::uuid from claims),''raw provider error'')','22023');
savepoint retry_cap;
alter table private.ordinary_refund_executions disable trigger protect_ordinary_execution;
update private.ordinary_refund_executions set attempt_count=19;
alter table private.ordinary_refund_executions enable trigger protect_ordinary_execution;
select public.report_ordinary_refund_execution((select id from requests),(select (v->>'claim_token')::uuid from claims),'PROVIDER_RETRY');
select pg_temp.ok((select next_attempt_at between clock_timestamp()+interval '3598 seconds' and clock_timestamp()+interval '3601 seconds' from private.ordinary_refund_executions),'backoff capped one hour');
rollback to retry_cap;
savepoint no_activation;
update private.payment_integration_settings set enabled=false,provider_account_scope=null;
select pg_temp.ok(not public.check_ordinary_refund_dispatch((select id from requests),(select (v->>'claim_token')::uuid from claims)),'NULL scope no authorization');
rollback to no_activation;
-- Deliberately adversarial rollback-only pairing: simulate an unresolved receipt
-- with the same financial identity, then exercise the real obligation guard.
set constraints all immediate;
set constraints all deferred;
savepoint compensation_guard;
alter table private.payment_provider_receipts disable trigger user;
update private.payment_provider_receipts set disposition='unresolved' where id=(select collection_receipt_id from private.ordinary_refund_executions);
alter table private.payment_provider_receipts enable trigger user;
select pg_temp.reject('select private.ensure_payment_refund_obligation((select collection_receipt_id from private.ordinary_refund_executions),''hold_unavailable'')','23514');
select pg_temp.ok(not exists(select 1 from private.payment_refund_obligations),'ordinary processing prevents matching compensation');
rollback to compensation_guard;
-- A genuine second charge on the same PaymentIntent is a different economic
-- requirement; the existing reconciler must retain its money independently.
savepoint other_charge;
select pg_temp.ok(pg_temp.settle_collection(pg_temp.collection('OtherCharge'))='compensation_required','second charge compensation');
select pg_temp.ok(not private.compensation_reserves_payment((select pid from fixture)),'different charge does not reserve original payment');
do $$ declare oid uuid; tok uuid; begin
 select obligation_id,claim_token into oid,tok from public.claim_payment_refund_obligations(20);
 perform public.attach_payment_refund_provider(oid,tok,'re_CompOwned');
end $$;
select pg_temp.reject('select public.attach_ordinary_refund_provider((select id from requests),(select (v->>''claim_token'')::uuid from claims),''re_CompOwned'')','23514');
select pg_temp.ok((select provider_refund_id is null from public.payment_refunds where id=(select id from requests)),'compensation binding cannot be reused');

select public.report_ordinary_refund_execution((select id from requests),(select (v->>'claim_token')::uuid from claims),'PROVIDER_RETRY');
alter table private.ordinary_refund_executions disable trigger protect_ordinary_execution;
update private.ordinary_refund_executions set next_attempt_at=transaction_timestamp()-interval '1 second';
alter table private.ordinary_refund_executions enable trigger protect_ordinary_execution;
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='create','unrelated compensation permits claim');
set constraints all immediate;
set constraints all deferred;
rollback to other_charge;
savepoint competing_binding;
select public.attach_ordinary_refund_provider((select id from requests),(select (v->>'claim_token')::uuid from claims),'re_ScopedIdentity');
select pg_temp.new_refund(3,100,false);
create temp table second_claim as select public.claim_ordinary_refund_execution((select id from requests where n=3)) v;
select pg_temp.reject('select public.attach_ordinary_refund_provider((select id from requests where n=3),(select (v->>''claim_token'')::uuid from second_claim),''re_ScopedIdentity'')','23505');
select pg_temp.ok((select provider_refund_id is null from public.payment_refunds where id=(select id from requests where n=3)),'collision leaves binding NULL');
select pg_temp.ok((public.attach_ordinary_refund_provider((select id from requests where n=3),(select (v->>'claim_token')::uuid from second_claim),'re_Distinct'))->>'outcome'='bound','distinct refund binding permitted');
rollback to competing_binding;
-- Force a normally impossible overlap to prove claim-time defense in depth.
-- Both source guards are restored; the deliberately invalid pair is rolled back.
set constraints all immediate;
set constraints all deferred;
savepoint forced_overlap;
alter table private.payment_provider_receipts disable trigger user;
update private.payment_provider_receipts set disposition='unresolved' where id=(select collection_receipt_id from private.ordinary_refund_executions);
alter table private.payment_refund_obligations disable trigger protect_payment_refund_obligation;
select private.ensure_payment_refund_obligation((select collection_receipt_id from private.ordinary_refund_executions),'hold_unavailable');
-- Pending deferred checks prevent ALTER here; rollback restores this guard.
update private.payment_provider_receipts set disposition='fulfilled' where id=(select collection_receipt_id from private.ordinary_refund_executions);
alter table private.payment_provider_receipts enable trigger user;
alter table private.ordinary_refund_executions disable trigger protect_ordinary_execution;
update private.ordinary_refund_executions set state='ready',claim_token=null,claimed_at=null,lease_expires_at=null,next_attempt_at=transaction_timestamp();
alter table private.ordinary_refund_executions enable trigger protect_ordinary_execution;
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='manual_review','claim refuses matching compensation');
rollback to forced_overlap;
-- Durable contradiction reporting closes the next-invocation path.
savepoint durable_conflict;
select pg_temp.ok((public.report_ordinary_refund_execution((select id from requests),(select (v->>'claim_token')::uuid from claims),'IDENTITY_CONFLICT'))->>'outcome'='manual_review','binding contradiction persisted');
select pg_temp.ok((select state='manual_review' and last_error_code='IDENTITY_CONFLICT' and claim_token is null and lease_expires_at is null from private.ordinary_refund_executions),'conflict clears ownership');
select pg_temp.ok((select refund_status='processing' and provider_refund_id is null from public.payment_refunds where id=(select id from requests)),'conflict retains public reservation and does not bind');
select pg_temp.ok((public.claim_ordinary_refund_execution((select id from requests)))->>'action'='manual_review','next invocation cannot create after contradiction');
select pg_temp.reject('select public.request_payment_refund(gen_random_uuid(),(select pid from fixture),12500,''still reserved'')','23514');
select pg_temp.reject('select public.report_ordinary_refund_execution((select id from requests),(select (v->>''claim_token'')::uuid from claims),''IDENTITY_CONFLICT'')','55000');
rollback to durable_conflict;
-- Unapplied functions are invisible to another session. Deterministically
-- simulate expiry precisely after settings acquisition, leaving the production
-- authorization expression unchanged. SAVEPOINT rollback restores body/guards.
savepoint post_lock_expiry;
create temp table original_freshness as select pg_get_functiondef('public.check_ordinary_refund_dispatch(uuid,uuid)'::regprocedure) body;
alter table private.ordinary_refund_executions disable trigger protect_ordinary_execution;
do $test$
declare body text; marker text:='select * into cfg from private.payment_integration_settings where singleton for share;';
begin
 select o.body into body from original_freshness o;
 if position(marker in body)=0 then raise exception 'Freshness test injection point missing'; end if;
 execute replace(body,marker,marker||$inject$
 update private.ordinary_refund_executions set claimed_at=transaction_timestamp()-interval '121 seconds',
 lease_expires_at=transaction_timestamp()-interval '1 second',next_attempt_at=transaction_timestamp()-interval '1 second'
 where refund_id=target_refund_id;
 $inject$);
end $test$;
select pg_temp.ok(not public.check_ordinary_refund_dispatch((select id from requests),(select (v->>'claim_token')::uuid from claims)),'post-lock expired lease cannot authorize');
rollback to post_lock_expiry;
select pg_temp.ok(public.check_ordinary_refund_dispatch((select id from requests),(select (v->>'claim_token')::uuid from claims)),'original function and active claim restored');
-- A new, never-dispatched request retains its existing cancellation policy.
select pg_temp.new_refund(2,100,false);
update public.payment_refunds set refund_status='cancelled',cancelled_at=clock_timestamp() where id=(select id from requests where n=2);
select pg_temp.ok((select refund_status='cancelled' from public.payment_refunds where id=(select id from requests where n=2)),'pre-dispatch cancellation unaffected');
-- All test-only guard changes above were restored before leaving each savepoint.
select pg_temp.ok(not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private') and t.tgenabled='D'),'all guards enabled');
