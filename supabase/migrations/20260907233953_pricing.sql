-- VV Production Database
-- Migration 0007: space pricing and booking rules

-- ===========================================================================
-- space_rate_plans
-- ===========================================================================
--
-- Rate plans describe current catalogue pricing for a reservable space.
--
-- Money is always stored in integer minor units:
--   GBP 125.00 -> 12500
--
-- Date validity is venue-local calendar validity. The venue itself owns the
-- IANA timezone used when translating booking timestamps to local dates.

create table public.space_rate_plans (
  id uuid primary key default gen_random_uuid(),

  space_id uuid not null
    references public.spaces(id)
    on delete cascade,

  name text not null,

  pricing_model text not null,

  unit_amount_minor bigint not null,
  currency_code text not null,

  -- VV convention:
  --   0 = Monday
  --   1 = Tuesday
  --   ...
  --   6 = Sunday
  weekdays smallint[] not null
    default array[0,1,2,3,4,5,6]::smallint[],

  valid_from date not null,
  valid_until date null,

  -- Half-open range: [valid_from, valid_until)
  valid_during daterange
    generated always as (
      daterange(
        valid_from,
        valid_until,
        '[)'
      )
    ) stored,

  priority integer not null default 0,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint space_rate_plans_name_check
    check (
      char_length(trim(name)) between 1 and 160
    ),

  constraint space_rate_plans_pricing_model_check
    check (
      pricing_model in (
        'hourly',
        'daily',
        'flat'
      )
    ),

  constraint space_rate_plans_amount_check
    check (
      unit_amount_minor >= 0
    ),

  constraint space_rate_plans_currency_check
    check (
      currency_code ~ '^[A-Z]{3}$'
    ),

  constraint space_rate_plans_weekdays_check
    check (
      cardinality(weekdays) between 1 and 7
      and array_position(weekdays, null) is null
      and weekdays <@
        array[0,1,2,3,4,5,6]::smallint[]
    ),

  constraint space_rate_plans_valid_dates_check
    check (
      valid_until is null
      or valid_until > valid_from
    ),

  constraint space_rate_plans_priority_check
    check (
      priority >= 0
    )
);

comment on table public.space_rate_plans is
  'Live catalogue pricing plans for individual reservable spaces.';

comment on column public.space_rate_plans.unit_amount_minor is
  'Price in integer minor currency units; never a floating-point monetary value.';

comment on column public.space_rate_plans.weekdays is
  'Venue-local applicable weekdays using 0=Monday through 6=Sunday.';

comment on column public.space_rate_plans.valid_until is
  'Exclusive end date; NULL means the plan has no scheduled end date.';

comment on column public.space_rate_plans.valid_during is
  'Generated half-open venue-local date range [valid_from, valid_until).';


-- Prevent confusing duplicate names such as "Standard" / "standard"
-- for one space.

create unique index space_rate_plans_space_name_uidx
  on public.space_rate_plans (
    space_id,
    lower(name)
  );


create index space_rate_plans_space_active_idx
  on public.space_rate_plans (
    space_id,
    is_active,
    priority
  );


create index space_rate_plans_valid_during_gist_idx
  on public.space_rate_plans
  using gist (
    valid_during
  );


create trigger set_space_rate_plans_updated_at
before update on public.space_rate_plans
for each row
execute function private.set_updated_at();


alter table public.space_rate_plans enable row level security;


-- ===========================================================================
-- rate_overrides
-- ===========================================================================
--
-- Overrides change the unit amount for a bounded date period within one
-- rate plan.
--
-- Examples:
--   Christmas week
--   bank-holiday weekend
--   peak wedding dates
--
-- An override inherits pricing model and currency from its parent rate plan.

create table public.rate_overrides (
  id uuid primary key default gen_random_uuid(),

  rate_plan_id uuid not null
    references public.space_rate_plans(id)
    on delete cascade,

  override_from date not null,
  override_until date not null,

  -- Half-open range: [override_from, override_until)
  override_during daterange
    generated always as (
      daterange(
        override_from,
        override_until,
        '[)'
      )
    ) stored,

  unit_amount_minor bigint not null,

  reason text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rate_overrides_dates_check
    check (
      override_until > override_from
    ),

  constraint rate_overrides_amount_check
    check (
      unit_amount_minor >= 0
    ),

  constraint rate_overrides_reason_check
    check (
      reason is null
      or char_length(trim(reason)) between 1 and 500
    ),

  -- No two overrides for one plan may cover the same calendar date.
  constraint rate_overrides_no_overlap
    exclude using gist (
      rate_plan_id with =,
      override_during with &&
    )
);

comment on table public.rate_overrides is
  'Bounded date-based price overrides belonging to a space rate plan.';

comment on column public.rate_overrides.override_until is
  'Exclusive end date. A one-day override uses the following date as override_until.';


create index rate_overrides_rate_plan_idx
  on public.rate_overrides (
    rate_plan_id,
    override_from
  );


create trigger set_rate_overrides_updated_at
before update on public.rate_overrides
for each row
execute function private.set_updated_at();


alter table public.rate_overrides enable row level security;


-- ===========================================================================
-- Ensure overrides remain inside the parent plan validity
-- ===========================================================================
--
-- Cross-table rules cannot be expressed with an ordinary CHECK constraint,
-- so PostgreSQL enforces this through a trigger.

create or replace function private.validate_rate_override_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_valid_during daterange;
  proposed_override_during daterange;
begin
  select rp.valid_during
    into parent_valid_during
  from public.space_rate_plans as rp
  where rp.id = new.rate_plan_id;

  if parent_valid_during is null then
    raise exception
      'Rate plan % does not exist',
      new.rate_plan_id;
  end if;

  -- Do not rely on the generated override_during column here.
  -- This is a BEFORE trigger, so calculate the proposed range directly
  -- from the incoming source columns.
  proposed_override_during :=
    daterange(
      new.override_from,
      new.override_until,
      '[)'
    );

  if not (proposed_override_during <@ parent_valid_during) then
    raise exception
      'Rate override period must fall within parent rate plan validity'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_rate_override_period()
  from public, anon, authenticated;


create trigger validate_rate_override_period
before insert or update of
  rate_plan_id,
  override_from,
  override_until
on public.rate_overrides
for each row
execute function private.validate_rate_override_period();


-- ===========================================================================
-- space_booking_rules
-- ===========================================================================
--
-- One current set of operational booking rules per space.
--
-- These values are live catalogue configuration. The commercially relevant
-- rules will later be snapshotted into the booking when the request is made.

create table public.space_booking_rules (
  space_id uuid primary key
    references public.spaces(id)
    on delete cascade,

  minimum_duration_minutes integer null,
  maximum_duration_minutes integer null,

  minimum_notice_minutes integer null,
  maximum_advance_days integer null,

  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 0,

  requires_host_approval boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint space_booking_rules_minimum_duration_check
    check (
      minimum_duration_minutes is null
      or minimum_duration_minutes > 0
    ),

  constraint space_booking_rules_maximum_duration_check
    check (
      maximum_duration_minutes is null
      or maximum_duration_minutes > 0
    ),

  constraint space_booking_rules_duration_order_check
    check (
      minimum_duration_minutes is null
      or maximum_duration_minutes is null
      or minimum_duration_minutes <= maximum_duration_minutes
    ),

  constraint space_booking_rules_minimum_notice_check
    check (
      minimum_notice_minutes is null
      or minimum_notice_minutes >= 0
    ),

  constraint space_booking_rules_maximum_advance_check
    check (
      maximum_advance_days is null
      or maximum_advance_days >= 0
    ),

  constraint space_booking_rules_buffer_before_check
    check (
      buffer_before_minutes >= 0
    ),

  constraint space_booking_rules_buffer_after_check
    check (
      buffer_after_minutes >= 0
    )
);

comment on table public.space_booking_rules is
  'Current booking and operational rules for one reservable space.';

comment on column public.space_booking_rules.buffer_before_minutes is
  'Operational setup buffer later included in the reservation blocked period.';

comment on column public.space_booking_rules.buffer_after_minutes is
  'Operational teardown buffer later included in the reservation blocked period.';


create trigger set_space_booking_rules_updated_at
before update on public.space_booking_rules
for each row
execute function private.set_updated_at();


alter table public.space_booking_rules enable row level security;