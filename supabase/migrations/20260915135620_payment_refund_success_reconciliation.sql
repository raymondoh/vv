-- B3B2: verified automatic-compensation refund success only. No provider calls.
-- The trusted adapter verifies webhook authenticity or authenticated retrieval
-- BEFORE recording scalar evidence. Provider Refund.created is NOT success time.
-- PRE-ACTIVATION GATE: ordinary refund evidence / confirm_payment_refund() still
-- requires separate hardening. This does not authorize production payments.
-- Safe customer presentation remains deferred to 7D.
do $$ begin
 if exists(select 1 from private.payment_refund_obligations where state='succeeded') then
   raise exception 'Existing refund success requires evidence backfill review' using errcode='23514';
 end if;
end $$;

create table private.payment_provider_refund_receipts (
 id uuid primary key default gen_random_uuid(),
 provider text not null check(provider='stripe'),
 integration_environment text not null check(integration_environment in ('test','live')),
 provider_account_scope text not null check(provider_account_scope ~ '^acct_[A-Za-z0-9]+$'),
 provider_refund_id text not null check(provider_refund_id ~ '^re_[A-Za-z0-9]+$'),
 provider_payment_id text not null check(provider_payment_id ~ '^pi_[A-Za-z0-9]+$'),
 provider_charge_id text not null check(provider_charge_id ~ '^ch_[A-Za-z0-9]+$'),
 amount_minor bigint not null check(amount_minor>0),
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 provider_refund_created_at timestamptz not null check(isfinite(provider_refund_created_at)
   and provider_refund_created_at=date_trunc('second',provider_refund_created_at)),
 recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
 first_verification_source text not null check(first_verification_source in ('webhook','api_retrieval')),
 first_provider_event_id text null check(first_provider_event_id ~ '^evt_[A-Za-z0-9]+$'),
 disposition text not null default 'unresolved' check(disposition in ('unresolved','applied','manual_review')),
 check(first_verification_source='webhook' or first_provider_event_id is null),
 check(provider_refund_created_at<=recorded_at),
 unique(provider,integration_environment,provider_account_scope,provider_refund_id),
 unique(id,provider,integration_environment,provider_account_scope)
);
alter table private.payment_provider_refund_receipts owner to postgres;
revoke all on private.payment_provider_refund_receipts from public,anon,authenticated,service_role;
-- Retain every supplied webhook identity, including webhook observations AFTER
-- retrieval recorded the canonical receipt. First provenance stays immutable.
create table private.payment_refund_success_events (
 provider text not null,
 integration_environment text not null,
 provider_account_scope text not null,
 provider_event_id text not null check(provider_event_id ~ '^evt_[A-Za-z0-9]+$'),
 refund_receipt_id uuid not null,
 primary key(provider,integration_environment,provider_account_scope,provider_event_id),
 foreign key(refund_receipt_id,provider,integration_environment,provider_account_scope)
   references private.payment_provider_refund_receipts(id,provider,integration_environment,provider_account_scope)
   on delete restrict
);
alter table private.payment_refund_success_events owner to postgres;
revoke all on private.payment_refund_success_events from public,anon,authenticated,service_role;
create trigger payment_refund_success_events_immutable before update or delete on private.payment_refund_success_events
 for each row execute function private.prevent_append_only_mutation();

create function private.protect_payment_refund_success_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
   if new.disposition<>'unresolved' or new.recorded_at>clock_timestamp() then
     raise exception 'Invalid refund success receipt' using errcode='23514';
   end if;
   return new;
 end if;
 if tg_op='DELETE' or (to_jsonb(new)-'disposition') is distinct from (to_jsonb(old)-'disposition')
   or old.disposition<>'unresolved' or new.disposition not in ('applied','manual_review') then
   raise exception 'Refund success evidence is immutable' using errcode='55000';
 end if;
 return new;
end $$;
create trigger protect_payment_refund_success_receipt before insert or update or delete on private.payment_provider_refund_receipts
 for each row execute function private.protect_payment_refund_success_receipt();

create function private.refund_success_identity_matches(o private.payment_refund_obligations,e private.payment_provider_refund_receipts)
returns boolean language sql immutable security definer set search_path='' as $$
 select row(o.provider,o.integration_environment,o.provider_account_scope,o.provider_refund_id,
   o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code)
 is not distinct from row(e.provider,e.integration_environment,e.provider_account_scope,e.provider_refund_id,
   e.provider_payment_id,e.provider_charge_id,e.amount_minor,e.currency_code);
$$;

create function private.check_refund_success_pair()
returns trigger language plpgsql security definer set search_path='' as $$
declare o private.payment_refund_obligations%rowtype; e private.payment_provider_refund_receipts%rowtype; n integer;
begin
 if tg_table_name='payment_refund_obligations' then
   select * into o from private.payment_refund_obligations where id=new.id;
   select count(*) into n from private.payment_provider_refund_receipts x
     where x.disposition='applied' and private.refund_success_identity_matches(o,x);
   if (o.state='succeeded' and n<>1) or (o.state<>'succeeded' and n<>0) then
     raise exception 'Refund success requires matching applied evidence' using errcode='23514';
   end if;
 else
   select * into e from private.payment_provider_refund_receipts where id=new.id;
   select count(*) into n from private.payment_refund_obligations x
     where x.state='succeeded' and private.refund_success_identity_matches(x,e);
   if (e.disposition='applied' and n<>1) or (e.disposition<>'applied' and n<>0) then
     raise exception 'Applied refund evidence requires matching succeeded obligation' using errcode='23514';
   end if;
 end if;
 return null;
end $$;
create constraint trigger refund_success_obligation_pair after insert or update on private.payment_refund_obligations
 deferrable initially deferred for each row execute function private.check_refund_success_pair();
create constraint trigger refund_success_receipt_pair after insert or update on private.payment_provider_refund_receipts
 deferrable initially deferred for each row execute function private.check_refund_success_pair();

create function public.record_payment_refund_success_evidence(
 provider_value text,environment_value text,account_scope_value text,refund_id_value text,
 payment_id_value text,charge_id_value text,amount_minor_value bigint,currency_value text,
 refund_created_at_value timestamptz,verification_source_value text,provider_event_id_value text default null)
returns table(refund_receipt_id uuid,recording_result text)
language plpgsql security definer set search_path='' as $$
declare e private.payment_provider_refund_receipts%rowtype; eid uuid; inserted_id uuid;
begin
 if provider_value is distinct from 'stripe' or environment_value is null or environment_value not in ('test','live')
   or account_scope_value is null or account_scope_value !~ '^acct_[A-Za-z0-9]+$'
   or refund_id_value is null or refund_id_value !~ '^re_[A-Za-z0-9]+$'
   or payment_id_value is null or payment_id_value !~ '^pi_[A-Za-z0-9]+$'
   or charge_id_value is null or charge_id_value !~ '^ch_[A-Za-z0-9]+$'
   or amount_minor_value is null or amount_minor_value<=0
   or currency_value is null or currency_value !~ '^[A-Z]{3}$'
   or refund_created_at_value is null or not isfinite(refund_created_at_value)
   or refund_created_at_value<>date_trunc('second',refund_created_at_value)
   or refund_created_at_value>clock_timestamp()
   or verification_source_value is null or verification_source_value not in ('webhook','api_retrieval')
   or (provider_event_id_value is not null and (verification_source_value<>'webhook' or provider_event_id_value !~ '^evt_[A-Za-z0-9]+$')) then
   raise exception 'Invalid refund success evidence' using errcode='22023';
 end if;
 insert into private.payment_provider_refund_receipts(provider,integration_environment,provider_account_scope,
   provider_refund_id,provider_payment_id,provider_charge_id,amount_minor,currency_code,provider_refund_created_at,
   first_verification_source,first_provider_event_id)
 values(provider_value,environment_value,account_scope_value,refund_id_value,payment_id_value,charge_id_value,
   amount_minor_value,currency_value,refund_created_at_value,verification_source_value,provider_event_id_value)
 on conflict(provider,integration_environment,provider_account_scope,provider_refund_id) do nothing returning id into inserted_id;
 select * into e from private.payment_provider_refund_receipts x where x.provider=provider_value
   and x.integration_environment=environment_value and x.provider_account_scope=account_scope_value and x.provider_refund_id=refund_id_value;
 if row(e.provider_payment_id,e.provider_charge_id,e.amount_minor,e.currency_code,e.provider_refund_created_at)
   is distinct from row(payment_id_value,charge_id_value,amount_minor_value,currency_value,refund_created_at_value) then
   raise exception 'Conflicting refund success evidence' using errcode='23514';
 end if;
 if provider_event_id_value is not null then
   insert into private.payment_refund_success_events values(provider_value,environment_value,account_scope_value,provider_event_id_value,e.id)
     on conflict(provider,integration_environment,provider_account_scope,provider_event_id) do nothing;
   select x.refund_receipt_id into eid from private.payment_refund_success_events x where x.provider=provider_value
     and x.integration_environment=environment_value and x.provider_account_scope=account_scope_value and x.provider_event_id=provider_event_id_value;
   if eid is distinct from e.id then
     raise exception 'Conflicting refund event evidence' using errcode='23514';
   end if;
 end if;
 return query select e.id,case when inserted_id is null then 'existing' else 'recorded' end;
end $$;

create or replace function private.protect_payment_refund_obligation()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
 r private.payment_provider_receipts%rowtype;
 p public.booking_payments%rowtype;
 reference_now timestamptz:=clock_timestamp();
 due boolean;
begin
 if tg_op='DELETE' then
   raise exception 'Compensation obligation is immutable' using errcode='55000';
 end if;
 if tg_op='UPDATE' then
   if (to_jsonb(new)-array['state','provider_refund_id','attempt_count','next_attempt_at','claim_token',
     'lease_expires_at','last_error_code','updated_at','succeeded_at']) is distinct from
     (to_jsonb(old)-array['state','provider_refund_id','attempt_count','next_attempt_at','claim_token',
     'lease_expires_at','last_error_code','updated_at','succeeded_at'])
     or (old.provider_refund_id is not null and new.provider_refund_id is distinct from old.provider_refund_id) then
     raise exception 'Compensation obligation is immutable' using errcode='55000';
   end if;
   -- Verified success supersedes any non-success operational state, even an
   -- active lease or exhausted/manual review. B3B1 RPCs cannot supply this state.
   if new.state='succeeded' and old.state in ('pending','processing','failed','manual_review') then
     if new.attempt_count<>old.attempt_count or new.provider_refund_id is null
       or new.claim_token is not null or new.lease_expires_at is not null
       or new.next_attempt_at is not null or new.last_error_code is not null
       or new.succeeded_at is null or not isfinite(new.succeeded_at)
       or new.succeeded_at>reference_now or new.succeeded_at<old.created_at
       or not exists(select 1 from private.payment_provider_refund_receipts e
         where private.refund_success_identity_matches(new,e)
           and e.disposition in ('unresolved','applied') and e.recorded_at<=new.succeeded_at) then
       raise exception 'Refund success requires verified evidence' using errcode='23514';
     end if;
     new.updated_at:=reference_now;
     return new;
   end if;
   if old.state in ('manual_review','succeeded') or new.state='succeeded' or new.succeeded_at is not null then
     raise exception 'Refund completion requires verified evidence' using errcode='55000';
   end if;
   due:=case when old.state='processing' then old.lease_expires_at<=reference_now
     else old.next_attempt_at<=reference_now end;
   if new.state='processing' then
     if old.state not in ('pending','failed','processing') or due is not true
       or old.attempt_count>=20 or new.attempt_count<>old.attempt_count+1
       or new.claim_token is null or new.claim_token is not distinct from old.claim_token
       or new.lease_expires_at is null or new.lease_expires_at<=reference_now
       or new.lease_expires_at>reference_now+interval '120 seconds'
       or new.next_attempt_at is distinct from new.lease_expires_at
       or new.last_error_code is not null
       or new.provider_refund_id is distinct from old.provider_refund_id then
       raise exception 'Invalid refund claim' using errcode='55000';
     end if;
   elsif new.state='manual_review' and old.attempt_count=20 and due is true then
     if new.last_error_code is distinct from 'ATTEMPTS_EXHAUSTED'
       or new.attempt_count<>old.attempt_count
       or new.provider_refund_id is distinct from old.provider_refund_id
       or new.claim_token is not null or new.lease_expires_at is not null or new.next_attempt_at is not null then
       raise exception 'Invalid refund exhaustion' using errcode='55000';
     end if;
   elsif old.state='processing' and old.lease_expires_at>reference_now then
     if new.attempt_count<>old.attempt_count or new.claim_token is not null or new.lease_expires_at is not null then
       raise exception 'Invalid refund claim transition' using errcode='55000';
     end if;
     if new.state='pending' then
       if new.provider_refund_id is null or new.provider_refund_id !~ '^re_[A-Za-z0-9]+$'
         or new.last_error_code is not null or new.next_attempt_at is null
         or new.next_attempt_at<=reference_now or new.next_attempt_at>reference_now+interval '5 minutes' then
         raise exception 'Invalid refund attachment' using errcode='55000';
       end if;
     elsif new.state='failed' then
       if old.attempt_count>=20 or new.provider_refund_id is distinct from old.provider_refund_id
         or new.last_error_code is null or new.last_error_code not in
           ('PROVIDER_UNAVAILABLE','NETWORK_ERROR','RATE_LIMITED','DATABASE_RETRY','REFUND_STATUS_RETRY')
         or new.next_attempt_at is null or new.next_attempt_at<=reference_now
         or new.next_attempt_at>reference_now+interval '1 hour' then
         raise exception 'Invalid refund retry' using errcode='55000';
       end if;
     elsif new.state='manual_review' then
       if new.provider_refund_id is distinct from old.provider_refund_id or new.next_attempt_at is not null
         or new.last_error_code is null or not (new.last_error_code in
           ('PROVIDER_REJECTED','CONFLICTING_EVIDENCE','MANUAL_REVIEW_REQUIRED','UNSUPPORTED_PROVIDER_CONTEXT')
           or (old.attempt_count=20 and new.last_error_code='ATTEMPTS_EXHAUSTED')) then
         raise exception 'Invalid refund review' using errcode='55000';
       end if;
     else
       raise exception 'Invalid refund transition' using errcode='55000';
     end if;
   else
     raise exception 'Refund claim unavailable' using errcode='55000';
   end if;
   new.updated_at:=reference_now;
   return new;
 end if;
 -- Initial obligations remain pending/unattempted; preserve B3A identity and overlap validation.
 if new.state<>'pending' or new.attempt_count<>0 or new.provider_refund_id is not null
   or new.claim_token is not null or new.lease_expires_at is not null or new.last_error_code is not null then
   raise exception 'Invalid initial compensation state' using errcode='23514';
 end if;
 if new.payment_id is not null then
   perform b.id from public.bookings b where b.id=new.booking_id for update;
   select * into p from public.booking_payments where id=new.payment_id for update;
 end if;
 select * into r from private.payment_provider_receipts where id=new.receipt_id;
 if r.id is null or r.disposition<>'unresolved' or
   row(new.booking_id,new.payment_id,new.provider,new.integration_environment,new.provider_account_scope,
     new.provider_payment_id,new.provider_charge_id,new.amount_minor,new.currency_code)
   is distinct from row(r.booking_id,r.payment_id,r.provider,r.integration_environment,r.provider_account_scope,
     r.provider_payment_id,r.provider_charge_id,r.amount_minor,r.currency_code) then
   raise exception 'Compensation receipt identity mismatch' using errcode='23514';
 end if;
 if p.id is not null and p.provider=r.provider and p.integration_environment=r.integration_environment
   and p.provider_payment_id=r.provider_payment_id
   and (p.provider_charge_id is null or p.provider_charge_id=r.provider_charge_id)
   and exists(select 1 from public.payment_refunds f where f.booking_payment_id=p.id
     and f.refund_status in ('pending','processing','succeeded')) then
   raise exception 'Ordinary refund already reserves this payment' using errcode='23514';
 end if;
 return new;
end;
$function$;
alter function private.protect_payment_refund_obligation() owner to postgres;
revoke all on function private.protect_payment_refund_obligation() from public,anon,authenticated,service_role;

create function public.reconcile_payment_refund_success(refund_receipt_id uuid)
returns table(evidence_id uuid,obligation_id uuid,outcome text,payment_outcome text)
language plpgsql security definer set search_path='' as $$
declare
 e private.payment_provider_refund_receipts%rowtype;
 o private.payment_refund_obligations%rowtype;
 b public.bookings%rowtype;
 p public.booking_payments%rowtype;
 candidates uuid[];
 target uuid;
 accepted_at timestamptz;
 payment_result text;
begin
 -- Discover immutable financial/correlation identity without evidence locks.
 select * into e from private.payment_provider_refund_receipts x where x.id=refund_receipt_id;
 if e.id is null then raise exception 'Refund success evidence unavailable' using errcode='P0002'; end if;
 select array_agg(x.id order by x.id) into candidates from private.payment_refund_obligations x
 where row(x.provider,x.integration_environment,x.provider_account_scope)=row(e.provider,e.integration_environment,e.provider_account_scope)
   and (x.provider_refund_id=e.provider_refund_id or
     row(x.provider_payment_id,x.provider_charge_id,x.amount_minor,x.currency_code)=
       row(e.provider_payment_id,e.provider_charge_id,e.amount_minor,e.currency_code));
 if coalesce(cardinality(candidates),0)<>1 then
   -- No later booking/payment lock is taken in this branch. Unknown evidence
   -- remains retryable; contradictory multiple candidates require review.
   select * into e from private.payment_provider_refund_receipts x where x.id=refund_receipt_id for update;
   if e.disposition='unresolved' and cardinality(candidates)>1 then
     update private.payment_provider_refund_receipts x set disposition='manual_review' where x.id=e.id;
     insert into private.audit_events(actor_type,action,entity_type,entity_id,metadata)
       values('system','compensation_refund_identity_review','payment_provider_refund_receipt',e.id,
         jsonb_build_object('reason','AMBIGUOUS_OBLIGATION'));
     e.disposition:='manual_review';
   end if;
   return query select e.id,null::uuid,e.disposition,'not_correlated'::text;
   return;
 end if;
 target:=candidates[1];
 select * into o from private.payment_refund_obligations x where x.id=target;
 if o.booking_id is not null then
   select * into b from public.bookings x where x.id=o.booking_id for update;
   select * into p from public.booking_payments x where x.id=o.payment_id for update;
 end if;
 -- Correlated: booking -> payment -> obligation -> evidence.
 -- Uncorrelated: obligation -> evidence. Worker operations never lock payment.
 select * into o from private.payment_refund_obligations x where x.id=target for update;
 select * into e from private.payment_provider_refund_receipts x where x.id=refund_receipt_id for update;
 if e.disposition<>'unresolved' then
   return query select e.id,o.id,case when e.disposition='applied' then 'already_applied' else e.disposition end,'unchanged'::text;
   return;
 end if;
 if row(o.provider,o.integration_environment,o.provider_account_scope,o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code)
   is distinct from row(e.provider,e.integration_environment,e.provider_account_scope,e.provider_payment_id,e.provider_charge_id,e.amount_minor,e.currency_code)
   or (o.provider_refund_id is not null and o.provider_refund_id<>e.provider_refund_id)
   or o.state='succeeded' then
   update private.payment_provider_refund_receipts x set disposition='manual_review' where x.id=e.id;
   insert into private.audit_events(actor_type,organization_id,action,entity_type,entity_id,metadata)
     values('system',b.organization_id,'compensation_refund_identity_review','payment_provider_refund_receipt',e.id,
       jsonb_build_object('obligation_id',o.id,'reason','CONFLICTING_IDENTITY'));
   return query select e.id,o.id,'manual_review'::text,'unchanged'::text;
   return;
 end if;
 accepted_at:=clock_timestamp();
 payment_result:='uncorrelated';
 if o.payment_id is not null then
   if p.id is null or b.id is null or p.booking_id is distinct from o.booking_id or p.id is distinct from o.payment_id
     or row(p.provider,p.integration_environment,p.provider_payment_id,p.provider_charge_id,p.amount_minor,p.currency_code)
       is distinct from row(o.provider,o.integration_environment,o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code) then
     payment_result:='identity_follow_up';
   elsif p.payment_status in ('succeeded','partially_refunded') then
     update public.booking_payments x set payment_status='refunded' where x.id=p.id;
     payment_result:='updated';
   elsif p.payment_status='refunded' then
     payment_result:='already_refunded';
   else
     payment_result:='state_follow_up';
   end if;
 end if;
 -- No current activation requirement: genuine refund success remains true
 -- during shutdown. Original collection receipt stays compensation_required.
 update private.payment_refund_obligations x set state='succeeded',
   provider_refund_id=coalesce(o.provider_refund_id,e.provider_refund_id),succeeded_at=accepted_at,
   claim_token=null,lease_expires_at=null,next_attempt_at=null,last_error_code=null where x.id=o.id;
 update private.payment_provider_refund_receipts x set disposition='applied' where x.id=e.id;
 insert into private.audit_events(actor_type,organization_id,action,entity_type,entity_id,metadata)
   values('system',b.organization_id,'compensation_refund_success_verified','payment_provider_refund_receipt',e.id,
     jsonb_build_object('obligation_id',o.id,'payment_id',o.payment_id,'payment_result',payment_result,
       'previous_obligation_state',o.state,'state','succeeded'));
 if payment_result in ('identity_follow_up','state_follow_up') then
   insert into private.audit_events(actor_type,organization_id,action,entity_type,entity_id,metadata)
     values('system',b.organization_id,'compensation_refund_local_payment_followup','payment_provider_refund_receipt',e.id,
       jsonb_build_object('obligation_id',o.id,'payment_id',o.payment_id,'payment_status',p.payment_status,'reason',payment_result));
 end if;
 return query select e.id,o.id,'applied'::text,payment_result;
end $$;

alter function private.protect_payment_refund_success_receipt() owner to postgres;
alter function private.refund_success_identity_matches(private.payment_refund_obligations,private.payment_provider_refund_receipts) owner to postgres;
alter function private.check_refund_success_pair() owner to postgres;
revoke all on function private.protect_payment_refund_success_receipt(),
 private.refund_success_identity_matches(private.payment_refund_obligations,private.payment_provider_refund_receipts),
 private.check_refund_success_pair() from public,anon,authenticated,service_role;
alter function public.record_payment_refund_success_evidence(text,text,text,text,text,text,bigint,text,timestamptz,text,text) owner to postgres;
alter function public.reconcile_payment_refund_success(uuid) owner to postgres;
revoke all on function public.record_payment_refund_success_evidence(text,text,text,text,text,text,bigint,text,timestamptz,text,text),
 public.reconcile_payment_refund_success(uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_payment_refund_success_evidence(text,text,text,text,text,text,bigint,text,timestamptz,text,text),
 public.reconcile_payment_refund_success(uuid) to service_role;
comment on function public.reconcile_payment_refund_success(uuid) is
 'Automatic compensation only. Ordinary refund provider evidence and confirm_payment_refund() remain a required separate pre-activation hardening gate. No booking aggregate, schedule, inventory, or ordinary-refund mutation. No provider calls.';
