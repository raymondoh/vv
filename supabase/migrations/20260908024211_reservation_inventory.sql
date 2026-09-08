-- VV Production Database
-- Migration 0010: reservation inventory
--
-- booking_space_allocations is the source of truth for reserved inventory.
--
-- Booking requests do not create allocations.
-- Host approval creates a held allocation.
-- Successful deposit payment converts the allocation to confirmed.
-- Expired/cancelled holds cease to block inventory.

-- ===========================================================================
-- booking_space_allocations
-- ===========================================================================

create table public.booking_space_allocations (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  booking_item_id uuid not null
    references public.booking_items(id)
    on delete restrict,

  space_id uuid not null
    references public.spaces(id)
    on delete restrict,

  allocation_status text not null default 'held',

  reserved_from timestamptz not null,
  reserved_until timestamptz not null,

  -- Operational reservation range. This may include setup/turnaround buffers
  -- outside the customer's booking-item event period.
  reserved_during tstzrange
    generated always as (
      tstzrange(
        reserved_from,
        reserved_until,
        '[)'
      )
    ) stored,

  -- Every allocation originates from an approval hold, even if it later
  -- becomes confirmed.
  hold_expires_at timestamptz not null,

  confirmed_at timestamptz null,
  expired_at timestamptz null,
  released_at timestamptz null,

  release_reason text null,

  created_at timestamptz not null default now(),

  constraint booking_space_allocations_status_check
    check (
      allocation_status in (
        'held',
        'confirmed',
        'expired',
        'released'
      )
    ),

  constraint booking_space_allocations_period_check
    check (
      reserved_until > reserved_from
    ),

  constraint booking_space_allocations_hold_expiry_check
    check (
      hold_expires_at > created_at
    ),

  constraint booking_space_allocations_state_check
    check (
      (
        allocation_status = 'held'
        and confirmed_at is null
        and expired_at is null
        and released_at is null
      )
      or
      (
        allocation_status = 'confirmed'
        and confirmed_at is not null
        and expired_at is null
        and released_at is null
      )
      or
      (
        allocation_status = 'expired'
        and confirmed_at is null
        and expired_at is not null
        and released_at is null
      )
      or
      (
        allocation_status = 'released'
        and expired_at is null
        and released_at is not null
      )
    ),

  constraint booking_space_allocations_expired_after_hold_check
    check (
      expired_at is null
      or expired_at >= hold_expires_at
    ),

  constraint booking_space_allocations_confirmed_timestamp_check
    check (
      confirmed_at is null
      or confirmed_at >= created_at
    ),

  constraint booking_space_allocations_released_timestamp_check
    check (
      released_at is null
      or released_at >= created_at
    ),

  constraint booking_space_allocations_release_after_confirmation_check
    check (
      released_at is null
      or confirmed_at is null
      or released_at >= confirmed_at
    ),

  constraint booking_space_allocations_release_reason_check
    check (
      release_reason is null
      or (
        allocation_status = 'released'
        and char_length(trim(release_reason)) between 1 and 500
      )
    )
);

comment on table public.booking_space_allocations is
  'Authoritative reservation inventory for venue spaces. Only held and confirmed allocations block competing bookings.';

comment on column public.booking_space_allocations.reserved_during is
  'Half-open operational reservation period [reserved_from, reserved_until), which may include setup/turnaround buffers.';

comment on column public.booking_space_allocations.hold_expires_at is
  'Historical expiry time of the approval hold from which this allocation originated.';


-- ===========================================================================
-- Allocation context validation
-- ===========================================================================
--
-- Ensures:
--   allocation booking == booking item's booking
--   allocation space   == booking item's space
--   allocation period fully contains the booking item's event period

create or replace function private.validate_booking_space_allocation_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_booking_id uuid;
  item_space_id uuid;
  item_event_period tstzrange;

  proposed_reserved_during tstzrange;
begin
  select
    bi.booking_id,
    bi.space_id,
    bi.event_period
  into
    item_booking_id,
    item_space_id,
    item_event_period
  from public.booking_items as bi
  where bi.id = new.booking_item_id;

  if item_booking_id is null then
    raise exception
      'Booking item % does not exist',
      new.booking_item_id;
  end if;

  if item_booking_id <> new.booking_id then
    raise exception
      'Allocation booking does not match booking item booking'
      using errcode = '23514';
  end if;

  if item_space_id <> new.space_id then
    raise exception
      'Allocation space does not match booking item space'
      using errcode = '23514';
  end if;

  -- BEFORE trigger: calculate directly rather than relying on the generated
  -- reserved_during column.
  proposed_reserved_during :=
    tstzrange(
      new.reserved_from,
      new.reserved_until,
      '[)'
    );

  if not (item_event_period <@ proposed_reserved_during) then
    raise exception
      'Allocation period must contain booking item event period'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_space_allocation_context()
  from public, anon, authenticated;


create trigger validate_booking_space_allocation_context
before insert on public.booking_space_allocations
for each row
execute function private.validate_booking_space_allocation_context();


-- ===========================================================================
-- Controlled allocation lifecycle
-- ===========================================================================
--
-- Identity, space and reservation period are immutable once created.
-- Releasing an allocation never rewrites its historical reservation window.
--
-- Allowed transitions:
--
--   held      -> confirmed
--   held      -> expired
--   held      -> released
--   confirmed -> released
--
-- expired/released are terminal.

create or replace function private.validate_booking_space_allocation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_id is distinct from old.booking_id
     or new.booking_item_id is distinct from old.booking_item_id
     or new.space_id is distinct from old.space_id
     or new.reserved_from is distinct from old.reserved_from
     or new.reserved_until is distinct from old.reserved_until
     or new.hold_expires_at is distinct from old.hold_expires_at
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Allocation identity, reservation period and hold expiry are immutable'
      using errcode = '55000';
  end if;

  if new.allocation_status is not distinct from old.allocation_status then
    raise exception
      'Allocation update must perform a lifecycle status transition'
      using errcode = '55000';
  end if;

  if not (
    (
      old.allocation_status = 'held'
      and new.allocation_status in (
        'confirmed',
        'expired',
        'released'
      )
    )
    or
    (
      old.allocation_status = 'confirmed'
      and new.allocation_status = 'released'
    )
  ) then
    raise exception
      'Invalid allocation status transition: % -> %',
      old.allocation_status,
      new.allocation_status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_booking_space_allocation_update()
  from public, anon, authenticated;


create trigger validate_booking_space_allocation_update
before update on public.booking_space_allocations
for each row
execute function private.validate_booking_space_allocation_update();


-- ===========================================================================
-- Double-booking prevention
-- ===========================================================================
--
-- PostgreSQL itself prevents two active allocations from overlapping for the
-- same space.
--
-- Historical expired/released allocations do not participate.

alter table public.booking_space_allocations
  add constraint booking_space_allocations_no_active_overlap
  exclude using gist (
    space_id with =,
    reserved_during with &&
  )
  where (
    allocation_status in (
      'held',
      'confirmed'
    )
  );


-- Explicitly prevent more than one active allocation for the same booking
-- item as well.

create unique index booking_space_allocations_one_active_per_item_idx
  on public.booking_space_allocations (
    booking_item_id
  )
  where allocation_status in (
    'held',
    'confirmed'
  );


-- ===========================================================================
-- Supporting indexes
-- ===========================================================================

create index booking_space_allocations_booking_idx
  on public.booking_space_allocations (
    booking_id
  );

create index booking_space_allocations_item_idx
  on public.booking_space_allocations (
    booking_item_id
  );

create index booking_space_allocations_space_start_idx
  on public.booking_space_allocations (
    space_id,
    reserved_from
  );

-- Useful to the future hold-expiry worker.

create index booking_space_allocations_held_expiry_idx
  on public.booking_space_allocations (
    hold_expires_at
  )
  where allocation_status = 'held';


alter table public.booking_space_allocations enable row level security;


-- ===========================================================================
-- Protect booking-item/allocation consistency
-- ===========================================================================
--
-- Once allocations exist, a booking item cannot simply be moved to another
-- booking or another space. Doing so would invalidate historical reservation
-- inventory.

create or replace function private.protect_allocated_booking_item_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.booking_id is distinct from old.booking_id
    or new.space_id is distinct from old.space_id
  )
  and exists (
    select 1
    from public.booking_space_allocations as a
    where a.booking_item_id = old.id
  )
  then
    raise exception
      'Booking item with reservation allocations cannot change booking or space'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_allocated_booking_item_identity()
  from public, anon, authenticated;


create trigger protect_allocated_booking_item_identity
before update of
  booking_id,
  space_id
on public.booking_items
for each row
execute function private.protect_allocated_booking_item_identity();


-- If the booking-item event period changes, every existing allocation for that
-- item must still contain the proposed event period.

create or replace function private.validate_allocated_booking_item_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposed_event_period tstzrange;
begin
  proposed_event_period :=
    tstzrange(
      new.item_starts_at,
      new.item_ends_at,
      '[)'
    );

  if exists (
    select 1
    from public.booking_space_allocations as a
    where a.booking_item_id = new.id
      and not (proposed_event_period <@ a.reserved_during)
  ) then
    raise exception
      'Booking item period cannot extend outside an existing reservation allocation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_allocated_booking_item_period()
  from public, anon, authenticated;


create trigger validate_allocated_booking_item_period
before update of
  item_starts_at,
  item_ends_at
on public.booking_items
for each row
execute function private.validate_allocated_booking_item_period();