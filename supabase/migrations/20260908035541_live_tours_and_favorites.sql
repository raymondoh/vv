-- VV Production Database
-- Migration 0012: live tours and favorites
--
-- Introduces:
--   user_favorite_venues
--   live_tour_slots
--   live_tour_appointments


-- ===========================================================================
-- user_favorite_venues
-- ===========================================================================
--
-- Simple many-to-many relationship between users and venues.
-- The composite primary key makes duplicate favorites impossible.

create table public.user_favorite_venues (
  user_id uuid not null
    references public.user_profiles(id)
    on delete cascade,

  venue_id uuid not null
    references public.venues(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  primary key (
    user_id,
    venue_id
  )
);

comment on table public.user_favorite_venues is
  'Venues saved by VV users.';


create index user_favorite_venues_venue_idx
  on public.user_favorite_venues (
    venue_id
  );


alter table public.user_favorite_venues enable row level security;


-- ===========================================================================
-- live_tour_slots
-- ===========================================================================
--
-- A venue publishes bookable periods for live walkthroughs.
--
-- Multiple slots at the same venue may overlap if different staff members are
-- available. One assigned host, however, cannot have overlapping active slots.

create table public.live_tour_slots (
  id uuid primary key default gen_random_uuid(),

  venue_id uuid not null
    references public.venues(id)
    on delete cascade,

  assigned_host_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  slot_period tstzrange
    generated always as (
      tstzrange(
        starts_at,
        ends_at,
        '[)'
      )
    ) stored,

  status text not null default 'open',

  host_notes text null,

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  cancelled_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint live_tour_slots_period_check
    check (
      ends_at > starts_at
    ),

  constraint live_tour_slots_status_check
    check (
      status in (
        'open',
        'cancelled'
      )
    ),

  constraint live_tour_slots_state_check
    check (
      (
        status = 'open'
        and cancelled_at is null
      )
      or
      (
        status = 'cancelled'
        and cancelled_at is not null
      )
    ),

  constraint live_tour_slots_host_notes_check
    check (
      host_notes is null
      or char_length(trim(host_notes)) between 1 and 2000
    ),

  constraint live_tour_slots_cancelled_timestamp_check
    check (
      cancelled_at is null
      or cancelled_at >= created_at
    )
);

comment on table public.live_tour_slots is
  'Venue availability slots for customer live walkthrough appointments.';

comment on column public.live_tour_slots.slot_period is
  'Generated half-open live-tour period [starts_at, ends_at).';


create index live_tour_slots_venue_start_idx
  on public.live_tour_slots (
    venue_id,
    starts_at
  );

create index live_tour_slots_open_start_idx
  on public.live_tour_slots (
    starts_at
  )
  where status = 'open';


-- One assigned host cannot be advertised for two overlapping open slots.

alter table public.live_tour_slots
  add constraint live_tour_slots_no_host_overlap
  exclude using gist (
    assigned_host_user_id with =,
    slot_period with &&
  )
  where (
    status = 'open'
    and assigned_host_user_id is not null
  );


create trigger set_live_tour_slots_updated_at
before update on public.live_tour_slots
for each row
execute function private.set_updated_at();


alter table public.live_tour_slots enable row level security;


-- ===========================================================================
-- Validate assigned host
-- ===========================================================================
--
-- If a host is assigned, that user must currently be an active member of the
-- organisation that owns the venue.

create or replace function private.validate_live_tour_slot_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  venue_organization_id uuid;
begin
  if new.assigned_host_user_id is null then
    return new;
  end if;

  select v.organization_id
    into venue_organization_id
  from public.venues as v
  where v.id = new.venue_id;

  if venue_organization_id is null then
    raise exception
      'Venue % does not exist',
      new.venue_id;
  end if;

  if not exists (
    select 1
    from public.organization_memberships as m
    where m.organization_id = venue_organization_id
      and m.user_id = new.assigned_host_user_id
      and m.status = 'active'
  ) then
    raise exception
      'Assigned live-tour host is not an active member of the venue organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_live_tour_slot_host()
  from public, anon, authenticated;


create trigger validate_live_tour_slot_host
before insert or update of
  venue_id,
  assigned_host_user_id
on public.live_tour_slots
for each row
execute function private.validate_live_tour_slot_host();


-- ===========================================================================
-- live_tour_appointments
-- ===========================================================================
--
-- A cancelled appointment releases the slot so another customer can schedule
-- it. Completed/no-show appointments remain historical occupants of the slot.

create table public.live_tour_appointments (
  id uuid primary key default gen_random_uuid(),

  live_tour_slot_id uuid not null
    references public.live_tour_slots(id)
    on delete restrict,

  customer_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  -- Optional link if the walkthrough later relates to an existing booking.
  booking_id uuid null
    references public.bookings(id)
    on delete restrict,

  appointment_status text not null default 'scheduled',

  customer_message text null,

  customer_snapshot jsonb not null default '{}'::jsonb,

  cancellation_reason text null,

  completed_at timestamptz null,
  cancelled_at timestamptz null,
  no_show_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint live_tour_appointments_status_check
    check (
      appointment_status in (
        'scheduled',
        'completed',
        'cancelled',
        'no_show'
      )
    ),

  constraint live_tour_appointments_customer_message_check
    check (
      customer_message is null
      or char_length(trim(customer_message)) between 1 and 2000
    ),

  constraint live_tour_appointments_snapshot_check
    check (
      jsonb_typeof(customer_snapshot) = 'object'
    ),

  constraint live_tour_appointments_cancellation_reason_check
    check (
      cancellation_reason is null
      or (
        appointment_status = 'cancelled'
        and char_length(trim(cancellation_reason)) between 1 and 1000
      )
    ),

  constraint live_tour_appointments_state_check
    check (
      (
        appointment_status = 'scheduled'
        and completed_at is null
        and cancelled_at is null
        and no_show_at is null
      )
      or
      (
        appointment_status = 'completed'
        and completed_at is not null
        and cancelled_at is null
        and no_show_at is null
      )
      or
      (
        appointment_status = 'cancelled'
        and completed_at is null
        and cancelled_at is not null
        and no_show_at is null
      )
      or
      (
        appointment_status = 'no_show'
        and completed_at is null
        and cancelled_at is null
        and no_show_at is not null
      )
    ),

  constraint live_tour_appointments_completed_timestamp_check
    check (
      completed_at is null
      or completed_at >= created_at
    ),

  constraint live_tour_appointments_cancelled_timestamp_check
    check (
      cancelled_at is null
      or cancelled_at >= created_at
    ),

  constraint live_tour_appointments_no_show_timestamp_check
    check (
      no_show_at is null
      or no_show_at >= created_at
    )
);

comment on table public.live_tour_appointments is
  'Customer appointments against published venue live-tour slots.';

comment on column public.live_tour_appointments.customer_snapshot is
  'Booking-time customer identity/contact snapshot retained if the account link later disappears.';


-- At most one non-cancelled appointment may occupy a slot.

create unique index live_tour_appointments_one_active_per_slot_uidx
  on public.live_tour_appointments (
    live_tour_slot_id
  )
  where appointment_status in (
    'scheduled',
    'completed',
    'no_show'
  );


create index live_tour_appointments_customer_idx
  on public.live_tour_appointments (
    customer_user_id,
    created_at desc
  )
  where customer_user_id is not null;

create index live_tour_appointments_booking_idx
  on public.live_tour_appointments (
    booking_id
  )
  where booking_id is not null;


create trigger set_live_tour_appointments_updated_at
before update on public.live_tour_appointments
for each row
execute function private.set_updated_at();


alter table public.live_tour_appointments enable row level security;


-- ===========================================================================
-- Appointment context validation
-- ===========================================================================
--
-- Ensures:
--   new appointments are attached only to open slots
--   a real customer exists when the appointment is first created
--   optional booking belongs to the same venue
--   optional booking belongs to the same customer when that account link exists

create or replace function private.validate_live_tour_appointment_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  slot_venue_id uuid;
  slot_status text;

  booking_venue_id uuid;
  booking_customer_user_id uuid;
begin
  select
    s.venue_id,
    s.status
  into
    slot_venue_id,
    slot_status
  from public.live_tour_slots as s
  where s.id = new.live_tour_slot_id;

  if slot_venue_id is null then
    raise exception
      'Live-tour slot % does not exist',
      new.live_tour_slot_id;
  end if;

  if tg_op = 'INSERT' and new.customer_user_id is null then
    raise exception
      'Live-tour appointment requires a customer user'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and slot_status <> 'open' then
    raise exception
      'Cannot schedule an appointment against a cancelled live-tour slot'
      using errcode = '23514';
  end if;

  if new.booking_id is not null then
    select
      b.venue_id,
      b.customer_user_id
    into
      booking_venue_id,
      booking_customer_user_id
    from public.bookings as b
    where b.id = new.booking_id;

    if booking_venue_id is null then
      raise exception
        'Booking % does not exist',
        new.booking_id;
    end if;

    if booking_venue_id <> slot_venue_id then
      raise exception
        'Live-tour appointment booking does not belong to slot venue'
        using errcode = '23514';
    end if;

    if booking_customer_user_id is not null
       and new.customer_user_id is not null
       and booking_customer_user_id <> new.customer_user_id
    then
      raise exception
        'Live-tour appointment customer does not match booking customer'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_live_tour_appointment_context()
  from public, anon, authenticated;


create trigger validate_live_tour_appointment_context
before insert or update of
  live_tour_slot_id,
  customer_user_id,
  booking_id
on public.live_tour_appointments
for each row
execute function private.validate_live_tour_appointment_context();


-- ===========================================================================
-- Appointment lifecycle
-- ===========================================================================
--
-- scheduled -> completed
-- scheduled -> cancelled
-- scheduled -> no_show
--
-- Terminal appointment states are not reopened. A cancelled slot can instead
-- receive a new appointment row, preserving the old cancellation history.

create or replace function private.validate_live_tour_appointment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.live_tour_slot_id is distinct from old.live_tour_slot_id
     or new.booking_id is distinct from old.booking_id
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Live-tour appointment slot, booking and creation time are immutable'
      using errcode = '55000';
  end if;

  if new.appointment_status is distinct from old.appointment_status then
    if not (
      old.appointment_status = 'scheduled'
      and new.appointment_status in (
        'completed',
        'cancelled',
        'no_show'
      )
    ) then
      raise exception
        'Invalid live-tour appointment status transition: % -> %',
        old.appointment_status,
        new.appointment_status
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_live_tour_appointment_update()
  from public, anon, authenticated;


create trigger validate_live_tour_appointment_update
before update on public.live_tour_appointments
for each row
execute function private.validate_live_tour_appointment_update();


-- ===========================================================================
-- Protect live-tour slots that already have appointments
-- ===========================================================================

create or replace function private.validate_live_tour_slot_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.venue_id is distinct from old.venue_id then
    raise exception
      'Live-tour slot venue is immutable'
      using errcode = '55000';
  end if;

  if (
    new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
  )
  and exists (
    select 1
    from public.live_tour_appointments as a
    where a.live_tour_slot_id = old.id
      and a.appointment_status <> 'cancelled'
  )
  then
    raise exception
      'Live-tour slot time cannot change while it has a non-cancelled appointment'
      using errcode = '55000';
  end if;

  if new.status is distinct from old.status then
    if not (
      old.status = 'open'
      and new.status = 'cancelled'
    ) then
      raise exception
        'Invalid live-tour slot status transition: % -> %',
        old.status,
        new.status
        using errcode = '23514';
    end if;

    if new.status = 'cancelled'
       and exists (
         select 1
         from public.live_tour_appointments as a
         where a.live_tour_slot_id = old.id
           and a.appointment_status <> 'cancelled'
       )
    then
      raise exception
        'Cancel the live-tour appointment before cancelling its slot'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_live_tour_slot_update()
  from public, anon, authenticated;


create trigger validate_live_tour_slot_update
before update on public.live_tour_slots
for each row
execute function private.validate_live_tour_slot_update();