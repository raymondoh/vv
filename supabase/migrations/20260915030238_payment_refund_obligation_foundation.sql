-- 7B2B3A: durable compensation only. No refund execution or activation.
-- Safe customer/operator presentation is deferred to 7D.
-- Historical compensation requires explicit review rather than guessed reasons.
do $$ begin
  if exists(select 1 from private.payment_provider_receipts where disposition='compensation_required') then
    raise exception 'Existing compensation receipts require obligation backfill review' using errcode='23514';
  end if;
end $$;

create table private.payment_refund_obligations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null unique references private.payment_provider_receipts(id) on delete restrict,
  booking_id uuid null references public.bookings(id) on delete restrict,
  payment_id uuid null references public.booking_payments(id) on delete restrict,
  provider text not null check(provider='stripe'),
  integration_environment text not null check(integration_environment in ('test','live')),
  provider_account_scope text not null check(provider_account_scope ~ '^acct_[A-Za-z0-9]+$'),
  provider_payment_id text not null check(provider_payment_id ~ '^pi_[A-Za-z0-9]+$'),
  provider_charge_id text not null check(provider_charge_id ~ '^ch_[A-Za-z0-9]+$'),
  amount_minor bigint not null check(amount_minor>0),
  currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
  reason_code text not null check(reason_code in ('hold_unavailable','payment_after_deadline',
    'duplicate_payment','payment_context_mismatch','inventory_inconsistent')),
  state text not null default 'pending' check(state in ('pending','processing','failed','manual_review','succeeded')),
  provider_idempotency_key text not null unique,
  provider_refund_id text null check(provider_refund_id ~ '^re_[A-Za-z0-9]+$'),
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  next_attempt_at timestamptz null default clock_timestamp(),
  claim_token uuid null,
  lease_expires_at timestamptz null,
  last_error_code text null check(last_error_code in ('PROVIDER_UNAVAILABLE','NETWORK_ERROR','RATE_LIMITED',
    'CONFLICTING_EVIDENCE','MANUAL_REVIEW_REQUIRED','ATTEMPTS_EXHAUSTED')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  succeeded_at timestamptz null,
  check((booking_id is null)=(payment_id is null)),
  check(provider_idempotency_key='vv:'||integration_environment||':compensation:'||id::text||':v1'),
  check((state='processing' and claim_token is not null and lease_expires_at is not null and succeeded_at is null)
    or (state in ('pending','failed') and claim_token is null and lease_expires_at is null and next_attempt_at is not null and succeeded_at is null)
    or (state='manual_review' and claim_token is null and lease_expires_at is null and next_attempt_at is null and succeeded_at is null)
    or (state='succeeded' and claim_token is null and lease_expires_at is null and next_attempt_at is null
      and succeeded_at is not null and provider_refund_id is not null)),
  check(succeeded_at is null or (isfinite(succeeded_at) and succeeded_at>=created_at))
);
alter table private.payment_refund_obligations owner to postgres;
revoke all on private.payment_refund_obligations from public,anon,authenticated,service_role;
create index payment_refund_obligations_payment_idx on private.payment_refund_obligations(payment_id) where payment_id is not null;

-- All obligation states reserve capacity, including failed/manual-review and
-- succeeded. An obligation for another charge on the booking reserves nothing
-- against the original payment. No booking-only association is used.
create function private.compensation_reserves_payment(target_payment uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.payment_refund_obligations o join public.booking_payments p
   on p.id=target_payment and o.payment_id=p.id and o.provider=p.provider
   and o.integration_environment=p.integration_environment
   and o.provider_payment_id=p.provider_payment_id
   and (p.provider_charge_id is null or o.provider_charge_id=p.provider_charge_id));
$$;
alter function private.compensation_reserves_payment(uuid) owner to postgres;
revoke all on function private.compensation_reserves_payment(uuid) from public,anon,authenticated,service_role;

create function private.protect_payment_refund_obligation()
returns trigger language plpgsql security definer set search_path='' as $$
declare r private.payment_provider_receipts%rowtype; p public.booking_payments%rowtype;
begin
 if tg_op='DELETE' then raise exception 'Compensation obligation is immutable' using errcode='55000'; end if;
 if tg_op='UPDATE' then
   if (to_jsonb(new)-array['state','provider_refund_id','attempt_count','next_attempt_at','claim_token',
     'lease_expires_at','last_error_code','updated_at','succeeded_at']) is distinct from
     (to_jsonb(old)-array['state','provider_refund_id','attempt_count','next_attempt_at','claim_token',
     'lease_expires_at','last_error_code','updated_at','succeeded_at'])
     or (old.provider_refund_id is not null and new.provider_refund_id is distinct from old.provider_refund_id)
     or (old.state='succeeded' and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at')) then
     raise exception 'Compensation obligation is immutable' using errcode='55000';
   end if;
   new.updated_at:=clock_timestamp();
   return new;
 end if;
 -- A future executor will supply narrow operational transitions. This stage
 -- exposes none, and every newly created obligation is pending/unattempted.
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
end $$;
alter function private.protect_payment_refund_obligation() owner to postgres;
revoke all on function private.protect_payment_refund_obligation() from public,anon,authenticated,service_role;
create trigger protect_payment_refund_obligation before insert or update or delete on private.payment_refund_obligations
 for each row execute function private.protect_payment_refund_obligation();

create function private.ensure_payment_refund_obligation(target_receipt uuid, safe_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r private.payment_provider_receipts%rowtype; o private.payment_refund_obligations%rowtype; nid uuid:=gen_random_uuid();
begin
 select * into r from private.payment_provider_receipts where id=target_receipt;
 select * into o from private.payment_refund_obligations where receipt_id=target_receipt;
 if o.id is null then
   insert into private.payment_refund_obligations(id,receipt_id,booking_id,payment_id,provider,integration_environment,
     provider_account_scope,provider_payment_id,provider_charge_id,amount_minor,currency_code,reason_code,provider_idempotency_key)
   values(nid,r.id,r.booking_id,r.payment_id,r.provider,r.integration_environment,r.provider_account_scope,
     r.provider_payment_id,r.provider_charge_id,r.amount_minor,r.currency_code,safe_reason,
     'vv:'||r.integration_environment||':compensation:'||nid::text||':v1') returning * into o;
 end if;
 if row(o.booking_id,o.payment_id,o.provider,o.integration_environment,o.provider_account_scope,o.provider_payment_id,
     o.provider_charge_id,o.amount_minor,o.currency_code,o.reason_code)
   is distinct from row(r.booking_id,r.payment_id,r.provider,r.integration_environment,r.provider_account_scope,
     r.provider_payment_id,r.provider_charge_id,r.amount_minor,r.currency_code,safe_reason) then
   raise exception 'Conflicting compensation obligation' using errcode='23514';
 end if;
 return o.id;
end $$;
alter function private.ensure_payment_refund_obligation(uuid,text) owner to postgres;
revoke all on function private.ensure_payment_refund_obligation(uuid,text) from public,anon,authenticated,service_role;

-- Independent enforcement in both directions. Immediate transition guard below
-- checks ordering; deferred checks also reject an obligation left unresolved at
-- commit. There is no trigger recursion and no cancellation/deletion escape.
create function private.check_compensation_obligation_pair()
returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid; disp text; cnt integer;
begin
 if tg_table_name='payment_provider_receipts' then rid:=new.id; else rid:=new.receipt_id; end if;
 select disposition into disp from private.payment_provider_receipts where id=rid;
 select count(*) into cnt from private.payment_refund_obligations where receipt_id=rid;
 if (disp='compensation_required' and cnt<>1) or (disp is distinct from 'compensation_required' and cnt<>0) then
   raise exception 'Compensation receipt requires exactly one obligation' using errcode='23514';
 end if;
 return null;
end $$;
alter function private.check_compensation_obligation_pair() owner to postgres;
revoke all on function private.check_compensation_obligation_pair() from public,anon,authenticated,service_role;
create constraint trigger compensation_receipt_pair after insert or update on private.payment_provider_receipts
 deferrable initially deferred for each row execute function private.check_compensation_obligation_pair();
create constraint trigger compensation_obligation_pair after insert or update on private.payment_refund_obligations
 deferrable initially deferred for each row execute function private.check_compensation_obligation_pair();

create or replace function private.protect_payment_provider_receipt()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    if new.disposition <> 'unresolved' then
      raise exception 'Receipt must remain unresolved' using errcode = '23514';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Provider receipt is immutable' using errcode = '55000';
  end if;
  if (to_jsonb(new) - 'disposition') is distinct from (to_jsonb(old) - 'disposition')
    or old.disposition <> 'unresolved'
    or new.disposition not in ('fulfilled', 'compensation_required', 'manual_review') then
    raise exception 'Invalid receipt disposition transition' using errcode = '55000';
  end if;
  if new.disposition='compensation_required' and not exists (
    select 1 from private.payment_refund_obligations o where o.receipt_id=new.id
      and row(o.booking_id,o.payment_id,o.provider,o.integration_environment,o.provider_account_scope,
        o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code)
      is not distinct from row(new.booking_id,new.payment_id,new.provider,new.integration_environment,new.provider_account_scope,
        new.provider_payment_id,new.provider_charge_id,new.amount_minor,new.currency_code)) then
    raise exception 'Compensation receipt requires matching obligation' using errcode='23514';
  end if;
  if new.disposition<>'compensation_required' and exists(
    select 1 from private.payment_refund_obligations o where o.receipt_id=new.id) then
    raise exception 'Receipt has a compensation obligation' using errcode='23514';
  end if;
  return new;
end;
$function$;
alter function private.protect_payment_provider_receipt() owner to postgres;
revoke all on function private.protect_payment_provider_receipt() from public, anon, authenticated, service_role;


create or replace function public.reconcile_deposit_payment_success(event_id bigint, claim_token uuid)
returns table (receipt_id uuid, payment_id uuid, booking_id uuid, outcome text,
  booking_status text, booking_payment_status text)
language plpgsql security definer set search_path = '' as $function$
declare
  e private.payment_provider_events%rowtype;
  r private.payment_provider_receipts%rowtype;
  b public.bookings%rowtype;
  p public.booking_payments%rowtype;
  d public.booking_payment_schedule%rowtype;
  t private.booking_payment_terms%rowtype;
  cfg private.payment_integration_settings%rowtype;
  accepted_at timestamptz;
  valid_binding boolean := false;
  intact boolean := false;
  chosen text;
  old_sub text;
  old_claims text;
  compensation_reason text;
begin
  -- Discover immutable correlation without queue/receipt locks. Queue claiming
  -- MUST be committed before calling this RPC in a separate transaction.
  select * into e from private.payment_provider_events x where x.id = event_id;
  select * into r from private.payment_provider_receipts x where x.id = e.receipt_id;
  if r.id is null then
    raise exception 'Receipt claim unavailable' using errcode = '55000';
  end if;
  if r.booking_id is not null and r.payment_id is not null then
    select * into b from public.bookings x where x.id = r.booking_id for update;
    select * into p from public.booking_payments x where x.id = r.payment_id for update;
    select * into d from public.booking_payment_schedule x where x.id = p.payment_schedule_id for update;
    perform x.id from public.booking_items x where x.booking_id = b.id order by x.id for share;
    perform x.id from public.booking_space_allocations x where x.booking_id = b.id order by x.id for update;
    select * into t from private.booking_payment_terms x where x.booking_id = b.id;
  end if;
  -- Settings cannot be changed beneath the fulfillment decision.
  select * into cfg from private.payment_integration_settings where singleton for share;
  -- Match B1 receipt recording: event before receipt, both AFTER lifecycle
  -- locks. This avoids reversing their order for duplicate in-flight workers.
  e := private.lock_payment_provider_event_claim(event_id, claim_token);
  select * into r from private.payment_provider_receipts x where x.id = r.id for update;
  accepted_at := clock_timestamp();
  if e.receipt_id is distinct from r.id then
    raise exception 'Receipt claim unavailable' using errcode = '55000';
  end if;
  if r.disposition <> 'unresolved' then
    -- A separately delivered event for the same charge consumes its own valid
    -- claim but cannot change the terminal receipt or repeat lifecycle work.
    update private.payment_provider_events x set processing_status='processed',
      processed_at=accepted_at, claim_token=null, lease_expires_at=null, next_attempt_at=null
      where x.id=e.id;
    return query select r.id,r.payment_id,r.booking_id,'already_reconciled'::text,b.booking_status,b.payment_status;
    return;
  end if;

  -- Unknown account/environment cannot be assumed refundable by our adapter.
  -- Disabled integration quarantines evidence; it never authorizes fulfillment.
  if cfg.enabled is distinct from true or cfg.provider_account_scope is null
    or r.provider <> 'stripe' or r.provider is distinct from cfg.provider
    or r.integration_environment is distinct from cfg.integration_environment
    or r.provider_account_scope is distinct from cfg.provider_account_scope
    or row(e.provider,e.integration_environment,e.provider_account_scope)
      is distinct from row(r.provider,r.integration_environment,r.provider_account_scope)
    or r.provider_succeeded_at <> date_trunc('second',r.provider_succeeded_at)
    or r.provider_succeeded_at > date_trunc('second',accepted_at)
    or r.provider_charge_id !~ '^ch_[A-Za-z0-9]+$'
    or r.provider_payment_id !~ '^pi_[A-Za-z0-9]+$' then
    chosen := 'manual_review';
  else
    -- A known-account charge is sufficiently identified for future compensation
    -- even when its optional VV correlation is absent/unsafe. Never guess IDs.
    chosen := 'compensation_required';
    valid_binding := p.id is not null and b.id is not null and d.id is not null and t.booking_id is not null
      and p.booking_id = b.id and r.booking_id = b.id and r.payment_id = p.id
      and p.payment_kind = 'deposit' and d.installment_type = 'deposit' and d.booking_id = b.id
      and p.payment_schedule_id = t.deposit_schedule_id and d.id = t.deposit_schedule_id
      and r.provider = p.provider and r.integration_environment = p.integration_environment
      and (p.provider_payment_id is null or r.provider_payment_id = p.provider_payment_id)
      and r.destination_account_id = p.provider_destination_account_id
      and p.organization_payment_account_id is not null
      and r.amount_minor = p.amount_minor and p.amount_minor = t.deposit_amount_minor
      and d.amount_minor = p.amount_minor and r.currency_code = p.currency_code
      and p.currency_code = b.currency_code and d.currency_code = b.currency_code
      and t.currency_code = b.currency_code and t.customer_total_minor = b.customer_total_minor
      and t.marketplace_commission_minor = b.marketplace_commission_minor
      and p.application_fee_minor = t.deposit_application_fee_minor;
    if valid_binding and r.provider_succeeded_at < date_trunc('second',p.created_at) then
      chosen := 'manual_review';
      valid_binding := false;
    end if;
    if valid_binding then
      intact := exists(select 1 from public.booking_items i where i.booking_id=b.id)
        and not exists(select 1 from public.booking_items i where i.booking_id=b.id and
          (select count(*) from public.booking_space_allocations a where a.booking_id=b.id
            and a.booking_item_id=i.id and a.allocation_status in ('held','confirmed')) <> 1)
        and not exists(select 1 from public.booking_space_allocations a where a.booking_id=b.id
          and a.allocation_status in ('held','confirmed') and
          (a.allocation_status <> 'held' or a.hold_expires_at is distinct from b.hold_expires_at
            or not exists(select 1 from public.booking_items i where i.id=a.booking_item_id
              and i.booking_id=b.id and i.space_id=a.space_id and a.reserved_during @> i.event_period)));
      -- Whole-second policy: before/equal deadline second is timely only while
      -- the locked booking still has its complete hold. Never resurrect expiry.
      if b.booking_status='approved_hold' and b.payment_status='unpaid'
        and b.hold_expires_at is not null
        and r.provider_succeeded_at <= date_trunc('second',b.hold_expires_at)
        and intact and p.payment_status in ('pending','processing')
        and p.provider_charge_id is null and d.status in ('pending','due')
        and not exists(select 1 from public.booking_payments x where x.payment_schedule_id=d.id
          and x.id<>p.id and x.payment_status in ('succeeded','partially_refunded','refunded')) then
        chosen := 'fulfilled';
      end if;
      -- Preserve successful money on a compatible attempt even when inventory
      -- cannot fulfill it. A second charge never overwrites the first success.
      if p.payment_status in ('pending','processing') and p.provider_charge_id is null
        and not exists(select 1 from public.booking_payments x where x.payment_schedule_id=d.id
          and x.id<>p.id and x.payment_status in ('succeeded','partially_refunded','refunded')) then
        update public.booking_payments x set payment_status='succeeded',
          provider_payment_id=coalesce(p.provider_payment_id,r.provider_payment_id),
          provider_charge_id=r.provider_charge_id,provider_success_at=r.provider_succeeded_at,
          succeeded_at=accepted_at,failed_at=null,cancelled_at=null,failure_code=null,failure_message=null
          where x.id=p.id;
      end if;
      if chosen='fulfilled' then
        update public.booking_payment_schedule x set status='paid',paid_at=accepted_at where x.id=d.id;
        update public.booking_space_allocations x set allocation_status='confirmed',confirmed_at=accepted_at
          where x.booking_id=b.id and x.allocation_status='held';
        -- Existing history trigger derives its actor from auth.uid(). Clear and
        -- restore BOTH supported claim sources so service calls remain system.
        old_sub := current_setting('request.jwt.claim.sub',true);
        old_claims := current_setting('request.jwt.claims',true);
        perform set_config('request.jwt.claim.sub','',true);
        perform set_config('request.jwt.claims','{}',true);
        update public.bookings x set booking_status='confirmed',
          payment_status=case when p.amount_minor>=b.customer_total_minor then 'paid' else 'partially_paid' end,
          confirmed_at=accepted_at where x.id=b.id;
        perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
        perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
      end if;
    end if;
  end if;
  if chosen='compensation_required' then
    -- An ordinary refund that already reserved this exact payment money cannot
    -- be silently duplicated by automatic compensation. Keep it for review.
    if p.id is not null and p.provider=r.provider and p.integration_environment=r.integration_environment
      and (p.provider_payment_id is null or p.provider_payment_id=r.provider_payment_id)
      and (p.provider_charge_id is null or p.provider_charge_id=r.provider_charge_id)
      and exists(select 1 from public.payment_refunds f where f.booking_payment_id=p.id
        and f.refund_status in ('pending','processing','succeeded')) then
      chosen:='manual_review';
    else
      compensation_reason:=case
        when valid_binding is not true then 'payment_context_mismatch'
        when p.payment_status in ('succeeded','partially_refunded','refunded')
          and p.provider_charge_id is distinct from r.provider_charge_id then 'duplicate_payment'
        when b.booking_status<>'approved_hold' then 'hold_unavailable'
        when r.provider_succeeded_at>date_trunc('second',b.hold_expires_at) then 'payment_after_deadline'
        when intact is not true then 'inventory_inconsistent'
        else 'hold_unavailable' end;
      perform private.ensure_payment_refund_obligation(r.id,compensation_reason);
    end if;
  end if;
  update private.payment_provider_receipts x set disposition=chosen where x.id=r.id;
  insert into private.audit_events(actor_type,actor_user_id,organization_id,action,entity_type,entity_id,metadata)
    values ('system',null,b.organization_id,'deposit_success_reconciled','payment_provider_receipt',r.id,
      jsonb_build_object('event_id',e.id,'payment_id',r.payment_id,'booking_id',r.booking_id,'disposition',chosen));
  -- Recheck elapsed lease at the final transition (the B1 trigger also fences).
  perform private.lock_payment_provider_event_claim(event_id,claim_token);
  update private.payment_provider_events x set processing_status='processed',processed_at=accepted_at,
    claim_token=null,lease_expires_at=null,next_attempt_at=null where x.id=e.id;
  return query select r.id,r.payment_id,r.booking_id,
    case when chosen='fulfilled' then 'confirmed' else chosen end,
    x.booking_status,x.payment_status from (select 1) dummy
    left join public.bookings x on x.id=r.booking_id;
end;
$function$;
alter function public.reconcile_deposit_payment_success(bigint,uuid) owner to postgres;
revoke all on function public.reconcile_deposit_payment_success(bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_deposit_payment_success(bigint,uuid) to service_role;
comment on function public.reconcile_deposit_payment_success(bigint,uuid) is
  'Leased deposit evidence reconciliation; no HTTP/refund execution. Keep integration disabled until 7B2B3B implements provider refund execution.';

create or replace function private.validate_payment_refund_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_booking_id uuid;
  payment_provider text;
  payment_amount bigint;
  payment_currency text;
  payment_status text;

  reserved_refund_amount numeric;
begin
  -- Discover immutable lock identity without taking the payment lock first.
  select p.booking_id into payment_booking_id
  from public.booking_payments as p
  where p.id = new.booking_payment_id;

  if payment_booking_id is null then
    raise exception
      'Booking payment % does not exist',
      new.booking_payment_id;
  end if;

  if new.booking_id <> payment_booking_id then
    raise exception
      'Refund booking does not match payment booking'
      using errcode = '23514';
  end if;

  -- Direct trusted writes must use the same booking -> payment lock order.
  perform b.id
  from public.bookings as b
  where b.id = payment_booking_id
  for update;

  -- Reread payment facts and recheck the relationship after both locks.
  select
    p.booking_id,
    p.provider,
    p.amount_minor,
    p.currency_code,
    p.payment_status
  into
    payment_booking_id,
    payment_provider,
    payment_amount,
    payment_currency,
    payment_status
  from public.booking_payments as p
  where p.id = new.booking_payment_id
  for update;

  if payment_booking_id is null then
    raise exception
      'Booking payment % does not exist',
      new.booking_payment_id;
  end if;

  if new.booking_id <> payment_booking_id then
    raise exception
      'Refund booking does not match payment booking'
      using errcode = '23514';
  end if;

  if new.provider <> payment_provider then
    raise exception
      'Refund provider does not match payment provider'
      using errcode = '23514';
  end if;

  if new.currency_code <> payment_currency then
    raise exception
      'Refund currency does not match payment currency'
      using errcode = '23514';
  end if;

  if payment_status not in (
    'succeeded',
    'partially_refunded',
    'refunded'
  ) then
    raise exception
      'Payment is not in a refundable state'
      using errcode = '23514';
  end if;

  if new.refund_status in (
    'pending',
    'processing',
    'succeeded'
  ) then
    if private.compensation_reserves_payment(new.booking_payment_id) then
      raise exception 'Automatic compensation reserves this payment' using errcode='23514';
    end if;
    if tg_op = 'UPDATE' then
      select coalesce(sum(r.amount_minor), 0)
        into reserved_refund_amount
      from public.payment_refunds as r
      where r.booking_payment_id = new.booking_payment_id
        and r.id <> old.id
        and r.refund_status in (
          'pending',
          'processing',
          'succeeded'
        );
    else
      select coalesce(sum(r.amount_minor), 0)
        into reserved_refund_amount
      from public.payment_refunds as r
      where r.booking_payment_id = new.booking_payment_id
        and r.refund_status in (
          'pending',
          'processing',
          'succeeded'
        );
    end if;

    if reserved_refund_amount + new.amount_minor > payment_amount then
      raise exception
        'Refunds cannot exceed original payment amount'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_payment_refund_context()
  from public, anon, authenticated;



alter function private.validate_payment_refund_context() owner to postgres;
revoke all on function private.validate_payment_refund_context() from service_role;

create or replace function public.request_payment_refund(
  refund_id uuid,
  target_payment_id uuid,
  amount_minor_value bigint,
  reason_value text
)
returns table (
  requested_refund_id uuid,
  booking_id uuid,
  refund_status text,
  amount_minor bigint,
  currency_code text,
  remaining_refundable_minor bigint
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking_id uuid;

  v_booking public.bookings%rowtype;
  v_payment public.booking_payments%rowtype;
  v_existing public.payment_refunds%rowtype;

  v_reserved_refund_total numeric;
  v_remaining_refundable bigint;
begin
  -- --------------------------------------------------------------------------
  -- Authentication
  -- --------------------------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if refund_id is null then
    raise exception 'Refund ID is required'
      using errcode = '23514';
  end if;


  if target_payment_id is null then
    raise exception 'Payment ID is required'
      using errcode = '23514';
  end if;


  if amount_minor_value is null
     or amount_minor_value <= 0
  then
    raise exception 'Refund amount must be greater than zero'
      using errcode = '23514';
  end if;


  if reason_value is null
     or char_length(trim(reason_value)) < 1
     or char_length(trim(reason_value)) > 500
  then
    raise exception
      'Refund reason must contain between 1 and 500 characters'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Resolve booking ID.
  --
  -- Payment identity is immutable, so this lookup can safely establish which
  -- booking must be locked first.
  -- --------------------------------------------------------------------------

  select p.booking_id
  into v_booking_id
  from public.booking_payments as p
  where p.id = target_payment_id;

  if not found then
    raise exception 'Payment not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock booking first.
  --
  -- This follows the same booking-first lock discipline used by the other
  -- financial/lifecycle workflows.
  -- --------------------------------------------------------------------------

  select b.*
  into v_booking
  from public.bookings as b
  where b.id = v_booking_id
  for update;

  if not found then
    raise exception 'Payment booking not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Financial authorization.
  --
  -- Ordinary venue staff deliberately cannot issue refunds.
  -- --------------------------------------------------------------------------

  if not private.can_administer_booking(v_booking.id) then
    raise exception 'You are not permitted to refund this booking'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Refund lifecycle.
  --
  -- Cancelled bookings are the normal refund path.
  --
  -- Completed bookings are also supported for legitimate post-event customer
  -- service adjustments/refunds.
  -- --------------------------------------------------------------------------

  if v_booking.booking_status not in (
    'cancelled',
    'completed'
  ) then
    raise exception
      'Refunds require a cancelled or completed booking; current status is %',
      v_booking.booking_status
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock original payment second.
  -- --------------------------------------------------------------------------

  select p.*
  into v_payment
  from public.booking_payments as p
  where p.id = target_payment_id
  for update;

  if not found then
    raise exception 'Payment not found'
      using errcode = 'P0002';
  end if;


  if v_payment.booking_id <> v_booking.id then
    raise exception 'Payment booking changed unexpectedly'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotent refund request.
  --
  -- The UUID identifies one logical refund request.
  -- Reusing it with different data is rejected.
  -- --------------------------------------------------------------------------

  select r.*
  into v_existing
  from public.payment_refunds as r
  where r.id = refund_id
  for update;

  if found then

    if v_existing.booking_payment_id is distinct from target_payment_id
       or v_existing.amount_minor is distinct from amount_minor_value
       or v_existing.reason is distinct from trim(reason_value)
    then
      raise exception
        'Refund ID has already been used with different refund data'
        using errcode = '23505';
    end if;


    select coalesce(sum(r.amount_minor), 0)
    into v_reserved_refund_total
    from public.payment_refunds as r
    where r.booking_payment_id = target_payment_id
      and r.refund_status in (
        'pending',
        'processing',
        'succeeded'
      );


    v_remaining_refundable :=
      greatest(
        v_payment.amount_minor - v_reserved_refund_total
          - case when private.compensation_reserves_payment(target_payment_id) then v_payment.amount_minor else 0 end,
        0
      );


    return query
    select
      v_existing.id,
      v_existing.booking_id,
      v_existing.refund_status,
      v_existing.amount_minor,
      v_existing.currency_code,
      v_remaining_refundable;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- New refund eligibility.
  --
  -- This deliberately comes AFTER the idempotency check so an exact replay of
  -- an already-completed full refund remains harmless even though the original
  -- payment is now in status refunded.
  -- --------------------------------------------------------------------------

  if private.compensation_reserves_payment(target_payment_id) then
    raise exception 'Automatic compensation reserves this payment' using errcode='23514';
  end if;
  if v_payment.payment_status not in (
    'succeeded',
    'partially_refunded'
  ) then
    raise exception
      'Payment is not currently refundable; payment status is %',
      v_payment.payment_status
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Refundable balance.
  --
  -- Pending/processing refunds reserve capacity because another provider
  -- request may already be underway.
  -- --------------------------------------------------------------------------

  select coalesce(sum(r.amount_minor), 0)
  into v_reserved_refund_total
  from public.payment_refunds as r
  where r.booking_payment_id = target_payment_id
    and r.refund_status in (
      'pending',
      'processing',
      'succeeded'
    );


  v_remaining_refundable :=
    v_payment.amount_minor - v_reserved_refund_total;


  if v_remaining_refundable <= 0 then
    raise exception 'Payment has no remaining refundable amount'
      using errcode = '23514';
  end if;


  if amount_minor_value > v_remaining_refundable then
    raise exception
      'Requested refund exceeds the remaining refundable payment amount'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Create pending refund.
  --
  -- Provider/currency/booking are derived from the payment, never supplied by
  -- the browser.
  --
  -- The refund UUID itself should later be used by the server as the provider
  -- idempotency key when making the external refund request.
  -- --------------------------------------------------------------------------

  insert into public.payment_refunds (
    id,
    booking_id,
    booking_payment_id,
    provider,
    refund_status,
    amount_minor,
    currency_code,
    reason,
    metadata
  )
  values (
    refund_id,
    v_booking.id,
    v_payment.id,
    v_payment.provider,
    'pending',
    amount_minor_value,
    v_payment.currency_code,
    trim(reason_value),

    jsonb_build_object(
      'requested_by_user_id', auth.uid(),
      'request_source', 'authorized_refund_request',
      'provider_idempotency_key', refund_id
    )
  );


  v_remaining_refundable :=
    v_remaining_refundable - amount_minor_value;


  return query
  select
    r.id,
    r.booking_id,
    r.refund_status,
    r.amount_minor,
    r.currency_code,
    v_remaining_refundable
  from public.payment_refunds as r
  where r.id = refund_id;

end;
$function$;



create or replace function public.confirm_deposit_payment(
  target_payment_id uuid,
  provider_payment_id_value text,
  provider_succeeded_at timestamptz,
  provider_fee_minor_value bigint default null
)
returns table (
  confirmed_booking_id uuid,
  booking_status text,
  booking_payment_status text,
  deposit_payment_status text,
  deposit_schedule_status text,
  allocations_confirmed integer,
  confirmed_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
 raise exception 'Legacy deposit confirmation path is retired' using errcode='55000';
end;
$function$;
alter function public.confirm_deposit_payment(uuid,text,timestamptz,bigint) owner to postgres;
revoke all on function public.confirm_deposit_payment(uuid,text,timestamptz,bigint) from public,anon,authenticated,service_role;
comment on function public.confirm_deposit_payment(uuid,text,timestamptz,bigint) is
 'Retired. Deposit success requires verified receipt reconciliation; no financial or lifecycle mutation.';
comment on table private.payment_refund_obligations is
 'Durable full-charge compensation obligation, not evidence of completed refund. All states reserve the identified money. Execution deferred to 7B2B3B; safe presentation deferred to 7D.';
