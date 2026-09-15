-- B4A: canonical ordinary refund application. No provider execution or activation.
-- Prerequisite: B3B2 canonical evidence. All historical ordinary success needs review.
do $$ begin
 if exists(select 1 from public.payment_refunds where refund_status='succeeded') then
   raise exception 'Historical ordinary refund success requires canonical evidence review' using errcode='23514';
 end if;
end $$;

create table private.payment_refund_applications (
 id uuid primary key default gen_random_uuid(),
 refund_receipt_id uuid not null unique references private.payment_provider_refund_receipts(id) on delete restrict,
 application_kind text not null check(application_kind in ('ordinary','compensation')),
 ordinary_refund_id uuid unique references public.payment_refunds(id) on delete restrict,
 compensation_obligation_id uuid unique references private.payment_refund_obligations(id) on delete restrict,
 applied_at timestamptz not null default clock_timestamp() check(isfinite(applied_at)),
 prior_refunded_minor numeric,
 resulting_refunded_minor numeric,
 previous_payment_status text,
 resulting_payment_status text,
 previous_booking_payment_status text,
 resulting_booking_payment_status text,
 check((application_kind='ordinary' and ordinary_refund_id is not null and compensation_obligation_id is null
   and prior_refunded_minor is not null and prior_refunded_minor>=0 and prior_refunded_minor=trunc(prior_refunded_minor)
   and resulting_refunded_minor is not null and resulting_refunded_minor>prior_refunded_minor
   and resulting_refunded_minor=trunc(resulting_refunded_minor)
   and previous_payment_status is not null and previous_payment_status in ('succeeded','partially_refunded')
   and resulting_payment_status is not null and resulting_payment_status in ('partially_refunded','refunded')
   and previous_booking_payment_status is not null
   and resulting_booking_payment_status is not null and resulting_booking_payment_status in ('partially_refunded','refunded'))
 or (application_kind='compensation' and ordinary_refund_id is null and compensation_obligation_id is not null
   and prior_refunded_minor is null and resulting_refunded_minor is null and previous_payment_status is null
   and resulting_payment_status is null and previous_booking_payment_status is null and resulting_booking_payment_status is null))
);
alter table private.payment_refund_applications owner to postgres;
revoke all on private.payment_refund_applications from public,anon,authenticated,service_role;
create trigger payment_refund_applications_immutable before update or delete on private.payment_refund_applications
 for each row execute function private.prevent_append_only_mutation();

alter table private.payment_provider_refund_receipts drop constraint payment_provider_refund_receipts_disposition_check;
alter table private.payment_provider_refund_receipts add constraint payment_provider_refund_receipts_disposition_check
 check(disposition in ('unresolved','applied','ordinary_applied','manual_review'));
create or replace function private.protect_payment_refund_success_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
   if new.disposition<>'unresolved' or new.recorded_at>clock_timestamp() then
     raise exception 'Invalid refund success receipt' using errcode='23514';
   end if;
   return new;
 end if;
 if tg_op='DELETE' or (to_jsonb(new)-'disposition') is distinct from (to_jsonb(old)-'disposition')
   or old.disposition<>'unresolved' or new.disposition not in ('applied','ordinary_applied','manual_review') then
   raise exception 'Refund success evidence is immutable' using errcode='55000';
 end if;
 return new;
end $$;

-- Exact historical settlement identity; never consult current booking pricing or settings.
create function private.ordinary_refund_identity_matches(f public.payment_refunds,e private.payment_provider_refund_receipts)
returns boolean language sql stable security definer set search_path='' as $$
 select f.provider_refund_id is not null
 and row(f.provider,f.provider_refund_id,f.amount_minor,f.currency_code)
   is not distinct from row(e.provider,e.provider_refund_id,e.amount_minor,e.currency_code)
 and exists(select 1 from public.booking_payments p join private.payment_provider_receipts c
   on c.payment_id=p.id and c.booking_id=p.booking_id
   where p.id=f.booking_payment_id and p.booking_id=f.booking_id and c.disposition='fulfilled'
   and row(p.provider,p.integration_environment,p.provider_payment_id,p.provider_charge_id,p.amount_minor,p.currency_code,
     p.provider_success_at,p.provider_destination_account_id)
     is not distinct from row(c.provider,c.integration_environment,c.provider_payment_id,c.provider_charge_id,c.amount_minor,c.currency_code,
     c.provider_succeeded_at,c.destination_account_id)
   and row(e.provider,e.integration_environment,e.provider_account_scope,e.provider_payment_id,e.provider_charge_id,e.currency_code)
     is not distinct from row(c.provider,c.integration_environment,c.provider_account_scope,c.provider_payment_id,c.provider_charge_id,c.currency_code));
$$;

-- Validate the complete ordinary audit chain and terminal payment total at commit.
-- Ordered by cumulative prior value, not wall-clock timestamps (which can tie).
create function private.check_ordinary_refund_totals(target_payment uuid)
returns void language plpgsql security definer set search_path='' as $$
declare total numeric; p public.booking_payments%rowtype; compensation boolean;
begin
 select * into p from public.booking_payments where id=target_payment;
 -- Compensation changes only a fully matching payment to refunded; follow-up and
 -- uncorrelated obligations must never justify another payment's financial state.
 select exists(select 1 from private.payment_refund_applications a
 join private.payment_refund_obligations o on o.id=a.compensation_obligation_id
 join private.payment_provider_refund_receipts e on e.id=a.refund_receipt_id
 where a.application_kind='compensation' and o.state='succeeded' and e.disposition='applied'
 and private.refund_success_identity_matches(o,e)
 and o.payment_id=p.id and o.booking_id=p.booking_id
 and row(p.provider,p.integration_environment,p.provider_payment_id,p.provider_charge_id,p.amount_minor,p.currency_code)
   is not distinct from row(o.provider,o.integration_environment,o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code)) into compensation;
 if not exists(select 1 from private.payment_refund_applications a join public.payment_refunds f
   on f.id=a.ordinary_refund_id where f.booking_payment_id=p.id) then
   if p.payment_status in ('partially_refunded','refunded') and not (compensation and p.payment_status='refunded') then
     raise exception 'Payment refund state requires canonical application' using errcode='23514';
   end if;
   return;
 end if;
 if compensation then raise exception 'Competing refund applications' using errcode='23514'; end if;
 select sum(e.amount_minor::numeric) into total from private.payment_refund_applications a
 join public.payment_refunds f on f.id=a.ordinary_refund_id
 join private.payment_provider_refund_receipts e on e.id=a.refund_receipt_id where f.booking_payment_id=p.id;
 if total>p.amount_minor or p.payment_status<>(case when total=p.amount_minor then 'refunded' else 'partially_refunded' end)
 or exists(select 1 from private.payment_refund_applications a join public.payment_refunds f on f.id=a.ordinary_refund_id
   where f.booking_payment_id=p.id and (
     (select count(*) from private.payment_refund_applications x join public.payment_refunds y on y.id=x.ordinary_refund_id
       where y.booking_payment_id=p.id and x.prior_refunded_minor=a.prior_refunded_minor)<>1
     or a.prior_refunded_minor<>(select coalesce(sum(e.amount_minor::numeric),0)
       from private.payment_refund_applications x join public.payment_refunds y on y.id=x.ordinary_refund_id
       join private.payment_provider_refund_receipts e on e.id=x.refund_receipt_id
       where y.booking_payment_id=p.id and x.prior_refunded_minor<a.prior_refunded_minor)
     or a.previous_payment_status<>(case when a.prior_refunded_minor=0 then 'succeeded' else 'partially_refunded' end))) then
   raise exception 'Ordinary refund cumulative accounting mismatch' using errcode='23514';
 end if;
end $$;
create function private.check_ordinary_payment_refund_totals()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.check_ordinary_refund_totals(new.id); return null; end $$;
create constraint trigger ordinary_payment_refund_totals after insert or update on public.booking_payments
 deferrable initially deferred for each row execute function private.check_ordinary_payment_refund_totals();


-- Read-only financial checks acquire no additional locks and perform no writes.
create function private.ordinary_booking_settlement_gross(target_booking uuid)
returns numeric language plpgsql security definer set search_path='' as $$
declare gross numeric;
begin
 if exists(select 1 from public.booking_payments x where x.booking_id=target_booking
   and x.payment_status in ('succeeded','partially_refunded','refunded')
   and (select count(*) from private.payment_provider_receipts c where c.payment_id=x.id and c.booking_id=target_booking
     and c.disposition in ('fulfilled','compensation_required')
     and row(c.provider,c.integration_environment,c.provider_payment_id,c.provider_charge_id,c.amount_minor,c.currency_code,c.provider_succeeded_at,c.destination_account_id)
       is not distinct from row(x.provider,x.integration_environment,x.provider_payment_id,x.provider_charge_id,x.amount_minor,x.currency_code,x.provider_success_at,x.provider_destination_account_id))<>1) then
   raise exception 'Booking collection unproven' using errcode='23514';
 end if;
 select coalesce(sum(x.amount_minor::numeric),0) into gross from public.booking_payments x
 where x.booking_id=target_booking and x.payment_status in ('succeeded','partially_refunded','refunded')
 and exists(select 1 from private.payment_provider_receipts c where c.payment_id=x.id and c.booking_id=target_booking and c.disposition='fulfilled'
   and row(c.provider,c.integration_environment,c.provider_payment_id,c.provider_charge_id,c.amount_minor,c.currency_code,c.provider_succeeded_at,c.destination_account_id)
     is not distinct from row(x.provider,x.integration_environment,x.provider_payment_id,x.provider_charge_id,x.amount_minor,x.currency_code,x.provider_success_at,x.provider_destination_account_id));
 return gross;
end $$;
create function private.check_ordinary_booking_refund_totals(target_booking uuid)
returns void language plpgsql security definer set search_path='' as $$
declare total numeric; gross numeric; status text;
begin
 select coalesce(sum(e.amount_minor::numeric),0) into total
 from private.payment_refund_applications a join public.payment_refunds f on f.id=a.ordinary_refund_id
 join private.payment_provider_refund_receipts e on e.id=a.refund_receipt_id where f.booking_id=target_booking;
 if total=0 then return; end if;
 gross:=private.ordinary_booking_settlement_gross(target_booking);
 select payment_status into status from public.bookings where id=target_booking;
 if gross<=0 or total>gross or status is distinct from
   (case when total=gross then 'refunded' else 'partially_refunded' end) then
   raise exception 'Booking refund cumulative accounting mismatch' using errcode='23514';
 end if;
end $$;
create function private.check_booking_refund_final_state()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='bookings' then perform private.check_ordinary_booking_refund_totals(new.id);
 else perform private.check_ordinary_booking_refund_totals(new.booking_id); end if;
 return null;
end $$;
create constraint trigger ordinary_booking_refund_totals after insert or update on public.bookings
 deferrable initially deferred for each row execute function private.check_booking_refund_final_state();
create constraint trigger ordinary_booking_payment_totals after insert or update on public.booking_payments
 deferrable initially deferred for each row execute function private.check_booking_refund_final_state();

-- Validate historical snapshots at insertion against the current serialized state.
-- Never compare an earlier snapshot with the final booking after subsequent refunds.
create function private.check_ordinary_application_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid; prior numeric; gross numeric; amount numeric; status text;
begin
 if new.application_kind<>'ordinary' then return new; end if;
 select booking_id into bid from public.payment_refunds where id=new.ordinary_refund_id;
 select amount_minor into amount from private.payment_provider_refund_receipts where id=new.refund_receipt_id;
 select payment_status into status from public.bookings where id=bid;
 select coalesce(sum(e.amount_minor::numeric),0) into prior
 from private.payment_refund_applications a join public.payment_refunds f on f.id=a.ordinary_refund_id
 join private.payment_provider_refund_receipts e on e.id=a.refund_receipt_id where f.booking_id=bid and a.id<>new.id;
 gross:=private.ordinary_booking_settlement_gross(bid);
 if gross<=0 or prior+amount>gross
 or new.previous_booking_payment_status is distinct from status
 or (prior=0 and status not in ('partially_paid','paid'))
 or (prior>0 and status is distinct from (case when prior=gross then 'refunded' else 'partially_refunded' end))
 or new.resulting_booking_payment_status is distinct from
   (case when prior+amount=gross then 'refunded' else 'partially_refunded' end) then
   raise exception 'Ordinary booking snapshot accounting mismatch' using errcode='23514';
 end if;
 return new;
end $$;
create trigger ordinary_application_snapshot after insert on private.payment_refund_applications
 for each row execute function private.check_ordinary_application_snapshot();
-- Application RPCs require initially deferred operation. SET CONSTRAINTS ALL
-- IMMEDIATE validates completed state; forcing it before intermediate writes may reject.

-- Read-only deferred checks. The old compensation pair invariant remains active.
create function private.check_refund_application_pair()
returns trigger language plpgsql security definer set search_path='' as $$
declare eid uuid; a private.payment_refund_applications%rowtype; e private.payment_provider_refund_receipts%rowtype;
 f public.payment_refunds%rowtype; o private.payment_refund_obligations%rowtype; p public.booking_payments%rowtype;
begin
 if tg_table_name='payment_refund_applications' then eid:=new.refund_receipt_id;
 elsif tg_table_name='payment_provider_refund_receipts' then eid:=new.id;
 elsif tg_table_name='payment_refunds' then
   select * into f from public.payment_refunds where id=new.id;
   select refund_receipt_id into eid from private.payment_refund_applications where ordinary_refund_id=new.id;
   if f.refund_status='succeeded' and eid is null then
     raise exception 'Ordinary success requires canonical application' using errcode='23514';
   end if;
 else
   select * into o from private.payment_refund_obligations where id=new.id;
   select refund_receipt_id into eid from private.payment_refund_applications where compensation_obligation_id=new.id;
   if o.state='succeeded' and eid is null then
     raise exception 'Compensation success requires canonical application' using errcode='23514';
   end if;
 end if;
 if eid is null then return null; end if;
 select * into e from private.payment_provider_refund_receipts where id=eid;
 select * into a from private.payment_refund_applications where refund_receipt_id=eid;
 if a.id is null then
   if e.disposition in ('applied','ordinary_applied') then
     raise exception 'Applied evidence requires canonical application' using errcode='23514';
   end if;
   return null;
 end if;
 if a.applied_at<e.recorded_at or a.applied_at>clock_timestamp() then
   raise exception 'Application timestamp must follow verified evidence' using errcode='23514';
 end if;
 if a.application_kind='compensation' then
   select * into o from private.payment_refund_obligations where id=a.compensation_obligation_id;
   if e.disposition<>'applied' or o.state<>'succeeded' or a.applied_at is distinct from o.succeeded_at
     or not private.refund_success_identity_matches(o,e) then
     raise exception 'Compensation application identity mismatch' using errcode='23514';
   end if;
 else
   select * into f from public.payment_refunds where id=a.ordinary_refund_id;
   select * into p from public.booking_payments where id=f.booking_payment_id;
   if e.disposition<>'ordinary_applied' or f.refund_status<>'succeeded'
     or not private.ordinary_refund_identity_matches(f,e) or f.succeeded_at is distinct from a.applied_at
     or a.resulting_refunded_minor<>a.prior_refunded_minor+e.amount_minor
     or a.resulting_refunded_minor>p.amount_minor
     or a.resulting_payment_status<>(case when a.resulting_refunded_minor=p.amount_minor then 'refunded' else 'partially_refunded' end)
     or private.compensation_reserves_payment(p.id) then
     raise exception 'Ordinary application identity mismatch' using errcode='23514';
   end if;
   perform private.check_ordinary_refund_totals(p.id);
   perform private.check_ordinary_booking_refund_totals(f.booking_id);
 end if;
 return null;
end $$;
create constraint trigger refund_application_ledger_pair after insert on private.payment_refund_applications
 deferrable initially deferred for each row execute function private.check_refund_application_pair();
create constraint trigger refund_application_receipt_pair after insert or update on private.payment_provider_refund_receipts
 deferrable initially deferred for each row execute function private.check_refund_application_pair();
create constraint trigger refund_application_ordinary_pair after insert or update on public.payment_refunds
 deferrable initially deferred for each row execute function private.check_refund_application_pair();
create constraint trigger refund_application_compensation_pair after insert or update on private.payment_refund_obligations
 deferrable initially deferred for each row execute function private.check_refund_application_pair();

-- Refuse inconsistent pre-existing pairs before deterministic ledger backfill.
do $$ begin
 if exists(select 1 from private.payment_provider_refund_receipts e where e.disposition='applied'
   and (select count(*) from private.payment_refund_obligations o where o.state='succeeded' and private.refund_success_identity_matches(o,e))<>1)
 or exists(select 1 from private.payment_refund_obligations o where o.state='succeeded'
   and (select count(*) from private.payment_provider_refund_receipts e where e.disposition='applied' and private.refund_success_identity_matches(o,e))<>1) then
   raise exception 'Historical compensation application requires review' using errcode='23514';
 end if;
end $$;

-- Canonical existing compensation pairs only; never invent historical evidence.
insert into private.payment_refund_applications(refund_receipt_id,application_kind,compensation_obligation_id,applied_at)
 select e.id,'compensation',o.id,o.succeeded_at from private.payment_provider_refund_receipts e
 join private.payment_refund_obligations o on private.refund_success_identity_matches(o,e)
 where e.disposition='applied' and o.state='succeeded';

-- Existing compensation lifecycle, now with exclusive canonical consumption.
create or replace function public.reconcile_payment_refund_success(refund_receipt_id uuid)
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
 if e.disposition='ordinary_applied' then
   return query select e.id,o.id,'ordinary_applied'::text,'unchanged'::text;
   return;
 end if;
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
 insert into private.payment_refund_applications(refund_receipt_id,application_kind,compensation_obligation_id,applied_at)
 values(e.id,'compensation',o.id,accepted_at);
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

create function public.apply_ordinary_refund_success(target_refund_id uuid,refund_receipt_id uuid)
returns table(application_id uuid,outcome text,reason_code text,payment_refunded_total_minor numeric,
 payment_status text,booking_payment_status text)
language plpgsql security definer set search_path='' as $$
declare
 f public.payment_refunds%rowtype; p public.booking_payments%rowtype; b public.bookings%rowtype;
 e private.payment_provider_refund_receipts%rowtype; a private.payment_refund_applications%rowtype;
 bid uuid; pid uuid; prior_total numeric; next_total numeric; reserved numeric;
 gross numeric; booking_refunded numeric; next_payment text; next_booking text; applied_time timestamptz;
 reason text;
begin
 -- Discovery only; never take receipt locks before financial parents.
 select x.booking_id,x.booking_payment_id into bid,pid from public.payment_refunds x where x.id=target_refund_id;
 if bid is null or refund_receipt_id is null then
   return query select null::uuid,'manual_review'::text,'UNAVAILABLE'::text,null::numeric,null::text,null::text; return;
 end if;
 select * into b from public.bookings x where x.id=bid for update;
 select * into p from public.booking_payments x where x.id=pid for update;
 perform x.id from private.payment_refund_obligations x where x.payment_id=pid order by x.id for update;
 select * into f from public.payment_refunds x where x.id=target_refund_id for update;
 select * into e from private.payment_provider_refund_receipts x where x.id=apply_ordinary_refund_success.refund_receipt_id for update;
 select * into a from private.payment_refund_applications x where x.refund_receipt_id=apply_ordinary_refund_success.refund_receipt_id;
 if a.id is not null then
   if a.application_kind='ordinary' and a.ordinary_refund_id=target_refund_id then
     return query select a.id,'already_applied'::text,'REPLAY'::text,a.resulting_refunded_minor,
       a.resulting_payment_status,a.resulting_booking_payment_status;
   else
     return query select null::uuid,'conflict'::text,'EVIDENCE_CONSUMED'::text,null::numeric,null::text,null::text;
   end if;
   return;
 end if;
 if exists(select 1 from private.payment_refund_applications x where x.ordinary_refund_id=target_refund_id) then
   return query select null::uuid,'conflict'::text,'REQUEST_CONSUMED'::text,null::numeric,null::text,null::text; return;
 end if;
 if e.id is null then reason:='UNAVAILABLE';
 elsif e.disposition<>'unresolved' then reason:='EVIDENCE_REQUIRES_REVIEW';
 elsif f.booking_id is distinct from b.id or f.booking_payment_id is distinct from p.id or p.booking_id is distinct from b.id then reason:='HISTORICAL_IDENTITY_MISMATCH';
 elsif f.provider_refund_id is null then reason:='REQUEST_BINDING_MISSING';
 elsif not private.ordinary_refund_identity_matches(f,e) then reason:='IDENTITY_MISMATCH';
 elsif private.compensation_reserves_payment(p.id) then reason:='COMPENSATION_RESERVED';
 elsif f.refund_status not in ('pending','processing') or p.payment_status not in ('succeeded','partially_refunded') then reason:='STATE_REQUIRES_REVIEW';
 end if;
 if reason is not null then
   return query select null::uuid,'manual_review'::text,reason,null::numeric,null::text,null::text; return;
 end if;
 select coalesce(sum(r.amount_minor::numeric),0) into prior_total
 from private.payment_refund_applications x join public.payment_refunds y on y.id=x.ordinary_refund_id
 join private.payment_provider_refund_receipts r on r.id=x.refund_receipt_id
 where x.application_kind='ordinary' and y.booking_payment_id=p.id;
 select coalesce(sum(x.amount_minor::numeric),0) into reserved from public.payment_refunds x
 where x.booking_payment_id=p.id and x.id<>f.id and x.refund_status in ('pending','processing');
 next_total:=prior_total+e.amount_minor;
 if next_total>p.amount_minor or next_total+reserved>p.amount_minor then reason:='CAPACITY_EXCEEDED';
 elsif (prior_total=0 and p.payment_status<>'succeeded')
   or (prior_total>0 and (prior_total>=p.amount_minor or p.payment_status<>'partially_refunded')) then reason:='PAYMENT_TOTAL_INCONSISTENT';
 end if;
 if reason is not null then
   return query select null::uuid,'manual_review'::text,reason,null::numeric,null::text,null::text; return;
 end if;
 -- Every collected-looking payment must have exactly one exact historical collection.
 -- Compensation collections are proven but excluded from booking settlement gross.
 if exists(select 1 from public.booking_payments x where x.booking_id=b.id
   and x.payment_status in ('succeeded','partially_refunded','refunded')
   and (select count(*) from private.payment_provider_receipts c where c.payment_id=x.id and c.booking_id=b.id
     and c.disposition in ('fulfilled','compensation_required')
     and row(c.provider,c.integration_environment,c.provider_payment_id,c.provider_charge_id,c.amount_minor,c.currency_code,c.provider_succeeded_at,c.destination_account_id)
       is not distinct from row(x.provider,x.integration_environment,x.provider_payment_id,x.provider_charge_id,x.amount_minor,x.currency_code,x.provider_success_at,x.provider_destination_account_id))<>1) then
   reason:='BOOKING_COLLECTION_UNPROVEN';
 end if;
 select coalesce(sum(x.amount_minor::numeric),0) into gross from public.booking_payments x
 where x.booking_id=b.id and x.payment_status in ('succeeded','partially_refunded','refunded')
 and exists(select 1 from private.payment_provider_receipts c where c.payment_id=x.id and c.booking_id=b.id and c.disposition='fulfilled'
   and row(c.provider,c.integration_environment,c.provider_payment_id,c.provider_charge_id,c.amount_minor,c.currency_code,c.provider_succeeded_at,c.destination_account_id)
     is not distinct from row(x.provider,x.integration_environment,x.provider_payment_id,x.provider_charge_id,x.amount_minor,x.currency_code,x.provider_success_at,x.provider_destination_account_id));
 select coalesce(sum(r.amount_minor::numeric),0)+e.amount_minor into booking_refunded
 from private.payment_refund_applications x join public.payment_refunds y on y.id=x.ordinary_refund_id
 join private.payment_provider_refund_receipts r on r.id=x.refund_receipt_id where y.booking_id=b.id and x.application_kind='ordinary';
 if gross<=0 or booking_refunded>gross then reason:='BOOKING_TOTAL_INCONSISTENT'; end if;
 if reason is not null then
   return query select null::uuid,'manual_review'::text,reason,null::numeric,null::text,null::text; return;
 end if;
 next_payment:=case when next_total=p.amount_minor then 'refunded' else 'partially_refunded' end;
 next_booking:=case when booking_refunded=gross then 'refunded' else 'partially_refunded' end;
 applied_time:=clock_timestamp();
 insert into private.payment_refund_applications(refund_receipt_id,application_kind,ordinary_refund_id,applied_at,
   prior_refunded_minor,resulting_refunded_minor,previous_payment_status,resulting_payment_status,
   previous_booking_payment_status,resulting_booking_payment_status)
 values(e.id,'ordinary',f.id,applied_time,prior_total,next_total,p.payment_status,next_payment,b.payment_status,next_booking)
 returning * into a;
 update public.payment_refunds x set refund_status='succeeded',succeeded_at=applied_time,failed_at=null,cancelled_at=null where x.id=f.id;
 update private.payment_provider_refund_receipts x set disposition='ordinary_applied' where x.id=e.id;
 update public.booking_payments x set payment_status=next_payment where x.id=p.id;
 update public.bookings x set payment_status=next_booking where x.id=b.id;
 insert into private.audit_events(actor_type,organization_id,action,entity_type,entity_id,metadata)
 values('system',b.organization_id,'ordinary_refund_success_applied','payment_refund_application',a.id,
   jsonb_build_object('refund_id',f.id,'refund_receipt_id',e.id,'payment_id',p.id,'prior_refunded_minor',prior_total,
     'resulting_refunded_minor',next_total,'booking_refunded_minor',booking_refunded));
 return query select a.id,'applied'::text,'VERIFIED'::text,next_total,next_payment,next_booking;
end $$;

-- Retain signature only to fail closed for stale privileged callers.
create or replace function public.confirm_payment_refund(target_refund_id uuid,provider_refund_id_value text,provider_succeeded_at timestamptz)
returns table(confirmed_refund_id uuid,booking_id uuid,refund_status text,payment_status text,booking_payment_status text,
 payment_refunded_total_minor bigint,booking_refunded_total_minor bigint,succeeded_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin raise exception 'Legacy ordinary refund confirmation is retired' using errcode='55000'; end $$;
alter function public.confirm_payment_refund(uuid,text,timestamptz) owner to postgres;
revoke all on function public.confirm_payment_refund(uuid,text,timestamptz) from public,anon,authenticated,service_role;

alter function private.ordinary_refund_identity_matches(public.payment_refunds,private.payment_provider_refund_receipts) owner to postgres;
alter function private.check_refund_application_pair() owner to postgres;
alter function private.protect_payment_refund_success_receipt() owner to postgres;
revoke all on function private.ordinary_refund_identity_matches(public.payment_refunds,private.payment_provider_refund_receipts),
 private.check_refund_application_pair(),private.protect_payment_refund_success_receipt() from public,anon,authenticated,service_role;
alter function public.apply_ordinary_refund_success(uuid,uuid) owner to postgres;
revoke all on function public.apply_ordinary_refund_success(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.apply_ordinary_refund_success(uuid,uuid) to service_role;
-- Future provider binding must use a narrow execution RPC, not arbitrary DML.
revoke insert,update,delete,truncate,references,trigger on public.payment_refunds from public,anon,authenticated,service_role;
comment on function public.apply_ordinary_refund_success(uuid,uuid) is
 'Applies previously bound ordinary intent against canonical verified evidence. No provider execution; local application time is not Stripe Refund.created.';

alter function private.check_ordinary_refund_totals(uuid) owner to postgres;
alter function private.check_ordinary_payment_refund_totals() owner to postgres;
revoke all on function private.check_ordinary_refund_totals(uuid),private.check_ordinary_payment_refund_totals() from public,anon,authenticated,service_role;

alter function private.ordinary_booking_settlement_gross(uuid) owner to postgres;
alter function private.check_ordinary_booking_refund_totals(uuid) owner to postgres;
alter function private.check_booking_refund_final_state() owner to postgres;
alter function private.check_ordinary_application_snapshot() owner to postgres;
revoke all on function private.ordinary_booking_settlement_gross(uuid),private.check_ordinary_booking_refund_totals(uuid),
 private.check_booking_refund_final_state(),private.check_ordinary_application_snapshot() from public,anon,authenticated,service_role;
