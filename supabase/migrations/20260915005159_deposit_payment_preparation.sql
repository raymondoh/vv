-- Stage 7B2A: preparation only. No provider calls or payment-success changes.
-- Activation is a separate trusted deployment decision after 7B2B is proven.
create table private.payment_integration_settings (
  singleton boolean primary key default true check (singleton),
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{0,30}$'),
  integration_environment text not null check (integration_environment in ('test', 'live')),
  enabled boolean not null default false
);
alter table private.payment_integration_settings owner to postgres;
revoke all on private.payment_integration_settings from public, anon, authenticated, service_role;
insert into private.payment_integration_settings values (true, 'stripe', 'test', false);

alter table public.organization_payment_accounts
  add column integration_environment text null
    check (integration_environment in ('test', 'live'));

alter table public.booking_payments
  add column organization_payment_account_id uuid null
    references public.organization_payment_accounts(id) on delete restrict,
  add column provider_destination_account_id text null,
  add column integration_environment text null,
  add column application_fee_minor bigint null,
  add constraint booking_payments_preparation_binding_check check (
    (organization_payment_account_id is null and provider_destination_account_id is null
      and integration_environment is null and application_fee_minor is null)
    or
    (organization_payment_account_id is not null and provider_destination_account_id is not null
      and provider_destination_account_id = btrim(provider_destination_account_id)
      and char_length(provider_destination_account_id) between 1 and 255
      and integration_environment is not null and integration_environment in ('test', 'live')
      and application_fee_minor is not null and application_fee_minor between 0 and amount_minor
      and provider_idempotency_key is not null)
  );

-- Existing duplicates must stop deployment, not be silently deleted/relabelled.
create unique index booking_payments_one_active_deposit_idx
  on public.booking_payments (payment_schedule_id)
  where payment_kind = 'deposit' and payment_status in ('pending', 'processing');

create table private.booking_payment_terms (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  deposit_schedule_id uuid not null unique references public.booking_payment_schedule(id) on delete restrict,
  final_schedule_id uuid not null unique references public.booking_payment_schedule(id) on delete restrict,
  customer_total_minor bigint not null check (customer_total_minor > 0),
  marketplace_commission_minor bigint not null check (marketplace_commission_minor >= 0),
  deposit_amount_minor bigint not null check (deposit_amount_minor > 0),
  final_amount_minor bigint not null check (final_amount_minor > 0),
  deposit_application_fee_minor bigint not null,
  final_application_fee_minor bigint not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (deposit_schedule_id <> final_schedule_id),
  check (marketplace_commission_minor <= customer_total_minor),
  check (deposit_amount_minor::numeric + final_amount_minor = customer_total_minor),
  check (deposit_application_fee_minor between 0 and deposit_amount_minor),
  check (final_application_fee_minor between 0 and final_amount_minor),
  check (deposit_application_fee_minor::numeric + final_application_fee_minor = marketplace_commission_minor)
);
alter table private.booking_payment_terms owner to postgres;
revoke all on private.booking_payment_terms from public, anon, authenticated, service_role;

create function private.protect_booking_payment_terms()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  b public.bookings%rowtype;
  d public.booking_payment_schedule%rowtype;
  f public.booking_payment_schedule%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Payment terms are immutable' using errcode = '55000';
  end if;
  select * into b from public.bookings where id = new.booking_id;
  select * into d from public.booking_payment_schedule where id = new.deposit_schedule_id;
  select * into f from public.booking_payment_schedule where id = new.final_schedule_id;
  if b.id is null or d.id is null or f.id is null
    or d.booking_id <> b.id or f.booking_id <> b.id
    or d.installment_type <> 'deposit' or f.installment_type <> 'final'
    or (select count(*) from public.booking_payment_schedule s where s.booking_id = b.id) <> 2
    or new.customer_total_minor <> b.customer_total_minor
    or new.marketplace_commission_minor <> b.marketplace_commission_minor
    or new.currency_code <> b.currency_code or d.currency_code <> b.currency_code or f.currency_code <> b.currency_code
    or new.deposit_amount_minor <> d.amount_minor or new.final_amount_minor <> f.amount_minor
    or new.deposit_application_fee_minor <> floor(b.marketplace_commission_minor::numeric * d.amount_minor / b.customer_total_minor)::bigint
  then
    raise exception 'Invalid historical payment terms' using errcode = '23514';
  end if;
  return new;
end;
$function$;
alter function private.protect_booking_payment_terms() owner to postgres;
revoke all on function private.protect_booking_payment_terms() from public, anon, authenticated, service_role;
create trigger protect_booking_payment_terms before insert or update or delete
  on private.booking_payment_terms for each row execute function private.protect_booking_payment_terms();

create function private.freeze_prepared_payment_schedule()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from private.booking_payment_terms t where t.booking_id = new.booking_id) then
      raise exception 'Prepared payment schedule is immutable' using errcode = '55000';
    end if;
    return new;
  end if;
  if exists (select 1 from private.booking_payment_terms t where t.booking_id = old.booking_id)
    or (tg_op = 'UPDATE' and exists (
      select 1 from private.booking_payment_terms t where t.booking_id = new.booking_id))
  then
    if tg_op = 'DELETE' then
      raise exception 'Prepared payment schedule is immutable' using errcode = '55000';
    end if;
    if row(new.id, new.booking_id, new.installment_type, new.sequence, new.amount_minor,
      new.currency_code, new.due_at, new.due_rule_snapshot, new.created_at)
      is distinct from row(old.id, old.booking_id, old.installment_type, old.sequence, old.amount_minor,
      old.currency_code, old.due_at, old.due_rule_snapshot, old.created_at)
    then
      raise exception 'Prepared payment schedule is immutable' using errcode = '55000';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
alter function private.freeze_prepared_payment_schedule() owner to postgres;
revoke all on function private.freeze_prepared_payment_schedule() from public, anon, authenticated, service_role;
create trigger freeze_prepared_payment_schedule before insert or update or delete
  on public.booking_payment_schedule for each row execute function private.freeze_prepared_payment_schedule();

create function private.protect_payment_preparation_binding()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  a public.organization_payment_accounts%rowtype;
  t private.booking_payment_terms%rowtype;
begin
  if tg_op = 'UPDATE' then
    if row(new.organization_payment_account_id, new.provider_destination_account_id,
      new.integration_environment, new.application_fee_minor)
      is distinct from row(old.organization_payment_account_id, old.provider_destination_account_id,
      old.integration_environment, old.application_fee_minor)
      or (old.organization_payment_account_id is not null
        and new.provider_idempotency_key is distinct from old.provider_idempotency_key)
    then
      raise exception 'Payment preparation binding is immutable' using errcode = '55000';
    end if;
    return new;
  end if;
  -- Legacy inserts remain compatible with existing trusted workflows. They are
  -- never eligible for the new adapter without the complete typed binding.
  if new.organization_payment_account_id is null then return new; end if;
  select * into a from public.organization_payment_accounts where id = new.organization_payment_account_id for share;
  select * into t from private.booking_payment_terms where booking_id = new.booking_id;
  if a.id is null or t.booking_id is null or new.payment_kind <> 'deposit'
    or a.organization_id <> (select b.organization_id from public.bookings b where b.id = new.booking_id)
    or new.provider <> a.provider
    or new.integration_environment is distinct from a.integration_environment
    or new.provider_destination_account_id is distinct from a.provider_account_id
    or new.payment_schedule_id <> t.deposit_schedule_id
    or new.amount_minor <> t.deposit_amount_minor or new.currency_code <> t.currency_code
    or new.application_fee_minor <> t.deposit_application_fee_minor
  then
    raise exception 'Invalid payment preparation binding' using errcode = '23514';
  end if;
  return new;
end;
$function$;
alter function private.protect_payment_preparation_binding() owner to postgres;
revoke all on function private.protect_payment_preparation_binding() from public, anon, authenticated, service_role;
create trigger protect_payment_preparation_binding before insert or update on public.booking_payments
  for each row execute function private.protect_payment_preparation_binding();

create function private.protect_bound_payment_account()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if row(new.integration_environment, new.provider, new.provider_account_id, new.organization_id)
    is distinct from row(old.integration_environment, old.provider, old.provider_account_id, old.organization_id)
    and exists (select 1 from public.booking_payments p where p.organization_payment_account_id = old.id)
  then
    raise exception 'Bound payment account identity is immutable' using errcode = '55000';
  end if;
  return new;
end;
$function$;
alter function private.protect_bound_payment_account() owner to postgres;
revoke all on function private.protect_bound_payment_account() from public, anon, authenticated, service_role;
create trigger protect_bound_payment_account before update on public.organization_payment_accounts
  for each row execute function private.protect_bound_payment_account();

-- Shared locked validation. Does not initialize terms or create an attempt.
-- All callers lock the booking first. Re-locking it here is harmless.
create function private.deposit_preparation_context(target_booking_id uuid)
returns table (deposit_schedule_id uuid, final_schedule_id uuid, payment_account_id uuid,
  provider_value text, environment_value text, destination_account_id text)
language plpgsql security definer set search_path = '' as $function$
declare
  b public.bookings%rowtype;
  d public.booking_payment_schedule%rowtype;
  f public.booking_payment_schedule%rowtype;
  a public.organization_payment_accounts%rowtype;
  cfg private.payment_integration_settings%rowtype;
  reference_now timestamptz;
  organization_status text;
begin
  select * into b from public.bookings where id = target_booking_id for update;
  reference_now := clock_timestamp();
  if b.id is null or b.booking_status <> 'approved_hold' or b.payment_status <> 'unpaid'
    or b.hold_expires_at is null or b.hold_expires_at <= reference_now
  then raise exception 'Deposit payment unavailable' using errcode = '23514'; end if;

  perform p.id from public.booking_payments p where p.booking_id = b.id order by p.id for update;
  perform s.id from public.booking_payment_schedule s where s.booking_id = b.id order by s.id for update;
  if (select count(*) from public.booking_payment_schedule s where s.booking_id = b.id) <> 2
    or (select count(*) from public.booking_payment_schedule s where s.booking_id = b.id and s.installment_type = 'deposit') <> 1
    or (select count(*) from public.booking_payment_schedule s where s.booking_id = b.id and s.installment_type = 'final') <> 1
  then raise exception 'Deposit payment unavailable' using errcode = '23514'; end if;
  select * into d from public.booking_payment_schedule s where s.booking_id = b.id and s.installment_type = 'deposit';
  select * into f from public.booking_payment_schedule s where s.booking_id = b.id and s.installment_type = 'final';
  if d.status not in ('pending', 'due') or f.status not in ('pending', 'due')
    or d.amount_minor <= 0 or f.amount_minor <= 0
    or d.currency_code <> b.currency_code or f.currency_code <> b.currency_code
    or d.amount_minor::numeric + f.amount_minor <> b.customer_total_minor
    or f.due_at is null or f.due_at <= reference_now
    or exists (select 1 from public.booking_payments p where p.payment_schedule_id = d.id
      and p.payment_status in ('succeeded', 'partially_refunded', 'refunded'))
  then raise exception 'Deposit payment unavailable' using errcode = '23514'; end if;

  select o.status into organization_status from public.organizations o where o.id = b.organization_id for share;
  select * into cfg from private.payment_integration_settings where singleton for share;
  if organization_status is distinct from 'active' or cfg.enabled is distinct from true then
    raise exception 'Deposit payment unavailable' using errcode = '23514';
  end if;
  select * into a from public.organization_payment_accounts pa
    where pa.organization_id = b.organization_id and pa.provider = cfg.provider for share;
  if a.id is null or a.integration_environment is distinct from cfg.integration_environment
    or a.account_status <> 'enabled' or not a.details_submitted or not a.charges_enabled or not a.payouts_enabled
    or a.provider_account_id is null or btrim(a.provider_account_id) = ''
    or a.provider_account_id <> btrim(a.provider_account_id)
  then raise exception 'Deposit payment unavailable' using errcode = '23514'; end if;

  perform i.id from public.booking_items i where i.booking_id = b.id order by i.id for share;
  perform x.id from public.booking_space_allocations x where x.booking_id = b.id order by x.id for update;
  -- Approval's immutable buffered ranges are authoritative; do not recompute
  -- current operational rules or require equality with the unbuffered event.
  if not exists (select 1 from public.booking_items i where i.booking_id = b.id)
    or exists (
      select 1 from public.booking_items i where i.booking_id = b.id and
        (select count(*) from public.booking_space_allocations x
          where x.booking_id = b.id and x.booking_item_id = i.id and x.space_id = i.space_id
            and x.allocation_status = 'held' and x.hold_expires_at = b.hold_expires_at
            and x.reserved_during @> i.event_period) <> 1)
    or exists (
      select 1 from public.booking_space_allocations x where x.booking_id = b.id
        and x.allocation_status in ('held', 'confirmed') and (
          x.allocation_status <> 'held' or x.hold_expires_at <> b.hold_expires_at
          or not exists (select 1 from public.booking_items i where i.id = x.booking_item_id
            and i.booking_id = b.id and i.space_id = x.space_id and x.reserved_during @> i.event_period)))
  then raise exception 'Deposit payment unavailable' using errcode = '23514'; end if;

  -- Account/schedule locks may have waited beyond the initial time check.
  reference_now := clock_timestamp();
  if b.hold_expires_at <= reference_now or f.due_at <= reference_now then
    raise exception 'Deposit payment unavailable' using errcode = '23514';
  end if;
  return query select d.id, f.id, a.id, cfg.provider, cfg.integration_environment, a.provider_account_id;
end;
$function$;
alter function private.deposit_preparation_context(uuid) owner to postgres;
revoke all on function private.deposit_preparation_context(uuid) from public, anon, authenticated, service_role;

create function public.prepare_deposit_payment(target_booking_id uuid)
returns table (payment_id uuid, booking_id uuid, amount_minor bigint, currency_code text,
  payment_state text, preparation_result text, hold_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $function$
declare
  b public.bookings%rowtype;
  p public.booking_payments%rowtype;
  t private.booking_payment_terms%rowtype;
  d public.booking_payment_schedule%rowtype;
  f public.booking_payment_schedule%rowtype;
  c record;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into b from public.bookings where id = target_booking_id for update;
  if b.id is null or b.customer_user_id is distinct from auth.uid() then
    raise exception 'Booking unavailable' using errcode = 'P0002';
  end if;
  select * into c from private.deposit_preparation_context(b.id);
  select * into d from public.booking_payment_schedule where id = c.deposit_schedule_id;
  select * into f from public.booking_payment_schedule where id = c.final_schedule_id;
  select * into t from private.booking_payment_terms pt where pt.booking_id = b.id;
  if not found then
    insert into private.booking_payment_terms (
      booking_id, deposit_schedule_id, final_schedule_id, customer_total_minor,
      marketplace_commission_minor, deposit_amount_minor, final_amount_minor,
      deposit_application_fee_minor, final_application_fee_minor, currency_code
    ) values (b.id, d.id, f.id, b.customer_total_minor, b.marketplace_commission_minor,
      d.amount_minor, f.amount_minor,
      floor(b.marketplace_commission_minor::numeric * d.amount_minor / b.customer_total_minor)::bigint,
      b.marketplace_commission_minor - floor(b.marketplace_commission_minor::numeric * d.amount_minor / b.customer_total_minor)::bigint,
      b.currency_code) returning * into t;
  end if;
  if t.deposit_schedule_id <> d.id or t.final_schedule_id <> f.id
    or t.customer_total_minor <> b.customer_total_minor or t.marketplace_commission_minor <> b.marketplace_commission_minor
    or t.deposit_amount_minor <> d.amount_minor or t.final_amount_minor <> f.amount_minor or t.currency_code <> b.currency_code
  then raise exception 'Deposit payment unavailable' using errcode = '23514'; end if;

  select * into p from public.booking_payments bp where bp.payment_schedule_id = d.id
    and bp.payment_kind = 'deposit' and bp.payment_status in ('pending', 'processing');
  if found then
    if p.organization_payment_account_id is distinct from c.payment_account_id
      or p.provider_destination_account_id is distinct from c.destination_account_id
      or p.integration_environment is distinct from c.environment_value or p.provider <> c.provider_value
      or p.amount_minor <> d.amount_minor or p.currency_code <> d.currency_code
      or p.application_fee_minor is distinct from t.deposit_application_fee_minor or p.provider_idempotency_key is null
    then raise exception 'Deposit payment unavailable' using errcode = '23514'; end if;
    preparation_result := 'reused';
  else
    -- A terminal provider-bound attempt cannot be proven unchargeable by this
    -- preparation-only migration. 7B2B must supply verified terminal evidence.
    -- Unbound legacy/ambiguous attempts also fail closed rather than minting a
    -- second external charge after an unknown network outcome.
    if exists (select 1 from public.booking_payments bp where bp.payment_schedule_id = d.id) then
      raise exception 'Payment reconciliation required before replacement' using errcode = '23514';
    end if;
    new_id := gen_random_uuid();
    insert into public.booking_payments (id, booking_id, payment_schedule_id, payment_kind,
      provider, provider_idempotency_key, payment_status, amount_minor, currency_code,
      organization_payment_account_id, provider_destination_account_id, integration_environment, application_fee_minor)
    values (new_id, b.id, d.id, 'deposit', c.provider_value,
      'vv:' || c.environment_value || ':deposit:' || new_id::text || ':create:v1', 'pending',
      d.amount_minor, d.currency_code, c.payment_account_id, c.destination_account_id,
      c.environment_value, t.deposit_application_fee_minor) returning * into p;
    preparation_result := 'created';
  end if;
  return query select p.id, b.id, p.amount_minor, p.currency_code, p.payment_status, preparation_result, b.hold_expires_at;
end;
$function$;
alter function public.prepare_deposit_payment(uuid) owner to postgres;
revoke all on function public.prepare_deposit_payment(uuid) from public, anon, authenticated, service_role;
grant execute on function public.prepare_deposit_payment(uuid) to authenticated;

create function public.get_deposit_payment_creation_context(target_payment_id uuid)
returns table (payment_id uuid, booking_id uuid, amount_minor bigint, currency_code text,
  provider text, integration_environment text, provider_idempotency_key text,
  destination_account_id text, application_fee_minor bigint, hold_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $function$
declare
  p public.booking_payments%rowtype;
  c record;
  target_booking uuid;
  t private.booking_payment_terms%rowtype;
begin
  select bp.booking_id into target_booking from public.booking_payments bp where bp.id = target_payment_id;
  if target_booking is null then raise exception 'Payment unavailable' using errcode = 'P0002'; end if;
  perform b.id from public.bookings b where b.id = target_booking for update;
  select * into c from private.deposit_preparation_context(target_booking);
  select * into p from public.booking_payments bp where bp.id = target_payment_id;
  select * into t from private.booking_payment_terms pt where pt.booking_id = target_booking;
  if t.booking_id is null or p.payment_kind <> 'deposit' or p.payment_status not in ('pending', 'processing')
    or p.payment_schedule_id <> c.deposit_schedule_id
    or p.organization_payment_account_id is distinct from c.payment_account_id
    or p.provider_destination_account_id is distinct from c.destination_account_id
    or p.integration_environment is distinct from c.environment_value or p.provider <> c.provider_value
    or p.amount_minor <> t.deposit_amount_minor or p.currency_code <> t.currency_code
    or p.application_fee_minor is distinct from t.deposit_application_fee_minor or p.provider_idempotency_key is null
  then raise exception 'Payment unavailable' using errcode = '23514'; end if;
  return query select p.id, p.booking_id, p.amount_minor, p.currency_code, p.provider,
    p.integration_environment, p.provider_idempotency_key, p.provider_destination_account_id,
    p.application_fee_minor, b.hold_expires_at from public.bookings b where b.id = target_booking;
end;
$function$;
alter function public.get_deposit_payment_creation_context(uuid) owner to postgres;
revoke all on function public.get_deposit_payment_creation_context(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_deposit_payment_creation_context(uuid) to service_role;

create function public.attach_deposit_payment_provider(target_payment_id uuid,
  provider_value text, environment_value text, provider_payment_id_value text)
returns table (payment_id uuid, payment_state text, attachment_result text)
language plpgsql security definer set search_path = '' as $function$
declare
  p public.booking_payments%rowtype;
  target_booking uuid;
  eligible boolean := true;
begin
  if provider_payment_id_value is null or char_length(provider_payment_id_value) not between 1 and 255
    or provider_payment_id_value <> btrim(provider_payment_id_value)
  then raise exception 'Invalid provider payment identifier' using errcode = '22023'; end if;
  select bp.booking_id into target_booking from public.booking_payments bp where bp.id = target_payment_id;
  if target_booking is null then raise exception 'Payment unavailable' using errcode = 'P0002'; end if;
  perform b.id from public.bookings b where b.id = target_booking for update;
  select * into p from public.booking_payments bp where bp.id = target_payment_id for update;
  if p.payment_kind <> 'deposit' or p.organization_payment_account_id is null
    or p.provider is distinct from provider_value or p.integration_environment is distinct from environment_value
    or p.provider_idempotency_key is null
  then raise exception 'Payment unavailable' using errcode = '23514'; end if;
  if p.provider_payment_id is not null and p.provider_payment_id <> provider_payment_id_value then
    raise exception 'Provider payment identifier already assigned' using errcode = '23514';
  end if;
  if p.provider_payment_id is null and p.payment_status not in ('pending', 'processing') then
    raise exception 'Payment unavailable' using errcode = '23514';
  end if;
  -- Persist before the scoped eligibility check. Its failure rolls back only
  -- its own locks/work, never the newly recovered provider reference.
  if p.provider_payment_id is null then
    update public.booking_payments bp set provider_payment_id = provider_payment_id_value where bp.id = p.id;
  end if;
  begin
    perform * from public.get_deposit_payment_creation_context(p.id);
  exception when check_violation then
    eligible := false;
  end;
  return query select p.id, p.payment_status,
    case when p.payment_status in ('succeeded', 'partially_refunded', 'refunded') then 'already_recorded'
      when not eligible then 'provider_cancellation_or_reconciliation_required'
      else 'attached' end;
end;
$function$;
alter function public.attach_deposit_payment_provider(uuid, text, text, text) owner to postgres;
revoke all on function public.attach_deposit_payment_provider(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.attach_deposit_payment_provider(uuid, text, text, text) to service_role;

-- Browser roles already have no DML; make that boundary explicit. Trusted
-- success/cancellation functions keep their existing ACLs and postgres owner.
revoke insert, update, delete, truncate, references, trigger on public.booking_payments,
  public.booking_payment_schedule, public.organization_payment_accounts from public, anon, authenticated;

comment on function public.prepare_deposit_payment(uuid) is
  'Ownership-enforcing deposit preparation. Disabled until trusted integration settings are enabled; no provider call or success transition.';
comment on function public.attach_deposit_payment_provider(uuid, text, text, text) is
  'Assign-once provider reference; preserves recovery identity when eligibility is lost. Never marks payment processing or successful.';
