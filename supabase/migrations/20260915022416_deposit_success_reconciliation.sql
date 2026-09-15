-- Stage 7B2B2: trusted evidence reconciliation, no provider calls or refunds.
-- Integration MUST remain disabled until 7B2B3 retires the legacy
-- confirm_deposit_payment bypass and installs durable compensation execution.
-- This migration does not change that function's body or grants.
alter table private.payment_integration_settings
  add column provider_account_scope text null,
  add constraint payment_integration_scope_check check (
    (provider_account_scope is null or (provider = 'stripe'
      and provider_account_scope ~ '^acct_[A-Za-z0-9]+$'))
    and (not enabled or provider_account_scope is not null));

alter table public.booking_payments
  add column provider_charge_id text null,
  add column provider_success_at timestamptz null,
  add constraint booking_payments_success_evidence_check check (
    (provider_charge_id is null and provider_success_at is null)
    or (provider_charge_id is not null and provider_charge_id ~ '^ch_[A-Za-z0-9]+$'
      and provider = 'stripe' and provider_success_at is not null
      and isfinite(provider_success_at)
      and provider_success_at = date_trunc('second', provider_success_at)));

create function private.protect_payment_success_evidence()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'UPDATE' and old.provider_charge_id is not null
    and row(new.provider_charge_id, new.provider_success_at)
      is distinct from row(old.provider_charge_id, old.provider_success_at) then
    raise exception 'Provider success evidence is immutable' using errcode = '55000';
  end if;
  if new.provider_charge_id is not null and not exists (
    select 1 from private.payment_provider_receipts r where r.payment_id = new.id
      and r.booking_id = new.booking_id and r.provider = new.provider
      and r.integration_environment = new.integration_environment
      and r.provider_payment_id = new.provider_payment_id
      and r.provider_charge_id = new.provider_charge_id
      and r.provider_succeeded_at = new.provider_success_at
      and r.destination_account_id = new.provider_destination_account_id
      and r.amount_minor = new.amount_minor and r.currency_code = new.currency_code) then
    raise exception 'Provider success evidence unavailable' using errcode = '23514';
  end if;
  return new;
end;
$function$;
alter function private.protect_payment_success_evidence() owner to postgres;
revoke all on function private.protect_payment_success_evidence() from public, anon, authenticated, service_role;
create trigger protect_payment_success_evidence before insert or update on public.booking_payments
  for each row execute function private.protect_payment_success_evidence();

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
  return new;
end;
$function$;
alter function private.protect_payment_provider_receipt() owner to postgres;
revoke all on function private.protect_payment_provider_receipt() from public, anon, authenticated, service_role;

create function public.reconcile_deposit_payment_success(event_id bigint, claim_token uuid)
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
  'Leased deposit evidence reconciliation; no HTTP/refund execution. Keep integration disabled until 7B2B3 retires legacy confirmation and implements compensation.';
