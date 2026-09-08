-- VV Production Database
-- Migration 0009: booking core
--
-- Introduces:
--   bookings
--   booking_items
--   booking_price_lines
--   booking_payment_schedule
--   booking_status_history

-- ===========================================================================
-- bookings
-- ===========================================================================

create table public.bookings (
  id uuid primary key default gen_random_uuid(),

  booking_reference text not null,

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  venue_id uuid not null
    references public.venues(id)
    on delete restrict,

  customer_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  booking_status text not null default 'requested',
  payment_status text not null default 'unpaid',

  event_starts_at timestamptz not null,
  event_ends_at timestamptz not null,

  event_period tstzrange
    generated always as (
      tstzrange(
        event_starts_at,
        event_ends_at,
        '[)'
      )
    ) stored,

  event_type text null,
  guest_count integer null,

  currency_code text not null,

  commercial_term_version_id uuid not null
    references public.organization_commercial_term_versions(id)
    on delete restrict,

  -- Typed booking-time snapshot of the commission rate.
  commission_bps integer not null,

  customer_total_minor bigint not null,
  marketplace_commission_minor bigint not null,
  venue_net_before_fees_minor bigint not null,

  hold_expires_at timestamptz null,

  -- Historical snapshots.
  customer_snapshot jsonb not null,
  venue_snapshot jsonb not null,
  commercial_terms_snapshot jsonb not null,
  booking_request_snapshot jsonb not null default '{}'::jsonb,

  submitted_at timestamptz not null default now(),

  approved_at timestamptz null,
  confirmed_at timestamptz null,
  declined_at timestamptz null,
  cancelled_at timestamptz null,
  completed_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_reference_unique
    unique (booking_reference),

  constraint bookings_reference_check
    check (
      char_length(trim(booking_reference)) between 6 and 80
    ),

  constraint bookings_status_check
    check (
      booking_status in (
        'requested',
        'approved_hold',
        'hold_expired',
        'confirmed',
        'declined',
        'cancelled',
        'completed'
      )
    ),

  constraint bookings_payment_status_check
    check (
      payment_status in (
        'unpaid',
        'partially_paid',
        'paid',
        'partially_refunded',
        'refunded'
      )
    ),

  constraint bookings_event_period_check
    check (
      event_ends_at > event_starts_at
    ),

  constraint bookings_guest_count_check
    check (
      guest_count is null
      or guest_count > 0
    ),

  constraint bookings_currency_check
    check (
      currency_code ~ '^[A-Z]{3}$'
    ),

  constraint bookings_commission_bps_check
    check (
      commission_bps between 0 and 10000
    ),

  constraint bookings_customer_total_check
    check (
      customer_total_minor >= 0
    ),

  constraint bookings_commission_amount_check
    check (
      marketplace_commission_minor >= 0
      and marketplace_commission_minor <= customer_total_minor
    ),

  constraint bookings_venue_net_check
    check (
      venue_net_before_fees_minor >= 0
      and venue_net_before_fees_minor =
        customer_total_minor - marketplace_commission_minor
    ),

  constraint bookings_customer_snapshot_check
    check (
      jsonb_typeof(customer_snapshot) = 'object'
    ),

  constraint bookings_venue_snapshot_check
    check (
      jsonb_typeof(venue_snapshot) = 'object'
    ),

  constraint bookings_commercial_terms_snapshot_check
    check (
      jsonb_typeof(commercial_terms_snapshot) = 'object'
    ),

  constraint bookings_request_snapshot_check
    check (
      jsonb_typeof(booking_request_snapshot) = 'object'
    ),

  -- Status-specific minimum evidence.
  constraint bookings_approved_hold_state_check
    check (
      booking_status <> 'approved_hold'
      or (
        approved_at is not null
        and hold_expires_at is not null
      )
    ),

  constraint bookings_hold_expired_state_check
    check (
      booking_status <> 'hold_expired'
      or hold_expires_at is not null
    ),

  constraint bookings_confirmed_state_check
    check (
      booking_status <> 'confirmed'
      or confirmed_at is not null
    ),

  constraint bookings_declined_state_check
    check (
      booking_status <> 'declined'
      or declined_at is not null
    ),

  constraint bookings_cancelled_state_check
    check (
      booking_status <> 'cancelled'
      or cancelled_at is not null
    ),

  constraint bookings_completed_state_check
    check (
      booking_status <> 'completed'
      or (
        confirmed_at is not null
        and completed_at is not null
      )
    ),

  constraint bookings_approved_timestamp_check
    check (
      approved_at is null
      or approved_at >= submitted_at
    ),

  constraint bookings_confirmed_timestamp_check
    check (
      confirmed_at is null
      or confirmed_at >= submitted_at
    ),

  constraint bookings_declined_timestamp_check
    check (
      declined_at is null
      or declined_at >= submitted_at
    ),

  constraint bookings_cancelled_timestamp_check
    check (
      cancelled_at is null
      or cancelled_at >= submitted_at
    ),

  constraint bookings_completed_timestamp_check
    check (
      completed_at is null
      or completed_at >= submitted_at
    ),

  constraint bookings_completed_after_confirmation_check
    check (
      completed_at is null
      or confirmed_at is null
      or completed_at >= confirmed_at
    ),

  constraint bookings_hold_after_approval_check
    check (
      hold_expires_at is null
      or approved_at is null
      or hold_expires_at > approved_at
    )
);

comment on table public.bookings is
  'Commercial booking record for one venue. A booking may contain multiple booking_items/spaces.';

comment on column public.bookings.customer_user_id is
  'Current VV account link. May become NULL after account deletion; customer_snapshot preserves booking-time identity.';

comment on column public.bookings.commission_bps is
  'Immutable booking-time VV commission snapshot in basis points.';

comment on column public.bookings.customer_total_minor is
  'Total amount payable by the customer in integer minor currency units.';

comment on column public.bookings.marketplace_commission_minor is
  'VV commission deducted from the venue side, never an extra customer fee.';

comment on column public.bookings.event_period is
  'Generated half-open overall booking event range [event_starts_at, event_ends_at).';


create index bookings_customer_created_idx
  on public.bookings (
    customer_user_id,
    created_at desc
  )
  where customer_user_id is not null;

create index bookings_org_status_idx
  on public.bookings (
    organization_id,
    booking_status
  );

create index bookings_venue_event_start_idx
  on public.bookings (
    venue_id,
    event_starts_at
  );

create index bookings_payment_status_idx
  on public.bookings (
    payment_status
  );


create trigger set_bookings_updated_at
before update on public.bookings
for each row
execute function private.set_updated_at();


alter table public.bookings enable row level security;


-- ===========================================================================
-- booking_items
-- ===========================================================================
--
-- One booking belongs to one venue but may contain several spaces.
--
-- The item records the selected space/layout/rate-plan references while the
-- JSON snapshot preserves the selected configuration as it existed at booking
-- time.

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  space_id uuid not null
    references public.spaces(id)
    on delete restrict,

  space_layout_id uuid null
    references public.space_layouts(id)
    on delete restrict,

  rate_plan_id uuid null
    references public.space_rate_plans(id)
    on delete restrict,

  item_starts_at timestamptz not null,
  item_ends_at timestamptz not null,

  event_period tstzrange
    generated always as (
      tstzrange(
        item_starts_at,
        item_ends_at,
        '[)'
      )
    ) stored,

  selection_snapshot jsonb not null,

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  constraint booking_items_period_check
    check (
      item_ends_at > item_starts_at
    ),

  constraint booking_items_snapshot_check
    check (
      jsonb_typeof(selection_snapshot) = 'object'
    ),

  constraint booking_items_sort_order_check
    check (
      sort_order >= 0
    )
);

comment on table public.booking_items is
  'Selected reservable spaces/configurations belonging to one booking.';

comment on column public.booking_items.selection_snapshot is
  'Immutable booking-time snapshot of the selected space/layout/rate/rules configuration.';


create index booking_items_booking_sort_idx
  on public.booking_items (
    booking_id,
    sort_order
  );

create index booking_items_space_start_idx
  on public.booking_items (
    space_id,
    item_starts_at
  );


alter table public.booking_items enable row level security;


-- ===========================================================================
-- Validate booking commercial context
-- ===========================================================================
--
-- Ensures:
--   booking organization == venue organization
--   commercial term belongs to that organization
--   commission snapshot == referenced commercial term
--   booking currency == venue currency
--   commercial term is effective at submission time

create or replace function private.validate_booking_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  venue_organization_id uuid;
  venue_currency_code text;

  term_organization_id uuid;
  term_commission_bps integer;
  term_effective_during tstzrange;

  proposed_event_period tstzrange;
begin
  select
    v.organization_id,
    v.default_currency_code
  into
    venue_organization_id,
    venue_currency_code
  from public.venues as v
  where v.id = new.venue_id;

  if venue_organization_id is null then
    raise exception
      'Venue % does not exist',
      new.venue_id;
  end if;

  if new.organization_id <> venue_organization_id then
    raise exception
      'Booking organization does not match venue organization'
      using errcode = '23514';
  end if;

  if new.currency_code <> venue_currency_code then
    raise exception
      'Booking currency does not match venue currency'
      using errcode = '23514';
  end if;

  select
    t.organization_id,
    t.commission_bps,
    t.effective_during
  into
    term_organization_id,
    term_commission_bps,
    term_effective_during
  from public.organization_commercial_term_versions as t
  where t.id = new.commercial_term_version_id;

  if term_organization_id is null then
    raise exception
      'Commercial term version % does not exist',
      new.commercial_term_version_id;
  end if;

  if term_organization_id <> new.organization_id then
    raise exception
      'Commercial term version does not belong to booking organization'
      using errcode = '23514';
  end if;

  if term_commission_bps <> new.commission_bps then
    raise exception
      'Booking commission snapshot does not match commercial term version'
      using errcode = '23514';
  end if;

  if not (term_effective_during @> new.submitted_at) then
    raise exception
      'Commercial term version is not effective at booking submission time'
      using errcode = '23514';
  end if;

  -- If an existing booking's overall period changes, all current booking
  -- items must remain inside the new overall booking period.
  if tg_op = 'UPDATE'
     and (
       new.event_starts_at is distinct from old.event_starts_at
       or new.event_ends_at is distinct from old.event_ends_at
     )
  then
    proposed_event_period :=
      tstzrange(
        new.event_starts_at,
        new.event_ends_at,
        '[)'
      );

    if exists (
      select 1
      from public.booking_items as bi
      where bi.booking_id = new.id
        and not (bi.event_period <@ proposed_event_period)
    ) then
      raise exception
        'Booking period cannot exclude an existing booking item'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_context()
  from public, anon, authenticated;


create trigger validate_booking_context
before insert or update of
  organization_id,
  venue_id,
  currency_code,
  commercial_term_version_id,
  commission_bps,
  submitted_at,
  event_starts_at,
  event_ends_at
on public.bookings
for each row
execute function private.validate_booking_context();


-- ===========================================================================
-- Validate booking item context
-- ===========================================================================
--
-- Ensures:
--   selected space belongs to booking venue
--   selected layout belongs to selected space
--   selected rate plan belongs to selected space
--   rate-plan currency matches booking currency
--   item period sits inside the booking's overall event period

create or replace function private.validate_booking_item_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_venue_id uuid;
  booking_currency_code text;
  booking_event_period tstzrange;

  space_venue_id uuid;

  layout_space_id uuid;

  rate_plan_space_id uuid;
  rate_plan_currency_code text;

  proposed_item_period tstzrange;
begin
  select
    b.venue_id,
    b.currency_code,
    b.event_period
  into
    booking_venue_id,
    booking_currency_code,
    booking_event_period
  from public.bookings as b
  where b.id = new.booking_id;

  if booking_venue_id is null then
    raise exception
      'Booking % does not exist',
      new.booking_id;
  end if;

  select s.venue_id
    into space_venue_id
  from public.spaces as s
  where s.id = new.space_id;

  if space_venue_id is null then
    raise exception
      'Space % does not exist',
      new.space_id;
  end if;

  if space_venue_id <> booking_venue_id then
    raise exception
      'Booking item space does not belong to booking venue'
      using errcode = '23514';
  end if;

  if new.space_layout_id is not null then
    select l.space_id
      into layout_space_id
    from public.space_layouts as l
    where l.id = new.space_layout_id;

    if layout_space_id is null then
      raise exception
        'Space layout % does not exist',
        new.space_layout_id;
    end if;

    if layout_space_id <> new.space_id then
      raise exception
        'Booking item layout does not belong to selected space'
        using errcode = '23514';
    end if;
  end if;

  if new.rate_plan_id is not null then
    select
      rp.space_id,
      rp.currency_code
    into
      rate_plan_space_id,
      rate_plan_currency_code
    from public.space_rate_plans as rp
    where rp.id = new.rate_plan_id;

    if rate_plan_space_id is null then
      raise exception
        'Rate plan % does not exist',
        new.rate_plan_id;
    end if;

    if rate_plan_space_id <> new.space_id then
      raise exception
        'Booking item rate plan does not belong to selected space'
        using errcode = '23514';
    end if;

    if rate_plan_currency_code <> booking_currency_code then
      raise exception
        'Booking item rate-plan currency does not match booking currency'
        using errcode = '23514';
    end if;
  end if;

  -- BEFORE triggers cannot safely rely on the generated event_period.
  proposed_item_period :=
    tstzrange(
      new.item_starts_at,
      new.item_ends_at,
      '[)'
    );

  if not (proposed_item_period <@ booking_event_period) then
    raise exception
      'Booking item period must fall within booking event period'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_item_context()
  from public, anon, authenticated;


create trigger validate_booking_item_context
before insert or update of
  booking_id,
  space_id,
  space_layout_id,
  rate_plan_id,
  item_starts_at,
  item_ends_at
on public.booking_items
for each row
execute function private.validate_booking_item_context();


-- ===========================================================================
-- booking_price_lines
-- ===========================================================================
--
-- Price lines are the immutable commercial composition of the booking.
--
-- amount_minor is signed:
--
--   positive customer space charge
--   negative customer discount
--   positive venue commission
--
-- The customer never receives a VV commission line.

create table public.booking_price_lines (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  booking_item_id uuid null
    references public.booking_items(id)
    on delete restrict,

  sequence integer not null,

  line_type text not null,
  payer text not null,

  description text not null,

  amount_minor bigint not null,
  currency_code text not null,

  calculation_snapshot jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint booking_price_lines_sequence_check
    check (
      sequence > 0
    ),

  constraint booking_price_lines_type_check
    check (
      line_type in (
        'space_charge',
        'surcharge',
        'discount',
        'tax',
        'commission',
        'adjustment'
      )
    ),

  constraint booking_price_lines_payer_check
    check (
      payer in (
        'customer',
        'venue'
      )
    ),

  -- VV commission is always taken from the venue side.
  constraint booking_price_lines_commission_payer_check
    check (
      line_type <> 'commission'
      or payer = 'venue'
    ),

  constraint booking_price_lines_description_check
    check (
      char_length(trim(description)) between 1 and 500
    ),

  constraint booking_price_lines_currency_check
    check (
      currency_code ~ '^[A-Z]{3}$'
    ),

  constraint booking_price_lines_calculation_snapshot_check
    check (
      jsonb_typeof(calculation_snapshot) = 'object'
    ),

  constraint booking_price_lines_booking_sequence_unique
    unique (
      booking_id,
      sequence
    )
);

comment on table public.booking_price_lines is
  'Immutable booking-time pricing lines forming the commercial price ledger.';

comment on column public.booking_price_lines.amount_minor is
  'Signed amount in integer minor units.';

comment on column public.booking_price_lines.payer is
  'Party whose booking ledger the line affects: customer or venue.';


create index booking_price_lines_booking_idx
  on public.booking_price_lines (
    booking_id,
    sequence
  );

create index booking_price_lines_item_idx
  on public.booking_price_lines (
    booking_item_id
  )
  where booking_item_id is not null;


alter table public.booking_price_lines enable row level security;


-- Validate that price-line currency and optional booking item belong to the
-- same booking.

create or replace function private.validate_booking_price_line_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_currency_code text;
  item_booking_id uuid;
begin
  select b.currency_code
    into booking_currency_code
  from public.bookings as b
  where b.id = new.booking_id;

  if booking_currency_code is null then
    raise exception
      'Booking % does not exist',
      new.booking_id;
  end if;

  if new.currency_code <> booking_currency_code then
    raise exception
      'Price-line currency does not match booking currency'
      using errcode = '23514';
  end if;

  if new.booking_item_id is not null then
    select bi.booking_id
      into item_booking_id
    from public.booking_items as bi
    where bi.id = new.booking_item_id;

    if item_booking_id is null then
      raise exception
        'Booking item % does not exist',
        new.booking_item_id;
    end if;

    if item_booking_id <> new.booking_id then
      raise exception
        'Price line booking item does not belong to booking'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_price_line_context()
  from public, anon, authenticated;


create trigger validate_booking_price_line_context
before insert on public.booking_price_lines
for each row
execute function private.validate_booking_price_line_context();


-- ===========================================================================
-- booking_payment_schedule
-- ===========================================================================

create table public.booking_payment_schedule (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  sequence smallint not null,

  installment_type text not null,

  amount_minor bigint not null,
  currency_code text not null,

  due_at timestamptz null,

  status text not null default 'pending',

  due_rule_snapshot jsonb not null default '{}'::jsonb,

  paid_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_payment_schedule_sequence_check
    check (
      sequence > 0
    ),

  constraint booking_payment_schedule_type_check
    check (
      installment_type in (
        'deposit',
        'final'
      )
    ),

  constraint booking_payment_schedule_amount_check
    check (
      amount_minor >= 0
    ),

  constraint booking_payment_schedule_currency_check
    check (
      currency_code ~ '^[A-Z]{3}$'
    ),

  constraint booking_payment_schedule_status_check
    check (
      status in (
        'pending',
        'due',
        'paid',
        'waived',
        'cancelled'
      )
    ),

  constraint booking_payment_schedule_due_rule_snapshot_check
    check (
      jsonb_typeof(due_rule_snapshot) = 'object'
    ),

  constraint booking_payment_schedule_paid_at_check
    check (
      (
        status = 'paid'
        and paid_at is not null
      )
      or
      (
        status <> 'paid'
        and paid_at is null
      )
    ),

  constraint booking_payment_schedule_due_status_check
    check (
      status <> 'due'
      or due_at is not null
    ),

  constraint booking_payment_schedule_booking_sequence_unique
    unique (
      booking_id,
      sequence
    )
);

comment on table public.booking_payment_schedule is
  'Booking installment schedule. VV v1 supports deposit and final balance.';


create index booking_payment_schedule_booking_idx
  on public.booking_payment_schedule (
    booking_id,
    sequence
  );

create index booking_payment_schedule_due_idx
  on public.booking_payment_schedule (
    due_at
  )
  where status in ('pending', 'due');


create trigger set_booking_payment_schedule_updated_at
before update on public.booking_payment_schedule
for each row
execute function private.set_updated_at();


alter table public.booking_payment_schedule enable row level security;


-- Payment-schedule currency must match its booking.

create or replace function private.validate_booking_payment_schedule_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_currency_code text;
begin
  select b.currency_code
    into booking_currency_code
  from public.bookings as b
  where b.id = new.booking_id;

  if booking_currency_code is null then
    raise exception
      'Booking % does not exist',
      new.booking_id;
  end if;

  if new.currency_code <> booking_currency_code then
    raise exception
      'Payment-schedule currency does not match booking currency'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_payment_schedule_context()
  from public, anon, authenticated;


create trigger validate_booking_payment_schedule_context
before insert or update of
  booking_id,
  currency_code
on public.booking_payment_schedule
for each row
execute function private.validate_booking_payment_schedule_context();


-- ===========================================================================
-- booking_status_history
-- ===========================================================================

create table public.booking_status_history (
  id bigint generated always as identity primary key,

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  from_status text null,
  to_status text not null,

  changed_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  reason text null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint booking_status_history_from_status_check
    check (
      from_status is null
      or from_status in (
        'requested',
        'approved_hold',
        'hold_expired',
        'confirmed',
        'declined',
        'cancelled',
        'completed'
      )
    ),

  constraint booking_status_history_to_status_check
    check (
      to_status in (
        'requested',
        'approved_hold',
        'hold_expired',
        'confirmed',
        'declined',
        'cancelled',
        'completed'
      )
    ),

  constraint booking_status_history_reason_check
    check (
      reason is null
      or char_length(trim(reason)) between 1 and 1000
    ),

  constraint booking_status_history_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
    )
);

comment on table public.booking_status_history is
  'Append-only history of booking lifecycle status changes.';


create index booking_status_history_booking_created_idx
  on public.booking_status_history (
    booking_id,
    created_at desc
  );


alter table public.booking_status_history enable row level security;


-- ===========================================================================
-- Generic append-only protection
-- ===========================================================================

create or replace function private.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'Rows in %.% are append-only and cannot be updated or deleted',
    tg_table_schema,
    tg_table_name
    using errcode = '55000';
end;
$$;

revoke all on function private.prevent_append_only_mutation()
  from public, anon, authenticated;


-- Booking price lines may only be corrected through additional adjustment
-- lines. Existing commercial lines are never rewritten.

create trigger booking_price_lines_append_only
before update or delete
on public.booking_price_lines
for each row
execute function private.prevent_append_only_mutation();


-- Status history itself is also immutable.

create trigger booking_status_history_append_only
before update or delete
on public.booking_status_history
for each row
execute function private.prevent_append_only_mutation();


-- ===========================================================================
-- Automatic booking status history
-- ===========================================================================

create or replace function private.record_booking_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_status_history (
      booking_id,
      from_status,
      to_status,
      changed_by_user_id
    )
    values (
      new.id,
      null,
      new.booking_status,
      auth.uid()
    );

  elsif new.booking_status is distinct from old.booking_status then
    insert into public.booking_status_history (
      booking_id,
      from_status,
      to_status,
      changed_by_user_id
    )
    values (
      new.id,
      old.booking_status,
      new.booking_status,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

revoke all on function private.record_booking_status_history()
  from public, anon, authenticated;


create trigger record_booking_status_history
after insert or update of booking_status
on public.bookings
for each row
execute function private.record_booking_status_history();