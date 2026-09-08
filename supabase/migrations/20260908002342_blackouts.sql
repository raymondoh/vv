-- VV Production Database
-- Migration 0008: venue and space blackouts

-- ===========================================================================
-- venue_blackouts
-- ===========================================================================
--
-- A venue blackout blocks the whole venue for a period of real time.
--
-- Examples:
--   full-site maintenance
--   private closure
--   refurbishment
--   venue-wide event
--
-- Blackouts are not deleted when cancelled. cancelled_at preserves the
-- operational history while allowing the blackout to stop affecting
-- availability.

create table public.venue_blackouts (
  id uuid primary key default gen_random_uuid(),

  venue_id uuid not null
    references public.venues(id)
    on delete cascade,

  blocked_from timestamptz not null,
  blocked_until timestamptz not null,

  -- Half-open range: [blocked_from, blocked_until)
  blocked_during tstzrange
    generated always as (
      tstzrange(
        blocked_from,
        blocked_until,
        '[)'
      )
    ) stored,

  reason text not null,

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  cancelled_at timestamptz null,

  created_at timestamptz not null default now(),

  constraint venue_blackouts_period_check
    check (
      blocked_until > blocked_from
    ),

  constraint venue_blackouts_reason_check
    check (
      char_length(trim(reason)) between 1 and 500
    ),

  constraint venue_blackouts_cancellation_check
    check (
      cancelled_at is null
      or cancelled_at >= created_at
    )
);

comment on table public.venue_blackouts is
  'Venue-wide periods during which reservation inventory is unavailable.';

comment on column public.venue_blackouts.blocked_during is
  'Generated half-open reservation blackout range [blocked_from, blocked_until).';

comment on column public.venue_blackouts.cancelled_at is
  'When set, the blackout no longer affects future availability but remains in history.';


create index venue_blackouts_venue_idx
  on public.venue_blackouts (
    venue_id
  );


-- Availability checks normally care only about active blackouts.

create index venue_blackouts_active_period_gist_idx
  on public.venue_blackouts
  using gist (
    venue_id,
    blocked_during
  )
  where cancelled_at is null;


alter table public.venue_blackouts enable row level security;


-- ===========================================================================
-- space_blackouts
-- ===========================================================================
--
-- A space blackout blocks one reservable space without making the rest of the
-- venue unavailable.
--
-- Examples:
--   Main Hall maintenance
--   Ballroom refurbishment
--   temporary AV installation
--   room unavailable for operational reasons

create table public.space_blackouts (
  id uuid primary key default gen_random_uuid(),

  space_id uuid not null
    references public.spaces(id)
    on delete cascade,

  blocked_from timestamptz not null,
  blocked_until timestamptz not null,

  -- Half-open range: [blocked_from, blocked_until)
  blocked_during tstzrange
    generated always as (
      tstzrange(
        blocked_from,
        blocked_until,
        '[)'
      )
    ) stored,

  reason text not null,

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  cancelled_at timestamptz null,

  created_at timestamptz not null default now(),

  constraint space_blackouts_period_check
    check (
      blocked_until > blocked_from
    ),

  constraint space_blackouts_reason_check
    check (
      char_length(trim(reason)) between 1 and 500
    ),

  constraint space_blackouts_cancellation_check
    check (
      cancelled_at is null
      or cancelled_at >= created_at
    )
);

comment on table public.space_blackouts is
  'Space-specific periods during which reservation inventory is unavailable.';

comment on column public.space_blackouts.blocked_during is
  'Generated half-open reservation blackout range [blocked_from, blocked_until).';

comment on column public.space_blackouts.cancelled_at is
  'When set, the blackout no longer affects future availability but remains in history.';


create index space_blackouts_space_idx
  on public.space_blackouts (
    space_id
  );


create index space_blackouts_active_period_gist_idx
  on public.space_blackouts
  using gist (
    space_id,
    blocked_during
  )
  where cancelled_at is null;


alter table public.space_blackouts enable row level security;