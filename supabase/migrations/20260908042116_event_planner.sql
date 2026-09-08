-- VV Production Database
-- Migration 0013: event planner
--
-- Introduces:
--   event_plans
--   event_plan_tasks
--   event_notes
--
-- In VV v1, an event plan belongs to one booking and therefore to the
-- customer associated with that booking.


-- ===========================================================================
-- event_plans
-- ===========================================================================

create table public.event_plans (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete restrict,

  customer_user_id uuid not null
    references public.user_profiles(id)
    on delete cascade,

  title text not null,

  status text not null default 'active',

  archived_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_plans_booking_unique
    unique (
      booking_id
    ),

  constraint event_plans_title_check
    check (
      char_length(trim(title)) between 1 and 200
    ),

  constraint event_plans_status_check
    check (
      status in (
        'active',
        'archived'
      )
    ),

  constraint event_plans_state_check
    check (
      (
        status = 'active'
        and archived_at is null
      )
      or
      (
        status = 'archived'
        and archived_at is not null
      )
    ),

  constraint event_plans_archived_timestamp_check
    check (
      archived_at is null
      or archived_at >= created_at
    )
);

comment on table public.event_plans is
  'Customer planning workspace associated with a VV booking.';

comment on column public.event_plans.customer_user_id is
  'Owner of the event planner. Must match the customer linked to the booking.';


create index event_plans_customer_idx
  on public.event_plans (
    customer_user_id,
    created_at desc
  );


create trigger set_event_plans_updated_at
before update on public.event_plans
for each row
execute function private.set_updated_at();


alter table public.event_plans enable row level security;


-- ===========================================================================
-- Validate event-plan ownership
-- ===========================================================================
--
-- A customer's planner may only be attached to that customer's booking.

create or replace function private.validate_event_plan_booking_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_customer_user_id uuid;
begin
  select b.customer_user_id
    into booking_customer_user_id
  from public.bookings as b
  where b.id = new.booking_id;

  if not found then
    raise exception
      'Booking % does not exist',
      new.booking_id;
  end if;

  if booking_customer_user_id is null then
    raise exception
      'Cannot create an event plan for a booking without a customer user'
      using errcode = '23514';
  end if;

  if booking_customer_user_id <> new.customer_user_id then
    raise exception
      'Event-plan customer does not match booking customer'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_event_plan_booking_context()
  from public, anon, authenticated;


create trigger validate_event_plan_booking_context
before insert on public.event_plans
for each row
execute function private.validate_event_plan_booking_context();


-- Booking and customer form the ownership identity of the plan and cannot
-- later be rewritten.

create or replace function private.protect_event_plan_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.booking_id is distinct from old.booking_id
     or new.customer_user_id is distinct from old.customer_user_id
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Event-plan booking, customer and creation time are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_event_plan_identity()
  from public, anon, authenticated;


create trigger protect_event_plan_identity
before update on public.event_plans
for each row
execute function private.protect_event_plan_identity();


-- ===========================================================================
-- event_plan_tasks
-- ===========================================================================
--
-- Checklist items belonging to the customer's event plan.
--
-- Tasks can be completed and later reopened; this is planning data rather
-- than immutable financial history.

create table public.event_plan_tasks (
  id uuid primary key default gen_random_uuid(),

  event_plan_id uuid not null
    references public.event_plans(id)
    on delete cascade,

  title text not null,

  description text null,
  category text null,

  status text not null default 'todo',

  due_date date null,
  completed_at timestamptz null,

  sort_order integer not null default 0,

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_plan_tasks_title_check
    check (
      char_length(trim(title)) between 1 and 200
    ),

  constraint event_plan_tasks_description_check
    check (
      description is null
      or char_length(trim(description)) between 1 and 3000
    ),

  constraint event_plan_tasks_category_check
    check (
      category is null
      or char_length(trim(category)) between 1 and 80
    ),

  constraint event_plan_tasks_status_check
    check (
      status in (
        'todo',
        'in_progress',
        'completed',
        'skipped'
      )
    ),

  constraint event_plan_tasks_completion_state_check
    check (
      (
        status = 'completed'
        and completed_at is not null
      )
      or
      (
        status <> 'completed'
        and completed_at is null
      )
    ),

  constraint event_plan_tasks_completed_timestamp_check
    check (
      completed_at is null
      or completed_at >= created_at
    ),

  constraint event_plan_tasks_sort_order_check
    check (
      sort_order >= 0
    )
);

comment on table public.event_plan_tasks is
  'Customer checklist tasks within an event plan.';

comment on column public.event_plan_tasks.due_date is
  'Calendar due date for a planning task; intentionally stored as date rather than an instant.';


create index event_plan_tasks_plan_sort_idx
  on public.event_plan_tasks (
    event_plan_id,
    sort_order
  );

create index event_plan_tasks_plan_status_idx
  on public.event_plan_tasks (
    event_plan_id,
    status
  );

create index event_plan_tasks_due_date_idx
  on public.event_plan_tasks (
    due_date
  )
  where due_date is not null
    and status in (
      'todo',
      'in_progress'
    );


create trigger set_event_plan_tasks_updated_at
before update on public.event_plan_tasks
for each row
execute function private.set_updated_at();


alter table public.event_plan_tasks enable row level security;


-- ===========================================================================
-- Automatically maintain task completion timestamp
-- ===========================================================================

create or replace function private.set_event_plan_task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT'
       or old.status is distinct from 'completed'
       or new.completed_at is null
    then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;

  return new;
end;
$$;

revoke all on function private.set_event_plan_task_completion()
  from public, anon, authenticated;


create trigger set_event_plan_task_completion
before insert or update of
  status
on public.event_plan_tasks
for each row
execute function private.set_event_plan_task_completion();


-- A task may be edited freely, but it cannot silently move into another
-- customer's event plan.

create or replace function private.protect_event_plan_task_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_plan_id is distinct from old.event_plan_id
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Event-plan task plan and creation time are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_event_plan_task_identity()
  from public, anon, authenticated;


create trigger protect_event_plan_task_identity
before update on public.event_plan_tasks
for each row
execute function private.protect_event_plan_task_identity();


-- ===========================================================================
-- event_notes
-- ===========================================================================
--
-- Customer notes are intentionally editable and deletable.
-- They are planning content, not commercial or financial records.

create table public.event_notes (
  id uuid primary key default gen_random_uuid(),

  event_plan_id uuid not null
    references public.event_plans(id)
    on delete cascade,

  body text not null,

  is_pinned boolean not null default false,

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_notes_body_check
    check (
      char_length(trim(body)) between 1 and 10000
    )
);

comment on table public.event_notes is
  'Editable customer notes attached to an event plan.';


create index event_notes_plan_created_idx
  on public.event_notes (
    event_plan_id,
    created_at desc
  );

create index event_notes_plan_pinned_idx
  on public.event_notes (
    event_plan_id,
    is_pinned,
    created_at desc
  );


create trigger set_event_notes_updated_at
before update on public.event_notes
for each row
execute function private.set_updated_at();


alter table public.event_notes enable row level security;


-- Notes can change content and pin state but cannot be moved between plans.

create or replace function private.protect_event_note_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_plan_id is distinct from old.event_plan_id
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Event note plan and creation time are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_event_note_identity()
  from public, anon, authenticated;


create trigger protect_event_note_identity
before update on public.event_notes
for each row
execute function private.protect_event_note_identity();