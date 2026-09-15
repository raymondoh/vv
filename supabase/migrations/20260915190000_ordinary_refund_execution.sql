-- B4C1: durable ordinary execution only. No activation, provider HTTP or scheduler.
create table private.ordinary_refund_executions (
 refund_id uuid primary key references public.payment_refunds(id) on delete restrict,
 collection_receipt_id uuid not null references private.payment_provider_receipts(id) on delete restrict,
 provider text not null check(provider='stripe'),
 integration_environment text not null check(integration_environment in ('test','live')),
 provider_account_scope text not null check(provider_account_scope ~ '^acct_[A-Za-z0-9]+$'),
 provider_payment_id text not null check(provider_payment_id ~ '^pi_[A-Za-z0-9]+$'),
 provider_charge_id text not null check(provider_charge_id ~ '^ch_[A-Za-z0-9]+$'),
 amount_minor bigint not null check(amount_minor between 1 and 9007199254740991),
 currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
 contract_version text not null default 'v1' check(contract_version='v1'),
 api_version text not null default '2025-02-24.acacia' check(api_version='2025-02-24.acacia'),
 reverse_transfer boolean not null default true check(reverse_transfer),
 refund_application_fee boolean not null default true check(refund_application_fee),
 provider_idempotency_key text not null unique,
 first_dispatch_authorized_at timestamptz not null,
 recovery_deadline timestamptz not null,
 state text not null check(state in ('ready','processing','manual_review','completed')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 20),
 next_attempt_at timestamptz,
 claim_token uuid,
 claimed_at timestamptz,
 lease_expires_at timestamptz,
 last_error_code text check(last_error_code in ('PROVIDER_RETRY','DATABASE_RETRY','VERIFICATION_RETRY',
 'PROVIDER_REJECTED','IDENTITY_CONFLICT','CONTEXT_UNAVAILABLE','ATTEMPTS_EXHAUSTED','RECOVERY_EXHAUSTED')),
 provider_bound_at timestamptz,
 completed_at timestamptz,
 check(provider_idempotency_key='vv:'||integration_environment||':ordinary-refund:'||refund_id::text||':v1'
   and length(provider_idempotency_key)<=255),
 check(isfinite(first_dispatch_authorized_at) and recovery_deadline=first_dispatch_authorized_at+interval '23 hours'),
 check((state='processing' and claim_token is not null and claimed_at is not null and lease_expires_at=claimed_at+interval '120 seconds'
         and next_attempt_at=lease_expires_at and completed_at is null)
   or (state='ready' and claim_token is null and claimed_at is null and lease_expires_at is null and next_attempt_at is not null and completed_at is null)
   or (state='manual_review' and claim_token is null and claimed_at is null and lease_expires_at is null and next_attempt_at is null and completed_at is null)
   or (state='completed' and claim_token is null and claimed_at is null and lease_expires_at is null and next_attempt_at is null and completed_at is not null)),
 check(next_attempt_at is null or isfinite(next_attempt_at)),
 check(provider_bound_at is null or (isfinite(provider_bound_at) and provider_bound_at>=first_dispatch_authorized_at)),
 check(completed_at is null or (isfinite(completed_at) and provider_bound_at is not null and completed_at>=provider_bound_at))
);
alter table private.ordinary_refund_executions owner to postgres;
revoke all on private.ordinary_refund_executions from public,anon,authenticated,service_role;
create index ordinary_refund_executions_due_idx on private.ordinary_refund_executions(next_attempt_at,refund_id)
 where state in ('ready','processing');

-- Discover financial parents without a child lock, then use the B4A order.
create function private.lock_ordinary_refund(target uuid)
returns public.payment_refunds language plpgsql security definer set search_path='' as $$
declare f public.payment_refunds%rowtype; bid uuid; pid uuid;
begin
 select booking_id,booking_payment_id into bid,pid from public.payment_refunds where id=target;
 if bid is null then raise exception 'Ordinary execution unavailable' using errcode='55000'; end if;
 perform id from public.bookings where id=bid for update;
 perform id from public.booking_payments where id=pid for update;
 perform id from private.payment_refund_obligations where payment_id=pid order by id for update;
 select * into f from public.payment_refunds where id=target for update;
 if f.booking_id is distinct from bid or f.booking_payment_id is distinct from pid then
  raise exception 'Ordinary execution unavailable' using errcode='55000'; end if;
 return f;
end $$;

create function private.ordinary_execution_identity(x private.ordinary_refund_executions,f public.payment_refunds)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.booking_payments p join private.payment_provider_receipts c
 on c.id=x.collection_receipt_id
 where p.id=f.booking_payment_id and p.booking_id=f.booking_id and c.disposition='fulfilled'
 and c.payment_id=p.id and c.booking_id=p.booking_id
 and row(c.provider,c.integration_environment,c.provider_payment_id,c.provider_charge_id,c.amount_minor,
 c.currency_code,c.provider_succeeded_at,c.destination_account_id)
 is not distinct from row(p.provider,p.integration_environment,p.provider_payment_id,p.provider_charge_id,p.amount_minor,
 p.currency_code,p.provider_success_at,p.provider_destination_account_id)
 and row(x.refund_id,x.provider,x.integration_environment,x.provider_account_scope,x.provider_payment_id,x.provider_charge_id,x.amount_minor,x.currency_code)
 is not distinct from row(f.id,c.provider,c.integration_environment,c.provider_account_scope,c.provider_payment_id,c.provider_charge_id,f.amount_minor,f.currency_code)
 and f.provider=c.provider);
$$;

create function private.protect_ordinary_execution()
returns trigger language plpgsql security definer set search_path='' as $$
declare f public.payment_refunds%rowtype; t timestamptz:=clock_timestamp();
begin
 if tg_op='DELETE' then raise exception 'Execution identity is immutable' using errcode='55000'; end if;
 select * into f from public.payment_refunds where id=new.refund_id;
 if not private.ordinary_execution_identity(new,f) then raise exception 'Execution identity mismatch' using errcode='23514'; end if;
 if tg_op='INSERT' then
  if new.state<>'ready' or new.attempt_count<>0 or new.provider_bound_at is not null or f.refund_status not in ('pending','processing')
    or new.first_dispatch_authorized_at>t then raise exception 'Invalid initial execution' using errcode='23514'; end if;
  return new;
 end if;
 if (to_jsonb(new)-array['state','attempt_count','next_attempt_at','claim_token','claimed_at','lease_expires_at','last_error_code','provider_bound_at','completed_at'])
 is distinct from (to_jsonb(old)-array['state','attempt_count','next_attempt_at','claim_token','claimed_at','lease_expires_at','last_error_code','provider_bound_at','completed_at'])
 or (old.provider_bound_at is not null and new.provider_bound_at is distinct from old.provider_bound_at) then
  raise exception 'Execution identity is immutable' using errcode='55000'; end if;
 if new.state='completed' then
  if f.refund_status<>'succeeded' or not exists(select 1 from private.payment_refund_applications a
    where a.ordinary_refund_id=f.id and a.application_kind='ordinary' and a.applied_at=new.completed_at)
    or new.attempt_count<>old.attempt_count then raise exception 'Canonical application required' using errcode='55000'; end if;
 elsif old.state in ('completed','manual_review') then
  raise exception 'Execution is terminal' using errcode='55000';
 elsif new.state='processing' then
  if old.next_attempt_at>t or (old.state='processing' and old.lease_expires_at>t)
   or old.attempt_count>=20 or new.attempt_count<>old.attempt_count+1
   or new.claim_token is not distinct from old.claim_token or new.claimed_at>t
   or new.lease_expires_at<=t or new.last_error_code is not null
   or new.provider_bound_at is distinct from old.provider_bound_at then
    raise exception 'Invalid execution claim' using errcode='55000'; end if;
 elsif new.state='manual_review' and (old.attempt_count=20 or (f.provider_refund_id is null and old.recovery_deadline<=t))
  and old.next_attempt_at<=t then
  if new.attempt_count<>old.attempt_count or new.provider_bound_at is distinct from old.provider_bound_at
    or new.last_error_code not in ('ATTEMPTS_EXHAUSTED','RECOVERY_EXHAUSTED') then
   raise exception 'Invalid execution exhaustion' using errcode='55000'; end if;
 elsif old.state='processing' and old.lease_expires_at>t then
  if new.attempt_count<>old.attempt_count then raise exception 'Invalid execution result' using errcode='55000'; end if;
  if new.state='ready' then
   if new.next_attempt_at<t or new.next_attempt_at>t+interval '1 hour'
    or (new.last_error_code is null and f.provider_refund_id is null)
    or (new.last_error_code is not null and new.last_error_code not in ('PROVIDER_RETRY','DATABASE_RETRY','VERIFICATION_RETRY')) then
    raise exception 'Invalid execution retry' using errcode='55000'; end if;
  elsif new.state<>'manual_review' or new.last_error_code is null then
   raise exception 'Invalid execution result' using errcode='55000'; end if;
 else raise exception 'Execution claim unavailable' using errcode='55000';
 end if;
 if new.provider_bound_at is not null and f.provider_refund_id is null then
  raise exception 'Provider binding required' using errcode='55000'; end if;
 return new;
end $$;
create trigger protect_ordinary_execution before insert or update or delete on private.ordinary_refund_executions
 for each row execute function private.protect_ordinary_execution();

-- Any execution snapshot means dispatch may have occurred. Never release its
-- reservation without a separately designed terminal-evidence policy.
create function private.guard_ordinary_execution_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.ordinary_refund_executions where refund_id=old.id)
 and (tg_op='DELETE' or new.refund_status in ('failed','cancelled')) then
  raise exception 'Unresolved execution retains reservation' using errcode='55000'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger guard_ordinary_execution_request before update or delete on public.payment_refunds
 for each row execute function private.guard_ordinary_execution_request();

create function private.complete_ordinary_execution()
returns trigger language plpgsql security definer set search_path='' as $$
declare applied_time timestamptz;
begin
 if new.refund_status='succeeded' then
  select applied_at into applied_time from private.payment_refund_applications where ordinary_refund_id=new.id;
  if applied_time is not null then
   update private.ordinary_refund_executions set state='completed',completed_at=applied_time,
    provider_bound_at=coalesce(provider_bound_at,applied_time),claim_token=null,claimed_at=null,lease_expires_at=null,
    next_attempt_at=null,last_error_code=null where refund_id=new.id and state<>'completed';
  end if;
 end if;
 return new;
end $$;
create trigger complete_ordinary_execution after update of refund_status on public.payment_refunds
 for each row execute function private.complete_ordinary_execution();

create function public.claim_ordinary_refund_execution(target_refund_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.payment_refunds%rowtype; x private.ordinary_refund_executions%rowtype;
 p public.booking_payments%rowtype; c private.payment_provider_receipts%rowtype;
 cfg private.payment_integration_settings%rowtype; t timestamptz; n integer; reserved numeric; action text;
begin
 f:=private.lock_ordinary_refund(target_refund_id);
 select * into x from private.ordinary_refund_executions where refund_id=f.id for update;
 if f.refund_status='succeeded' then return jsonb_build_object('action','completed'); end if;
 if f.refund_status not in ('pending','processing') then return jsonb_build_object('action','manual_review'); end if;
 t:=clock_timestamp();
 if x.state in ('manual_review','completed') then return jsonb_build_object('action',x.state); end if;
 if x.state='processing' and x.lease_expires_at>t then return jsonb_build_object('action','already_claimed'); end if;
 if x.next_attempt_at>t then return jsonb_build_object('action','not_due'); end if;
 if x.attempt_count>=20 or (f.provider_refund_id is null and x.recovery_deadline<=t) then
  update private.ordinary_refund_executions set state='manual_review',claim_token=null,claimed_at=null,lease_expires_at=null,
   next_attempt_at=null,last_error_code=case when x.attempt_count>=20 then 'ATTEMPTS_EXHAUSTED' else 'RECOVERY_EXHAUSTED' end where refund_id=f.id;
  return jsonb_build_object('action','manual_review');
 end if;
 select * into p from public.booking_payments where id=f.booking_payment_id;
 if (select booking_status from public.bookings where id=f.booking_id) not in ('cancelled','completed')
 or p.payment_status not in ('succeeded','partially_refunded') or private.compensation_reserves_payment(p.id) then
  return jsonb_build_object('action','manual_review'); end if;
 select coalesce(sum(amount_minor::numeric),0) into reserved from public.payment_refunds
 where booking_payment_id=p.id and refund_status in ('pending','processing','succeeded');
 if reserved>p.amount_minor then return jsonb_build_object('action','manual_review'); end if;
 select count(*) into n from private.payment_provider_receipts r where r.payment_id=p.id and r.booking_id=p.booking_id
 and r.disposition='fulfilled' and row(r.provider,r.integration_environment,r.provider_payment_id,r.provider_charge_id,
 r.amount_minor,r.currency_code,r.provider_succeeded_at,r.destination_account_id) is not distinct from
 row(p.provider,p.integration_environment,p.provider_payment_id,p.provider_charge_id,p.amount_minor,p.currency_code,p.provider_success_at,p.provider_destination_account_id);
 if n<>1 then return jsonb_build_object('action','manual_review'); end if;
 select * into c from private.payment_provider_receipts r where r.payment_id=p.id and r.booking_id=p.booking_id and r.disposition='fulfilled'
 and row(r.provider,r.integration_environment,r.provider_payment_id,r.provider_charge_id,r.amount_minor,r.currency_code,r.provider_succeeded_at,r.destination_account_id)
 is not distinct from row(p.provider,p.integration_environment,p.provider_payment_id,p.provider_charge_id,p.amount_minor,p.currency_code,p.provider_success_at,p.provider_destination_account_id);
 if c.provider_account_scope is null or f.provider<>c.provider or f.currency_code<>c.currency_code then
  return jsonb_build_object('action','manual_review'); end if;
 action:=case when f.provider_refund_id is null then 'create' else 'retrieve' end;
 if action='create' then
  -- Financial parents precede configuration locks, as in deposit preparation.
  select * into cfg from private.payment_integration_settings where singleton for share;
  if cfg.enabled is distinct from true or row(cfg.provider,cfg.integration_environment,cfg.provider_account_scope)
   is distinct from row(c.provider,c.integration_environment,c.provider_account_scope) then
   return jsonb_build_object('action','disabled'); end if;
 end if;
 t:=clock_timestamp();
 if x.refund_id is null then
  insert into private.ordinary_refund_executions(refund_id,collection_receipt_id,provider,integration_environment,provider_account_scope,
   provider_payment_id,provider_charge_id,amount_minor,currency_code,provider_idempotency_key,first_dispatch_authorized_at,recovery_deadline,state,next_attempt_at)
  values(f.id,c.id,c.provider,c.integration_environment,c.provider_account_scope,c.provider_payment_id,c.provider_charge_id,f.amount_minor,f.currency_code,
   'vv:'||c.integration_environment||':ordinary-refund:'||f.id::text||':v1',t,t+interval '23 hours','ready',t)
  returning * into x;
 elsif not private.ordinary_execution_identity(x,f) then return jsonb_build_object('action','manual_review'); end if;
 update public.payment_refunds set refund_status='processing' where id=f.id;
 update private.ordinary_refund_executions set state='processing',attempt_count=attempt_count+1,
  claim_token=gen_random_uuid(),claimed_at=t,lease_expires_at=t+interval '120 seconds',next_attempt_at=t+interval '120 seconds',last_error_code=null
 where refund_id=f.id returning * into x;
 return jsonb_build_object('action',action,'refund_id',f.id,'claim_token',x.claim_token,'lease_expires_at',x.lease_expires_at,
 'attempt_count',x.attempt_count,'provider',x.provider,'environment',x.integration_environment,'account_scope',x.provider_account_scope,
 'payment_intent_id',x.provider_payment_id,'charge_id',x.provider_charge_id,'amount_minor',x.amount_minor,'currency',x.currency_code,
 'idempotency_key',x.provider_idempotency_key,'first_dispatch_authorized_at',x.first_dispatch_authorized_at,'recovery_deadline',x.recovery_deadline,
 'reverse_transfer',x.reverse_transfer,'refund_application_fee',x.refund_application_fee,'contract_version',x.contract_version,'api_version',x.api_version,
 'provider_refund_id',f.provider_refund_id);
end $$;

create function private.active_ordinary_execution(target uuid,token uuid)
returns private.ordinary_refund_executions language plpgsql security definer set search_path='' as $$
declare f public.payment_refunds%rowtype; x private.ordinary_refund_executions%rowtype;
begin
 f:=private.lock_ordinary_refund(target);
 select * into x from private.ordinary_refund_executions where refund_id=target for update;
 if x.refund_id is null or token is null or x.state<>'processing' or x.claim_token is distinct from token
 or x.lease_expires_at<=clock_timestamp() or f.refund_status<>'processing' or not private.ordinary_execution_identity(x,f) then
  raise exception 'Execution claim unavailable' using errcode='55000'; end if;
 return x;
end $$;

create function public.check_ordinary_refund_dispatch(target_refund_id uuid,claim_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare x private.ordinary_refund_executions%rowtype; cfg private.payment_integration_settings%rowtype; reference_now timestamptz;
begin
 x:=private.active_ordinary_execution(target_refund_id,claim_token);
 select * into cfg from private.payment_integration_settings where singleton for share;
 -- The settings lock may have waited past lease expiry. Financial/execution
 -- locks are still ours; reread state and use database time AFTER that wait.
 select * into x from private.ordinary_refund_executions where refund_id=target_refund_id;
 reference_now:=clock_timestamp();
 return coalesce(x.state='processing' and x.claim_token=claim_token
 and x.lease_expires_at>reference_now and x.recovery_deadline>reference_now
 and x.attempt_count between 1 and 20 and cfg.enabled is true
 and row(cfg.provider,cfg.integration_environment,cfg.provider_account_scope)
 is not distinct from row(x.provider,x.integration_environment,x.provider_account_scope)
 and (select refund_status='processing' and provider_refund_id is null from public.payment_refunds where id=target_refund_id),false);
end $$;

create function public.attach_ordinary_refund_provider(target_refund_id uuid,claim_token uuid,provider_refund_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x private.ordinary_refund_executions%rowtype; f public.payment_refunds%rowtype;
begin
 if provider_refund_id is null or provider_refund_id !~ '^re_[A-Za-z0-9]+$' or length(provider_refund_id)>255 then
  raise exception 'Invalid provider binding' using errcode='22023'; end if;
 x:=private.active_ordinary_execution(target_refund_id,claim_token);
 select * into f from public.payment_refunds where id=target_refund_id;
 if (f.provider_refund_id is not null and f.provider_refund_id<>attach_ordinary_refund_provider.provider_refund_id)
 or exists(select 1 from private.payment_refund_obligations o where
 row(o.provider,o.integration_environment,o.provider_account_scope,o.provider_refund_id)
 is not distinct from row(x.provider,x.integration_environment,x.provider_account_scope,attach_ordinary_refund_provider.provider_refund_id)) then
  raise exception 'Provider binding conflict' using errcode='23514'; end if;
 update public.payment_refunds set provider_refund_id=attach_ordinary_refund_provider.provider_refund_id where id=target_refund_id;
 update private.ordinary_refund_executions set state='ready',provider_bound_at=coalesce(provider_bound_at,clock_timestamp()),
 claim_token=null,claimed_at=null,lease_expires_at=null,next_attempt_at=clock_timestamp()+interval '1 second',last_error_code=null where refund_id=target_refund_id;
 return jsonb_build_object('outcome','bound','provider_refund_id',provider_refund_id);
end $$;

create function public.report_ordinary_refund_execution(target_refund_id uuid,claim_token uuid,error_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x private.ordinary_refund_executions%rowtype; t timestamptz; review boolean;
begin
 if error_code is null or error_code not in ('PROVIDER_RETRY','DATABASE_RETRY','VERIFICATION_RETRY','PROVIDER_REJECTED','IDENTITY_CONFLICT','CONTEXT_UNAVAILABLE') then
  raise exception 'Invalid execution outcome' using errcode='22023'; end if;
 x:=private.active_ordinary_execution(target_refund_id,claim_token);
 t:=clock_timestamp();
 review:=error_code in ('PROVIDER_REJECTED','IDENTITY_CONFLICT','CONTEXT_UNAVAILABLE') or x.attempt_count>=20
  or (x.recovery_deadline<=t and (select provider_refund_id is null from public.payment_refunds where id=target_refund_id));
 update private.ordinary_refund_executions set state=case when review then 'manual_review' else 'ready' end,
 claim_token=null,claimed_at=null,lease_expires_at=null,
 next_attempt_at=case when review then null else t+make_interval(secs=>least(3600,30*(2^(x.attempt_count-1)))::double precision) end,
 last_error_code=case when x.attempt_count>=20 then 'ATTEMPTS_EXHAUSTED' when review and error_code in ('PROVIDER_RETRY','DATABASE_RETRY','VERIFICATION_RETRY') then 'RECOVERY_EXHAUSTED' else error_code end
 where refund_id=target_refund_id;
 return jsonb_build_object('outcome',case when review then 'manual_review' else 'retry' end);
end $$;

alter function private.lock_ordinary_refund(uuid) owner to postgres;
alter function private.ordinary_execution_identity(private.ordinary_refund_executions,public.payment_refunds) owner to postgres;
alter function private.protect_ordinary_execution() owner to postgres;
alter function private.guard_ordinary_execution_request() owner to postgres;
alter function private.complete_ordinary_execution() owner to postgres;
alter function private.active_ordinary_execution(uuid,uuid) owner to postgres;
revoke all on function private.lock_ordinary_refund(uuid),private.ordinary_execution_identity(private.ordinary_refund_executions,public.payment_refunds),
 private.protect_ordinary_execution(),private.guard_ordinary_execution_request(),private.complete_ordinary_execution(),private.active_ordinary_execution(uuid,uuid)
 from public,anon,authenticated,service_role;
alter function public.claim_ordinary_refund_execution(uuid) owner to postgres;
alter function public.check_ordinary_refund_dispatch(uuid,uuid) owner to postgres;
alter function public.attach_ordinary_refund_provider(uuid,uuid,text) owner to postgres;
alter function public.report_ordinary_refund_execution(uuid,uuid,text) owner to postgres;
revoke all on function public.claim_ordinary_refund_execution(uuid),public.check_ordinary_refund_dispatch(uuid,uuid),
 public.attach_ordinary_refund_provider(uuid,uuid,text),public.report_ordinary_refund_execution(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_ordinary_refund_execution(uuid),public.check_ordinary_refund_dispatch(uuid,uuid),
 public.attach_ordinary_refund_provider(uuid,uuid,text),public.report_ordinary_refund_execution(uuid,uuid,text) to service_role;
