-- B3B1: leased compensation work only; no provider calls or refund completion.
-- Integration stays disabled until separately approved. Safe presentation is 7D.
alter table private.payment_refund_obligations
 drop constraint payment_refund_obligations_last_error_code_check;
alter table private.payment_refund_obligations
 add constraint payment_refund_obligations_last_error_code_check check(last_error_code in (
 'PROVIDER_UNAVAILABLE','NETWORK_ERROR','RATE_LIMITED','DATABASE_RETRY','REFUND_STATUS_RETRY',
 'PROVIDER_REJECTED','CONFLICTING_EVIDENCE','MANUAL_REVIEW_REQUIRED',
 'UNSUPPORTED_PROVIDER_CONTEXT','ATTEMPTS_EXHAUSTED'));

create index payment_refund_obligations_due_idx on private.payment_refund_obligations
 (provider,integration_environment,provider_account_scope,next_attempt_at,created_at,id)
 where state in ('pending','failed','processing');

create unique index payment_refund_obligations_provider_refund_uidx on private.payment_refund_obligations
 (provider,integration_environment,provider_account_scope,provider_refund_id)
 where provider_refund_id is not null;

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

create function private.lock_payment_refund_claim(target_obligation_id uuid,target_claim_token uuid)
returns private.payment_refund_obligations
language plpgsql security definer set search_path='' as $function$
declare o private.payment_refund_obligations%rowtype;
begin
 select * into o from private.payment_refund_obligations x where x.id=target_obligation_id for update;
 if o.id is null or target_claim_token is null or o.state<>'processing'
   or o.claim_token is distinct from target_claim_token
   or o.lease_expires_at is null or o.lease_expires_at<=clock_timestamp() then
   raise exception 'Refund claim unavailable' using errcode='55000';
 end if;
 return o;
end;
$function$;
alter function private.lock_payment_refund_claim(uuid,uuid) owner to postgres;
revoke all on function private.lock_payment_refund_claim(uuid,uuid) from public,anon,authenticated,service_role;

create function public.claim_payment_refund_obligations(batch_limit integer default 20)
returns table(obligation_id uuid,claim_token uuid,lease_expires_at timestamptz,attempt_count integer)
language plpgsql security definer set search_path='' as $function$
declare
 cfg private.payment_integration_settings%rowtype;
 o private.payment_refund_obligations%rowtype;
 reference_now timestamptz;
begin
 if batch_limit is null or batch_limit not between 1 and 100 then
   raise exception 'Batch limit must be between 1 and 100' using errcode='22023';
 end if;
 -- Settings before obligation locks, shared with the context RPC. Other worker
 -- operations only lock obligations, so none reverse this ordering.
 select * into cfg from private.payment_integration_settings where singleton for share;
 if cfg.enabled is distinct from true or cfg.provider_account_scope is null then return; end if;
 reference_now:=clock_timestamp();
 for o in select x.* from private.payment_refund_obligations x
   where x.provider=cfg.provider and x.integration_environment=cfg.integration_environment
     and x.provider_account_scope=cfg.provider_account_scope
     and x.state in ('pending','failed','processing')
     and x.next_attempt_at<=reference_now
     and (x.state<>'processing' or x.lease_expires_at<=reference_now)
   order by x.next_attempt_at,x.created_at,x.id limit batch_limit for update skip locked
 loop
   if o.attempt_count>=20 then
     update private.payment_refund_obligations x set state='manual_review',claim_token=null,
       lease_expires_at=null,next_attempt_at=null,last_error_code='ATTEMPTS_EXHAUSTED' where x.id=o.id;
     continue;
   end if;
   reference_now:=clock_timestamp();
   return query update private.payment_refund_obligations x set state='processing',
     claim_token=gen_random_uuid(),lease_expires_at=reference_now+interval '120 seconds',
     next_attempt_at=reference_now+interval '120 seconds',attempt_count=x.attempt_count+1,last_error_code=null
     where x.id=o.id returning x.id,x.claim_token,x.lease_expires_at,x.attempt_count;
 end loop;
end;
$function$;

create function public.get_payment_refund_execution_context(obligation_id uuid,claim_token uuid)
returns table(refund_obligation_id uuid,provider text,integration_environment text,provider_account_scope text,
 provider_payment_id text,provider_charge_id text,amount_minor bigint,currency_code text,
 provider_idempotency_key text,provider_refund_id text,action text,lease_expires_at timestamptz,
 reverse_transfer boolean,refund_application_fee boolean)
language plpgsql security definer set search_path='' as $function$
declare cfg private.payment_integration_settings%rowtype; o private.payment_refund_obligations%rowtype;
begin
 select * into cfg from private.payment_integration_settings where singleton for share;
 o:=private.lock_payment_refund_claim(obligation_id,claim_token);
 if cfg.enabled is distinct from true or cfg.provider_account_scope is null
   or row(o.provider,o.integration_environment,o.provider_account_scope)
     is distinct from row(cfg.provider,cfg.integration_environment,cfg.provider_account_scope) then
   raise exception 'Refund execution unavailable' using errcode='55000';
 end if;
 return query select o.id,o.provider,o.integration_environment,o.provider_account_scope,
   o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code,o.provider_idempotency_key,
   o.provider_refund_id,case when o.provider_refund_id is null then 'create' else 'retrieve' end,
   o.lease_expires_at,true,true;
end;
$function$;
comment on function public.get_payment_refund_execution_context(uuid,uuid) is
 'Trusted adapter only: refund the platform provider_charge_id for the full immutable amount, reverse the destination transfer and VV application fee, using the stable obligation idempotency key. VV absorbs unrecovered Stripe processing fees. Validate nullable generated outputs at runtime. No provider call occurs in PostgreSQL.';

create function public.attach_payment_refund_provider(obligation_id uuid,claim_token uuid,provider_refund_id text)
returns table(obligation_state text,next_attempt_at timestamptz)
language plpgsql security definer set search_path='' as $function$
declare o private.payment_refund_obligations%rowtype;
begin
 if provider_refund_id is null or provider_refund_id !~ '^re_[A-Za-z0-9]+$' then
   raise exception 'Invalid provider refund identifier' using errcode='22023';
 end if;
 o:=private.lock_payment_refund_claim(obligation_id,claim_token);
 if o.provider_refund_id is not null and o.provider_refund_id<>provider_refund_id then
   raise exception 'Provider refund already assigned' using errcode='23514';
 end if;
 -- Retain a known external object even if settings changed during the external
 -- call. This only records identity; future execution still needs activation.
 -- Replay uses a new active claim; a consumed/stale token never gains a bypass.
 return query update private.payment_refund_obligations x set provider_refund_id=attach_payment_refund_provider.provider_refund_id,
   state='pending',claim_token=null,lease_expires_at=null,next_attempt_at=clock_timestamp()+interval '5 minutes',
   last_error_code=null where x.id=o.id returning x.state,x.next_attempt_at;
end;
$function$;

create function public.fail_payment_refund_obligation(obligation_id uuid,claim_token uuid,error_code text)
returns table(obligation_state text,next_attempt_at timestamptz)
language plpgsql security definer set search_path='' as $function$
declare o private.payment_refund_obligations%rowtype; retry_at timestamptz;
begin
 if error_code is null or error_code not in
   ('PROVIDER_UNAVAILABLE','NETWORK_ERROR','RATE_LIMITED','DATABASE_RETRY','REFUND_STATUS_RETRY') then
   raise exception 'Invalid safe error code' using errcode='22023';
 end if;
 o:=private.lock_payment_refund_claim(obligation_id,claim_token);
 if o.attempt_count<20 then
   retry_at:=clock_timestamp()+make_interval(secs=>least(3600,30*(2^(o.attempt_count-1)))::double precision);
 end if;
 return query update private.payment_refund_obligations x set
   state=case when o.attempt_count=20 then 'manual_review' else 'failed' end,
   claim_token=null,lease_expires_at=null,next_attempt_at=retry_at,
   last_error_code=case when o.attempt_count=20 then 'ATTEMPTS_EXHAUSTED' else error_code end
   where x.id=o.id returning x.state,x.next_attempt_at;
end;
$function$;

create function public.review_payment_refund_obligation(obligation_id uuid,claim_token uuid,reason_code text)
returns text language plpgsql security definer set search_path='' as $function$
declare o private.payment_refund_obligations%rowtype;
begin
 if reason_code is null or reason_code not in
   ('PROVIDER_REJECTED','CONFLICTING_EVIDENCE','MANUAL_REVIEW_REQUIRED','UNSUPPORTED_PROVIDER_CONTEXT') then
   raise exception 'Invalid safe review code' using errcode='22023';
 end if;
 o:=private.lock_payment_refund_claim(obligation_id,claim_token);
 update private.payment_refund_obligations x set state='manual_review',claim_token=null,
   lease_expires_at=null,next_attempt_at=null,last_error_code=review_payment_refund_obligation.reason_code where x.id=o.id;
 return 'manual_review';
end;
$function$;

alter function public.claim_payment_refund_obligations(integer) owner to postgres;
alter function public.get_payment_refund_execution_context(uuid,uuid) owner to postgres;
alter function public.attach_payment_refund_provider(uuid,uuid,text) owner to postgres;
alter function public.fail_payment_refund_obligation(uuid,uuid,text) owner to postgres;
alter function public.review_payment_refund_obligation(uuid,uuid,text) owner to postgres;
revoke all on function public.claim_payment_refund_obligations(integer),
 public.get_payment_refund_execution_context(uuid,uuid),public.attach_payment_refund_provider(uuid,uuid,text),
 public.fail_payment_refund_obligation(uuid,uuid,text),public.review_payment_refund_obligation(uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.claim_payment_refund_obligations(integer),
 public.get_payment_refund_execution_context(uuid,uuid),public.attach_payment_refund_provider(uuid,uuid,text),
 public.fail_payment_refund_obligation(uuid,uuid,text),public.review_payment_refund_obligation(uuid,uuid,text)
 to service_role;
