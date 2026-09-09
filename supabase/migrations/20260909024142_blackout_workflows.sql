-- ============================================================================
-- VV blackout workflows
-- ============================================================================
--
-- Browser roles do not directly INSERT/UPDATE/DELETE blackout rows.
--
-- These authenticated SECURITY DEFINER workflows provide:
--
--   create_venue_blackout()
--   cancel_venue_blackout()
--   create_space_blackout()
--   cancel_space_blackout()
--
-- Reservation safety:
--
--   venue blackout:
--     lock venue
--     lock venue spaces in deterministic UUID order
--     reject overlap with held/confirmed allocations
--
--   space blackout:
--     lock venue
--     lock selected space
--     reject overlap with held/confirmed allocations
--
-- This deliberately follows the same venue -> space lock ordering used by
-- approve_booking_hold(), preventing approval and blackout creation from
-- racing into contradictory availability state.
--
-- Blackouts are cancelled, never deleted.
-- ============================================================================


-- ============================================================================
-- Create venue blackout
-- ============================================================================

create or replace function public.create_venue_blackout(
  blackout_id uuid,
  target_venue_id uuid,
  blocked_from_value timestamptz,
  blocked_until_value timestamptz,
  reason_value text
)
returns table (
  created_blackout_id uuid,
  blocked_from timestamptz,
  blocked_until timestamptz,
  reason text,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := now();

  v_existing public.venue_blackouts%rowtype;
begin
  -- --------------------------------------------------------------------------
  -- Authentication / authorization
  -- --------------------------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if blackout_id is null then
    raise exception 'Blackout ID is required'
      using errcode = '23514';
  end if;


  if target_venue_id is null then
    raise exception 'Venue ID is required'
      using errcode = '23514';
  end if;


  if not private.can_operate_venue(target_venue_id) then
    raise exception 'You are not permitted to manage blackouts for this venue'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Input validation
  -- --------------------------------------------------------------------------

  if blocked_from_value is null
     or blocked_until_value is null
  then
    raise exception 'Blackout start and end times are required'
      using errcode = '23514';
  end if;


  if blocked_until_value <= blocked_from_value then
    raise exception 'Blackout end time must be after its start time'
      using errcode = '23514';
  end if;


  if blocked_until_value <= v_now then
    raise exception 'A new blackout must extend into the future'
      using errcode = '23514';
  end if;


  if reason_value is null
     or char_length(trim(reason_value)) < 1
     or char_length(trim(reason_value)) > 500
  then
    raise exception
      'Blackout reason must contain between 1 and 500 characters'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock venue first.
  --
  -- Reservation approval locks the venue before selected spaces.
  -- --------------------------------------------------------------------------

  perform v.id
  from public.venues as v
  where v.id = target_venue_id
  for update;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock all venue spaces in deterministic UUID order.
  --
  -- This gives venue-wide blackout creation the same lock hierarchy as
  -- reservation approval and space-blackout creation.
  -- --------------------------------------------------------------------------

  perform s.id
  from public.spaces as s
  where s.venue_id = target_venue_id
  order by s.id
  for update of s;


  -- --------------------------------------------------------------------------
  -- Idempotent retry.
  --
  -- One client-generated UUID represents one logical blackout operation.
  -- Reusing it with different data is rejected.
  -- --------------------------------------------------------------------------

  select vb.*
  into v_existing
  from public.venue_blackouts as vb
  where vb.id = blackout_id
  for update;

  if found then

    if v_existing.created_by_user_id is distinct from auth.uid() then
      raise exception 'Blackout ID has already been used'
        using errcode = '23505';
    end if;


    if v_existing.venue_id is distinct from target_venue_id
       or v_existing.blocked_from is distinct from blocked_from_value
       or v_existing.blocked_until is distinct from blocked_until_value
       or v_existing.reason is distinct from trim(reason_value)
    then
      raise exception
        'Blackout ID has already been used with different blackout data'
        using errcode = '23505';
    end if;


    return query
    select
      v_existing.id,
      v_existing.blocked_from,
      v_existing.blocked_until,
      v_existing.reason,
      v_existing.cancelled_at;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Existing active reservation inventory wins.
  --
  -- Requested bookings do not own inventory and therefore do not block a
  -- blackout. Their later approval will fail if the blackout overlaps.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_space_allocations as a
    join public.spaces as s
      on s.id = a.space_id
    where s.venue_id = target_venue_id
      and a.allocation_status in ('held', 'confirmed')
      and a.reserved_during &&
          tstzrange(
            blocked_from_value,
            blocked_until_value,
            '[)'
          )
  ) then
    raise exception
      'Venue blackout conflicts with an active reservation'
      using errcode = '23P01';
  end if;


  -- --------------------------------------------------------------------------
  -- Create blackout.
  -- --------------------------------------------------------------------------

  insert into public.venue_blackouts (
    id,
    venue_id,
    blocked_from,
    blocked_until,
    reason,
    created_by_user_id
  )
  values (
    blackout_id,
    target_venue_id,
    blocked_from_value,
    blocked_until_value,
    trim(reason_value),
    auth.uid()
  );


  return query
  select
    vb.id,
    vb.blocked_from,
    vb.blocked_until,
    vb.reason,
    vb.cancelled_at
  from public.venue_blackouts as vb
  where vb.id = blackout_id;

end;
$function$;


-- ============================================================================
-- Cancel venue blackout
-- ============================================================================

create or replace function public.cancel_venue_blackout(
  target_blackout_id uuid
)
returns table (
  cancelled_blackout_id uuid,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := now();

  v_venue_id uuid;

  v_existing public.venue_blackouts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  select vb.venue_id
  into v_venue_id
  from public.venue_blackouts as vb
  where vb.id = target_blackout_id;

  if not found then
    raise exception 'Venue blackout not found'
      using errcode = 'P0002';
  end if;


  if not private.can_operate_venue(v_venue_id) then
    raise exception 'You are not permitted to manage this venue blackout'
      using errcode = '42501';
  end if;


  -- Same venue lock used by approval/creation workflows.

  perform v.id
  from public.venues as v
  where v.id = v_venue_id
  for update;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  select vb.*
  into v_existing
  from public.venue_blackouts as vb
  where vb.id = target_blackout_id
  for update;

  if not found then
    raise exception 'Venue blackout not found'
      using errcode = 'P0002';
  end if;


  -- Idempotent cancellation.

  if v_existing.cancelled_at is not null then
    return query
    select
      v_existing.id,
      v_existing.cancelled_at;

    return;
  end if;


  -- Preserve completed historical blackout records.

  if v_existing.blocked_until <= v_now then
    raise exception
      'Venue blackout has already ended and cannot be cancelled'
      using errcode = '23514';
  end if;


  update public.venue_blackouts as vb
  set cancelled_at = v_now
  where vb.id = target_blackout_id;


  return query
  select
    vb.id,
    vb.cancelled_at
  from public.venue_blackouts as vb
  where vb.id = target_blackout_id;

end;
$function$;


-- ============================================================================
-- Create space blackout
-- ============================================================================

create or replace function public.create_space_blackout(
  blackout_id uuid,
  target_space_id uuid,
  blocked_from_value timestamptz,
  blocked_until_value timestamptz,
  reason_value text
)
returns table (
  created_blackout_id uuid,
  blocked_from timestamptz,
  blocked_until timestamptz,
  reason text,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := now();

  v_venue_id uuid;

  v_existing public.space_blackouts%rowtype;
begin
  -- --------------------------------------------------------------------------
  -- Authentication / authorization
  -- --------------------------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if blackout_id is null then
    raise exception 'Blackout ID is required'
      using errcode = '23514';
  end if;


  if target_space_id is null then
    raise exception 'Space ID is required'
      using errcode = '23514';
  end if;


  if not private.can_operate_space(target_space_id) then
    raise exception 'You are not permitted to manage blackouts for this space'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Input validation
  -- --------------------------------------------------------------------------

  if blocked_from_value is null
     or blocked_until_value is null
  then
    raise exception 'Blackout start and end times are required'
      using errcode = '23514';
  end if;


  if blocked_until_value <= blocked_from_value then
    raise exception 'Blackout end time must be after its start time'
      using errcode = '23514';
  end if;


  if blocked_until_value <= v_now then
    raise exception 'A new blackout must extend into the future'
      using errcode = '23514';
  end if;


  if reason_value is null
     or char_length(trim(reason_value)) < 1
     or char_length(trim(reason_value)) > 500
  then
    raise exception
      'Blackout reason must contain between 1 and 500 characters'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Resolve parent venue.
  -- --------------------------------------------------------------------------

  select s.venue_id
  into v_venue_id
  from public.spaces as s
  where s.id = target_space_id;

  if not found then
    raise exception 'Space not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock venue first, then space.
  --
  -- This matches reservation approval ordering.
  -- --------------------------------------------------------------------------

  perform v.id
  from public.venues as v
  where v.id = v_venue_id
  for update;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  perform s.id
  from public.spaces as s
  where s.id = target_space_id
  for update;

  if not found then
    raise exception 'Space not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotent retry.
  -- --------------------------------------------------------------------------

  select sb.*
  into v_existing
  from public.space_blackouts as sb
  where sb.id = blackout_id
  for update;

  if found then

    if v_existing.created_by_user_id is distinct from auth.uid() then
      raise exception 'Blackout ID has already been used'
        using errcode = '23505';
    end if;


    if v_existing.space_id is distinct from target_space_id
       or v_existing.blocked_from is distinct from blocked_from_value
       or v_existing.blocked_until is distinct from blocked_until_value
       or v_existing.reason is distinct from trim(reason_value)
    then
      raise exception
        'Blackout ID has already been used with different blackout data'
        using errcode = '23505';
    end if;


    return query
    select
      v_existing.id,
      v_existing.blocked_from,
      v_existing.blocked_until,
      v_existing.reason,
      v_existing.cancelled_at;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Existing active reservation inventory wins.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_space_allocations as a
    where a.space_id = target_space_id
      and a.allocation_status in ('held', 'confirmed')
      and a.reserved_during &&
          tstzrange(
            blocked_from_value,
            blocked_until_value,
            '[)'
          )
  ) then
    raise exception
      'Space blackout conflicts with an active reservation'
      using errcode = '23P01';
  end if;


  -- --------------------------------------------------------------------------
  -- Create blackout.
  -- --------------------------------------------------------------------------

  insert into public.space_blackouts (
    id,
    space_id,
    blocked_from,
    blocked_until,
    reason,
    created_by_user_id
  )
  values (
    blackout_id,
    target_space_id,
    blocked_from_value,
    blocked_until_value,
    trim(reason_value),
    auth.uid()
  );


  return query
  select
    sb.id,
    sb.blocked_from,
    sb.blocked_until,
    sb.reason,
    sb.cancelled_at
  from public.space_blackouts as sb
  where sb.id = blackout_id;

end;
$function$;


-- ============================================================================
-- Cancel space blackout
-- ============================================================================

create or replace function public.cancel_space_blackout(
  target_blackout_id uuid
)
returns table (
  cancelled_blackout_id uuid,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := now();

  v_space_id uuid;
  v_venue_id uuid;

  v_existing public.space_blackouts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  select
    sb.space_id,
    s.venue_id
  into
    v_space_id,
    v_venue_id
  from public.space_blackouts as sb
  join public.spaces as s
    on s.id = sb.space_id
  where sb.id = target_blackout_id;

  if not found then
    raise exception 'Space blackout not found'
      using errcode = 'P0002';
  end if;


  if not private.can_operate_space(v_space_id) then
    raise exception 'You are not permitted to manage this space blackout'
      using errcode = '42501';
  end if;


  -- Venue -> space lock ordering.

  perform v.id
  from public.venues as v
  where v.id = v_venue_id
  for update;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  perform s.id
  from public.spaces as s
  where s.id = v_space_id
  for update;

  if not found then
    raise exception 'Space not found'
      using errcode = 'P0002';
  end if;


  select sb.*
  into v_existing
  from public.space_blackouts as sb
  where sb.id = target_blackout_id
  for update;

  if not found then
    raise exception 'Space blackout not found'
      using errcode = 'P0002';
  end if;


  -- Idempotent cancellation.

  if v_existing.cancelled_at is not null then
    return query
    select
      v_existing.id,
      v_existing.cancelled_at;

    return;
  end if;


  if v_existing.blocked_until <= v_now then
    raise exception
      'Space blackout has already ended and cannot be cancelled'
      using errcode = '23514';
  end if;


  update public.space_blackouts as sb
  set cancelled_at = v_now
  where sb.id = target_blackout_id;


  return query
  select
    sb.id,
    sb.cancelled_at
  from public.space_blackouts as sb
  where sb.id = target_blackout_id;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.create_venue_blackout(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
)
from public, anon, authenticated;


revoke all
on function public.cancel_venue_blackout(uuid)
from public, anon, authenticated;


revoke all
on function public.create_space_blackout(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
)
from public, anon, authenticated;


revoke all
on function public.cancel_space_blackout(uuid)
from public, anon, authenticated;


grant execute
on function public.create_venue_blackout(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
)
to authenticated;


grant execute
on function public.cancel_venue_blackout(uuid)
to authenticated;


grant execute
on function public.create_space_blackout(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
)
to authenticated;


grant execute
on function public.cancel_space_blackout(uuid)
to authenticated;


comment on function public.create_venue_blackout(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
) is
  'Creates an idempotent venue-wide blackout for an authorized venue operator while preventing overlap with active held or confirmed reservation inventory.';


comment on function public.cancel_venue_blackout(uuid) is
  'Cancels an active venue blackout without deleting its historical record.';


comment on function public.create_space_blackout(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
) is
  'Creates an idempotent space-specific blackout for an authorized venue operator while preventing overlap with active held or confirmed reservation inventory.';


comment on function public.cancel_space_blackout(uuid) is
  'Cancels an active space blackout without deleting its historical record.';
