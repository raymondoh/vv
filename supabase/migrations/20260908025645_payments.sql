-- VV Production Database
-- Migration 0011: payments
--
-- Introduces:
--   organization_payment_accounts
--   booking_payments
--   payment_refunds
--   booking_transfers
--   private.payment_provider_events
--
-- VV's financial records remain provider-neutral. External payment-provider
-- identifiers are references to provider objects, not VV's source of truth.


-- ===========================================================================
-- Shared provider identifier convention
-- ===========================================================================
--
-- provider values use lowercase machine-readable names such as:
--   stripe
--
-- We intentionally do not create a PostgreSQL enum so another provider could
-- be introduced later without rewriting the type.


-- ===========================================================================
-- organization_payment_accounts
-- ===========================================================================
--
-- Represents an organisation's connected payment/payout account.
--
-- No API keys, access tokens or secrets belong in this table.

create table public.organization_payment_accounts (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  provider text not null,

  provider_account_id text null,

  account_status text not null default 'pending',

  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,

  country_code text null,
  default_currency_code text null,

  capabilities_snapshot jsonb not null default '{}'::jsonb,

  connected_at timestamptz null,
  disabled_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organization_payment_accounts_provider_check
    check (
      provider ~ '^[a-z][a-z0-9_-]{0,30}$'
    ),

  constraint organization_payment_accounts_status_check
    check (
      account_status in (
        'pending',
        'onboarding',
        'restricted',
        'enabled',
        'disabled'
      )
    ),

  constraint organization_payment_accounts_provider_account_check
    check (
      provider_account_id is null
      or char_length(trim(provider_account_id)) between 1 and 255
    ),

  constraint organization_payment_accounts_country_check
    check (
      country_code is null
      or country_code ~ '^[A-Z]{2}$'
    ),

  constraint organization_payment_accounts_currency_check
    check (
      default_currency_code is null
      or default_currency_code ~ '^[A-Z]{3}$'
    ),

  constraint organization_payment_accounts_capabilities_check
    check (
      jsonb_typeof(capabilities_snapshot) = 'object'
    ),

  constraint organization_payment_accounts_connected_check
    check (
      connected_at is null
      or connected_at >= created_at
    ),

  constraint organization_payment_accounts_disabled_check
    check (
      disabled_at is null
      or disabled_at >= created_at
    ),

  constraint organization_payment_accounts_one_provider_per_org
    unique (
      organization_id,
      provider
    )
);

comment on table public.organization_payment_accounts is
  'Organisation payment/payout accounts with external providers. Contains no provider secrets.';


create unique index organization_payment_accounts_provider_account_uidx
  on public.organization_payment_accounts (
    provider,
    provider_account_id
  )
  where provider_account_id is not null;


create index organization_payment_accounts_status_idx
  on public.organization_payment_accounts (
    account_status
  );


create trigger set_organization_payment_accounts_updated_at
before update on public.organization_payment_accounts
for each row
execute function private.set_updated_at();


alter table public.organization_payment_accounts enable row level security;


-- ===========================================================================
-- booking_payments
-- ===========================================================================
--
-- One schedule installment can have multiple payment attempts.
--
-- Example:
--
--   Deposit schedule
--       attempt 1 -> failed
--       attempt 2 -> succeeded
--
-- Therefore payment rows are attempts/transactions rather than simply the
-- aggregate state of an installment.

create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  payment_schedule_id uuid null
    references public.booking_payment_schedule(id)
    on delete restrict,

  payment_kind text not null,

  provider text not null,

  provider_payment_id text null,
  provider_idempotency_key text null,

  payment_status text not null default 'pending',

  amount_minor bigint not null,
  currency_code text not null,

  provider_fee_minor bigint null,

  metadata jsonb not null default '{}'::jsonb,

  succeeded_at timestamptz null,
  failed_at timestamptz null,
  cancelled_at timestamptz null,

  failure_code text null,
  failure_message text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_payments_kind_check
    check (
      payment_kind in (
        'deposit',
        'final',
        'adjustment'
      )
    ),

  constraint booking_payments_provider_check
    check (
      provider ~ '^[a-z][a-z0-9_-]{0,30}$'
    ),

  constraint booking_payments_status_check
    check (
      payment_status in (
        'pending',
        'processing',
        'succeeded',
        'failed',
        'cancelled',
        'partially_refunded',
        'refunded'
      )
    ),

  constraint booking_payments_amount_check
    check (
      amount_minor > 0
    ),

  constraint booking_payments_currency_check
    check (
      currency_code ~ '^[A-Z]{3}$'
    ),

  constraint booking_payments_provider_fee_check
    check (
      provider_fee_minor is null
      or provider_fee_minor >= 0
    ),

  constraint booking_payments_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
    ),

  constraint booking_payments_provider_payment_id_check
    check (
      provider_payment_id is null
      or char_length(trim(provider_payment_id)) between 1 and 255
    ),

  constraint booking_payments_idempotency_key_check
    check (
      provider_idempotency_key is null
      or char_length(trim(provider_idempotency_key)) between 1 and 255
    ),

  constraint booking_payments_state_check
    check (
      (
        payment_status in ('pending', 'processing')
        and succeeded_at is null
        and failed_at is null
        and cancelled_at is null
      )
      or
      (
        payment_status in (
          'succeeded',
          'partially_refunded',
          'refunded'
        )
        and succeeded_at is not null
        and failed_at is null
        and cancelled_at is null
      )
      or
      (
        payment_status = 'failed'
        and succeeded_at is null
        and failed_at is not null
        and cancelled_at is null
      )
      or
      (
        payment_status = 'cancelled'
        and succeeded_at is null
        and failed_at is null
        and cancelled_at is not null
      )
    ),

  constraint booking_payments_success_provider_id_check
    check (
      payment_status not in (
        'succeeded',
        'partially_refunded',
        'refunded'
      )
      or provider_payment_id is not null
    ),

  constraint booking_payments_success_timestamp_check
    check (
      succeeded_at is null
      or succeeded_at >= created_at
    ),

  constraint booking_payments_failure_timestamp_check
    check (
      failed_at is null
      or failed_at >= created_at
    ),

  constraint booking_payments_cancel_timestamp_check
    check (
      cancelled_at is null
      or cancelled_at >= created_at
    )
);

comment on table public.booking_payments is
  'Provider-neutral payment attempts associated with VV bookings and installments.';


create unique index booking_payments_provider_payment_uidx
  on public.booking_payments (
    provider,
    provider_payment_id
  )
  where provider_payment_id is not null;


create unique index booking_payments_provider_idempotency_uidx
  on public.booking_payments (
    provider,
    provider_idempotency_key
  )
  where provider_idempotency_key is not null;


create index booking_payments_booking_created_idx
  on public.booking_payments (
    booking_id,
    created_at desc
  );


create index booking_payments_schedule_idx
  on public.booking_payments (
    payment_schedule_id
  )
  where payment_schedule_id is not null;

create unique index booking_payments_one_successful_per_schedule_uidx
  on public.booking_payments (
    payment_schedule_id
  )
  where payment_schedule_id is not null
    and payment_status in (
      'succeeded',
      'partially_refunded',
      'refunded'
    );


create index booking_payments_status_idx
  on public.booking_payments (
    payment_status
  );


create trigger set_booking_payments_updated_at
before update on public.booking_payments
for each row
execute function private.set_updated_at();


alter table public.booking_payments enable row level security;


-- ===========================================================================
-- Payment context validation
-- ===========================================================================
--
-- Deposit/final payments must reference the corresponding installment.
-- Adjustment payments are deliberately not tied to a deposit/final schedule.

create or replace function private.validate_booking_payment_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_currency text;

  schedule_booking_id uuid;
  schedule_type text;
  schedule_amount bigint;
  schedule_currency text;
begin
  select b.currency_code
    into booking_currency
  from public.bookings as b
  where b.id = new.booking_id;

  if booking_currency is null then
    raise exception
      'Booking % does not exist',
      new.booking_id;
  end if;

  if new.currency_code <> booking_currency then
    raise exception
      'Payment currency does not match booking currency'
      using errcode = '23514';
  end if;

  if new.payment_kind in ('deposit', 'final')
     and new.payment_schedule_id is null
  then
    raise exception
      '% payment must reference a payment schedule installment',
      new.payment_kind
      using errcode = '23514';
  end if;

  if new.payment_kind = 'adjustment'
     and new.payment_schedule_id is not null
  then
    raise exception
      'Adjustment payment must not reference a deposit/final payment schedule'
      using errcode = '23514';
  end if;

  if new.payment_schedule_id is not null then
    select
      s.booking_id,
      s.installment_type,
      s.amount_minor,
      s.currency_code
    into
      schedule_booking_id,
      schedule_type,
      schedule_amount,
      schedule_currency
    from public.booking_payment_schedule as s
    where s.id = new.payment_schedule_id;

    if schedule_booking_id is null then
      raise exception
        'Payment schedule installment % does not exist',
        new.payment_schedule_id;
    end if;

    if schedule_booking_id <> new.booking_id then
      raise exception
        'Payment schedule installment does not belong to payment booking'
        using errcode = '23514';
    end if;

    if schedule_type <> new.payment_kind then
      raise exception
        'Payment kind does not match payment schedule installment type'
        using errcode = '23514';
    end if;

    if schedule_currency <> new.currency_code then
      raise exception
        'Payment currency does not match payment schedule currency'
        using errcode = '23514';
    end if;

   if new.amount_minor <> schedule_amount then
  raise exception
    'Payment amount must equal scheduled installment amount'
    using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_payment_context()
  from public, anon, authenticated;


create trigger validate_booking_payment_context
before insert or update of
  booking_id,
  payment_schedule_id,
  payment_kind,
  amount_minor,
  currency_code
on public.booking_payments
for each row
execute function private.validate_booking_payment_context();


-- ===========================================================================
-- Payment lifecycle protection
-- ===========================================================================
--
-- Provider IDs may be populated once after the local row is created, but may
-- not subsequently be replaced with a different provider object.

create or replace function private.validate_booking_payment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_id is distinct from old.booking_id
     or new.payment_schedule_id is distinct from old.payment_schedule_id
     or new.payment_kind is distinct from old.payment_kind
     or new.provider is distinct from old.provider
     or new.amount_minor is distinct from old.amount_minor
     or new.currency_code is distinct from old.currency_code
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Payment booking, schedule, provider, amount and currency are immutable'
      using errcode = '55000';
  end if;

  if old.provider_payment_id is not null
     and new.provider_payment_id is distinct from old.provider_payment_id
  then
    raise exception
      'Provider payment ID cannot be replaced once assigned'
      using errcode = '55000';
  end if;

  if old.provider_idempotency_key is not null
     and new.provider_idempotency_key is distinct from old.provider_idempotency_key
  then
    raise exception
      'Provider idempotency key cannot be replaced once assigned'
      using errcode = '55000';
  end if;

  if new.payment_status is distinct from old.payment_status then
    if not (
      (
        old.payment_status = 'pending'
        and new.payment_status in (
          'processing',
          'succeeded',
          'failed',
          'cancelled'
        )
      )
      or
      (
        old.payment_status = 'processing'
        and new.payment_status in (
          'succeeded',
          'failed',
          'cancelled'
        )
      )
      or
      (
        old.payment_status = 'succeeded'
        and new.payment_status in (
          'partially_refunded',
          'refunded'
        )
      )
      or
      (
        old.payment_status = 'partially_refunded'
        and new.payment_status = 'refunded'
      )
    ) then
      raise exception
        'Invalid payment status transition: % -> %',
        old.payment_status,
        new.payment_status
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_payment_update()
  from public, anon, authenticated;


create trigger validate_booking_payment_update
before update on public.booking_payments
for each row
execute function private.validate_booking_payment_update();


-- ===========================================================================
-- payment_refunds
-- ===========================================================================

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  booking_payment_id uuid not null
    references public.booking_payments(id)
    on delete restrict,

  provider text not null,

  provider_refund_id text null,

  refund_status text not null default 'pending',

  amount_minor bigint not null,
  currency_code text not null,

  reason text null,

  metadata jsonb not null default '{}'::jsonb,

  succeeded_at timestamptz null,
  failed_at timestamptz null,
  cancelled_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_refunds_provider_check
    check (
      provider ~ '^[a-z][a-z0-9_-]{0,30}$'
    ),

  constraint payment_refunds_status_check
    check (
      refund_status in (
        'pending',
        'processing',
        'succeeded',
        'failed',
        'cancelled'
      )
    ),

  constraint payment_refunds_amount_check
    check (
      amount_minor > 0
    ),

  constraint payment_refunds_currency_check
    check (
      currency_code ~ '^[A-Z]{3}$'
    ),

  constraint payment_refunds_reason_check
    check (
      reason is null
      or char_length(trim(reason)) between 1 and 500
    ),

  constraint payment_refunds_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
    ),

  constraint payment_refunds_state_check
    check (
      (
        refund_status in ('pending', 'processing')
        and succeeded_at is null
        and failed_at is null
        and cancelled_at is null
      )
      or
      (
        refund_status = 'succeeded'
        and succeeded_at is not null
        and failed_at is null
        and cancelled_at is null
      )
      or
      (
        refund_status = 'failed'
        and succeeded_at is null
        and failed_at is not null
        and cancelled_at is null
      )
      or
      (
        refund_status = 'cancelled'
        and succeeded_at is null
        and failed_at is null
        and cancelled_at is not null
      )
    ),

  constraint payment_refunds_success_timestamp_check
    check (
      succeeded_at is null
      or succeeded_at >= created_at
    ),

  constraint payment_refunds_failure_timestamp_check
    check (
      failed_at is null
      or failed_at >= created_at
    ),
    constraint payment_refunds_success_provider_id_check
  check (
    refund_status <> 'succeeded'
    or provider_refund_id is not null
  ),

  constraint payment_refunds_cancel_timestamp_check
    check (
      cancelled_at is null
      or cancelled_at >= created_at
    )
);

comment on table public.payment_refunds is
  'Refund transactions against successful VV booking payments.';


create unique index payment_refunds_provider_refund_uidx
  on public.payment_refunds (
    provider,
    provider_refund_id
  )
  where provider_refund_id is not null;


create index payment_refunds_payment_idx
  on public.payment_refunds (
    booking_payment_id,
    created_at
  );


create index payment_refunds_booking_idx
  on public.payment_refunds (
    booking_id,
    created_at
  );


create trigger set_payment_refunds_updated_at
before update on public.payment_refunds
for each row
execute function private.set_updated_at();


alter table public.payment_refunds enable row level security;


-- ===========================================================================
-- Refund context and over-refund prevention
-- ===========================================================================
--
-- Locking the payment row serializes concurrent refund creation for the same
-- payment. Pending/processing refunds reserve refund capacity so two
-- concurrent refund requests cannot together exceed the original payment.

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

  reserved_refund_amount bigint;
begin
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


create trigger validate_payment_refund_context
before insert or update of
  booking_id,
  booking_payment_id,
  provider,
  refund_status,
  amount_minor,
  currency_code
on public.payment_refunds
for each row
execute function private.validate_payment_refund_context();


-- ===========================================================================
-- Refund lifecycle protection
-- ===========================================================================

create or replace function private.validate_payment_refund_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_id is distinct from old.booking_id
     or new.booking_payment_id is distinct from old.booking_payment_id
     or new.provider is distinct from old.provider
     or new.amount_minor is distinct from old.amount_minor
     or new.currency_code is distinct from old.currency_code
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Refund payment, provider, amount and currency are immutable'
      using errcode = '55000';
  end if;

  if old.provider_refund_id is not null
     and new.provider_refund_id is distinct from old.provider_refund_id
  then
    raise exception
      'Provider refund ID cannot be replaced once assigned'
      using errcode = '55000';
  end if;

  if new.refund_status is distinct from old.refund_status then
    if not (
      (
        old.refund_status = 'pending'
        and new.refund_status in (
          'processing',
          'succeeded',
          'failed',
          'cancelled'
        )
      )
      or
      (
        old.refund_status = 'processing'
        and new.refund_status in (
          'succeeded',
          'failed',
          'cancelled'
        )
      )
    ) then
      raise exception
        'Invalid refund status transition: % -> %',
        old.refund_status,
        new.refund_status
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_payment_refund_update()
  from public, anon, authenticated;


create trigger validate_payment_refund_update
before update on public.payment_refunds
for each row
execute function private.validate_payment_refund_update();


-- ===========================================================================
-- booking_transfers
-- ===========================================================================
--
-- Money transferred to a venue organisation.
--
-- This remains separate from customer payments because money received from a
-- customer and money paid out to a venue are different financial events.

create table public.booking_transfers (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  organization_payment_account_id uuid not null
    references public.organization_payment_accounts(id)
    on delete restrict,

  provider text not null,

  provider_transfer_id text null,

  transfer_status text not null default 'pending',

  amount_minor bigint not null,
  reversed_amount_minor bigint not null default 0,

  currency_code text not null,

  metadata jsonb not null default '{}'::jsonb,

  succeeded_at timestamptz null,
  failed_at timestamptz null,
  reversed_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_transfers_provider_check
    check (
      provider ~ '^[a-z][a-z0-9_-]{0,30}$'
    ),

  constraint booking_transfers_status_check
    check (
      transfer_status in (
        'pending',
        'processing',
        'succeeded',
        'failed',
        'partially_reversed',
        'reversed'
      )
    ),

  constraint booking_transfers_amount_check
    check (
      amount_minor > 0
    ),

  constraint booking_transfers_reversed_amount_check
    check (
      reversed_amount_minor >= 0
      and reversed_amount_minor <= amount_minor
    ),

  constraint booking_transfers_currency_check
    check (
      currency_code ~ '^[A-Z]{3}$'
    ),

  constraint booking_transfers_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
    ),

  constraint booking_transfers_state_check
    check (
      (
        transfer_status in ('pending', 'processing')
        and succeeded_at is null
        and failed_at is null
        and reversed_at is null
        and reversed_amount_minor = 0
      )
      or
      (
        transfer_status = 'succeeded'
        and succeeded_at is not null
        and failed_at is null
        and reversed_at is null
        and reversed_amount_minor = 0
      )
      or
      (
        transfer_status = 'failed'
        and succeeded_at is null
        and failed_at is not null
        and reversed_at is null
        and reversed_amount_minor = 0
      )
      or
      (
        transfer_status = 'partially_reversed'
        and succeeded_at is not null
        and failed_at is null
        and reversed_at is not null
        and reversed_amount_minor > 0
        and reversed_amount_minor < amount_minor
      )
      or
      (
        transfer_status = 'reversed'
        and succeeded_at is not null
        and failed_at is null
        and reversed_at is not null
        and reversed_amount_minor = amount_minor
      )
    ),
    constraint booking_transfers_success_provider_id_check
  check (
    transfer_status not in (
      'succeeded',
      'partially_reversed',
      'reversed'
    )
    or provider_transfer_id is not null
  )
);

comment on table public.booking_transfers is
  'Provider-neutral transfers of booking proceeds to venue organisations.';


create unique index booking_transfers_provider_transfer_uidx
  on public.booking_transfers (
    provider,
    provider_transfer_id
  )
  where provider_transfer_id is not null;


create index booking_transfers_booking_idx
  on public.booking_transfers (
    booking_id,
    created_at
  );


create index booking_transfers_account_idx
  on public.booking_transfers (
    organization_payment_account_id,
    created_at
  );


create trigger set_booking_transfers_updated_at
before update on public.booking_transfers
for each row
execute function private.set_updated_at();


alter table public.booking_transfers enable row level security;


-- ===========================================================================
-- Transfer context validation
-- ===========================================================================

create or replace function private.validate_booking_transfer_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_organization_id uuid;
  booking_currency text;

  account_organization_id uuid;
  account_provider text;
begin
  select
    b.organization_id,
    b.currency_code
  into
    booking_organization_id,
    booking_currency
  from public.bookings as b
  where b.id = new.booking_id;

  if booking_organization_id is null then
    raise exception
      'Booking % does not exist',
      new.booking_id;
  end if;

  select
    a.organization_id,
    a.provider
  into
    account_organization_id,
    account_provider
  from public.organization_payment_accounts as a
  where a.id = new.organization_payment_account_id;

  if account_organization_id is null then
    raise exception
      'Organization payment account % does not exist',
      new.organization_payment_account_id;
  end if;

  if account_organization_id <> booking_organization_id then
    raise exception
      'Transfer payment account does not belong to booking organization'
      using errcode = '23514';
  end if;

  if new.provider <> account_provider then
    raise exception
      'Transfer provider does not match organization payment account provider'
      using errcode = '23514';
  end if;

  if new.currency_code <> booking_currency then
    raise exception
      'Transfer currency does not match booking currency'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_transfer_context()
  from public, anon, authenticated;


create trigger validate_booking_transfer_context
before insert or update of
  booking_id,
  organization_payment_account_id,
  provider,
  currency_code
on public.booking_transfers
for each row
execute function private.validate_booking_transfer_context();


-- ===========================================================================
-- Transfer lifecycle protection
-- ===========================================================================
--
-- A transfer is financial history. Once created, its booking, destination
-- account, provider, amount and currency cannot be rewritten.
--
-- Allowed transitions:
--
--   pending    -> processing | succeeded | failed
--   processing -> succeeded | failed
--   succeeded  -> partially_reversed | reversed
--   partially_reversed -> partially_reversed | reversed
--
-- failed and reversed are terminal.

create or replace function private.validate_booking_transfer_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_id is distinct from old.booking_id
     or new.organization_payment_account_id
          is distinct from old.organization_payment_account_id
     or new.provider is distinct from old.provider
     or new.amount_minor is distinct from old.amount_minor
     or new.currency_code is distinct from old.currency_code
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Transfer booking, payment account, provider, amount and currency are immutable'
      using errcode = '55000';
  end if;

  if old.provider_transfer_id is not null
     and new.provider_transfer_id is distinct from old.provider_transfer_id
  then
    raise exception
      'Provider transfer ID cannot be replaced once assigned'
      using errcode = '55000';
  end if;

  if new.reversed_amount_minor < old.reversed_amount_minor then
  raise exception
    'Transfer reversed amount cannot decrease'
    using errcode = '55000';
end if;

  if new.transfer_status is distinct from old.transfer_status then
    if not (
      (
        old.transfer_status = 'pending'
        and new.transfer_status in (
          'processing',
          'succeeded',
          'failed'
        )
      )
      or
      (
        old.transfer_status = 'processing'
        and new.transfer_status in (
          'succeeded',
          'failed'
        )
      )
      or
      (
        old.transfer_status = 'succeeded'
        and new.transfer_status in (
          'partially_reversed',
          'reversed'
        )
      )
      or
      (
        old.transfer_status = 'partially_reversed'
        and new.transfer_status in (
          'partially_reversed',
          'reversed'
        )
      )
    ) then
      raise exception
        'Invalid transfer status transition: % -> %',
        old.transfer_status,
        new.transfer_status
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_transfer_update()
  from public, anon, authenticated;


create trigger validate_booking_transfer_update
before update on public.booking_transfers
for each row
execute function private.validate_booking_transfer_update();

-- ===========================================================================
-- private.payment_provider_events
-- ===========================================================================
--
-- Raw provider webhook/event intake.
--
-- Kept in the private schema because provider payloads are server-side
-- operational data and must never become browser-readable application data.
--
-- provider_event_id uniqueness provides webhook idempotency.

create table private.payment_provider_events (
  id bigint generated always as identity primary key,

  provider text not null,
  provider_event_id text not null,
  event_type text not null,

  occurred_at timestamptz null,
  received_at timestamptz not null default now(),

  processing_status text not null default 'received',

  attempt_count integer not null default 0,

  payload jsonb not null,

  processing_error text null,

  processed_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_provider_events_provider_check
    check (
      provider ~ '^[a-z][a-z0-9_-]{0,30}$'
    ),

  constraint payment_provider_events_provider_event_id_check
    check (
      char_length(trim(provider_event_id)) between 1 and 255
    ),

  constraint payment_provider_events_event_type_check
    check (
      char_length(trim(event_type)) between 1 and 255
    ),

  constraint payment_provider_events_status_check
    check (
      processing_status in (
        'received',
        'processing',
        'processed',
        'failed',
        'ignored'
      )
    ),

  constraint payment_provider_events_attempt_count_check
    check (
      attempt_count >= 0
    ),

  constraint payment_provider_events_payload_check
    check (
      jsonb_typeof(payload) = 'object'
    ),

  constraint payment_provider_events_processing_state_check
    check (
      (
        processing_status in ('received', 'processing')
        and processed_at is null
      )
      or
      (
        processing_status in ('processed', 'ignored')
        and processed_at is not null
      )
      or
      (
        processing_status = 'failed'
        and processed_at is null
        and processing_error is not null
      )
    ),

  constraint payment_provider_events_provider_event_unique
    unique (
      provider,
      provider_event_id
    )
);

comment on table private.payment_provider_events is
  'Private idempotent intake ledger for external payment-provider events/webhooks.';


create index payment_provider_events_status_received_idx
  on private.payment_provider_events (
    processing_status,
    received_at
  );


create trigger set_payment_provider_events_updated_at
before update on private.payment_provider_events
for each row
execute function private.set_updated_at();


-- ===========================================================================
-- Protect provider event identity and payload
-- ===========================================================================

create or replace function private.validate_payment_provider_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider is distinct from old.provider
     or new.provider_event_id is distinct from old.provider_event_id
     or new.event_type is distinct from old.event_type
     or new.occurred_at is distinct from old.occurred_at
     or new.received_at is distinct from old.received_at
     or new.payload is distinct from old.payload
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Provider event identity and payload are immutable'
      using errcode = '55000';
  end if;

  if new.processing_status is distinct from old.processing_status then
    if old.processing_status in ('processed', 'ignored') then
      raise exception
        'Processed or ignored provider events are terminal'
        using errcode = '23514';
    end if;

    if not (
      (
        old.processing_status = 'received'
        and new.processing_status in (
          'processing',
          'processed',
          'failed',
          'ignored'
        )
      )
      or
      (
        old.processing_status = 'processing'
        and new.processing_status in (
          'processed',
          'failed',
          'ignored'
        )
      )
      or
      (
        old.processing_status = 'failed'
        and new.processing_status in (
          'processing',
          'processed',
          'ignored'
        )
      )
    ) then
      raise exception
        'Invalid provider event status transition: % -> %',
        old.processing_status,
        new.processing_status
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_payment_provider_event_update()
  from public, anon, authenticated;


create trigger validate_payment_provider_event_update
before update on private.payment_provider_events
for each row
execute function private.validate_payment_provider_event_update();