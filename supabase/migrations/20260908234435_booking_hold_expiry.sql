-- ============================================================================
-- VV booking hold expiry workflow
-- ============================================================================
--
-- Expired approval holds must release temporary reservation inventory.
--
-- This workflow is intentionally NOT executable by anon/authenticated users.
-- It is intended for trusted server-side/system execution.
--
-- approved_hold
--     -> hold_expired
--
-- held allocations
--     -> expired
--
-- Future payment-confirmation workflows must acquire the booking row lock first
-- as well, ensuring payment confirmation and expiry cannot race each other.
-- ============================================================================


create or replace function public.expire_booking_hold(
  target_booking_id uuid
)
returns table (
  expired_booking_id uuid,
  status text,
  allocations_expired integer,
  processed_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.bookings%rowtype;

  v_now timestamptz := now();

  v_booking_item_count integer;
  v_held_allocation_count integer;
  v_expired_allocation_count integer := 0;
begin
  -- --------------------------------------------------------------------------
  -- Lock booking
  --
  -- Payment confirmation will use this same first lock. Whichever workflow
  -- locks the booking first completes its state transition before the other
  -- may continue.
  -- --------------------------------------------------------------------------

  select b.*
  into v_booking
  from public.bookings as b
  where b.id = target_booking_id
  for update;

  if not found then
    raise exception 'Booking not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lifecycle validation
  -- --------------------------------------------------------------------------

  if v_booking.booking_status <> 'approved_hold' then
    raise exception
      'Only approved holds may expire; current status is %',
      v_booking.booking_status
      using errcode = '23514';
  end if;

  if v_booking.hold_expires_at is null then
    raise exception 'Approved booking has no hold expiry'
      using errcode = '23514';
  end if;

  if v_booking.hold_expires_at > v_now then
    raise exception
      'Booking hold has not expired'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Defensive inventory integrity checks
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_space_allocations as a
    where a.booking_id = target_booking_id
      and a.allocation_status = 'confirmed'
  ) then
    raise exception
      'Cannot expire a booking with confirmed reservation allocations'
      using errcode = '23514';
  end if;


  select count(*)
  into v_booking_item_count
  from public.booking_items as bi
  where bi.booking_id = target_booking_id;


  select count(*)
  into v_held_allocation_count
  from public.booking_space_allocations as a
  where a.booking_id = target_booking_id
    and a.allocation_status = 'held';


  if v_booking_item_count = 0 then
    raise exception
      'Approved booking contains no booking items'
      using errcode = '23514';
  end if;

  if v_held_allocation_count <> v_booking_item_count then
    raise exception
      'Booking reservation allocations are inconsistent with its booking items'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Expire temporary inventory
  --
  -- The existing allocation lifecycle validator allows:
  --
  --   held -> expired
  --
  -- and requires expired_at >= hold_expires_at.
  -- --------------------------------------------------------------------------

  update public.booking_space_allocations as a
  set
    allocation_status = 'expired',
    expired_at = v_now
  where a.booking_id = target_booking_id
    and a.allocation_status = 'held';

  get diagnostics v_expired_allocation_count = row_count;


  -- --------------------------------------------------------------------------
  -- Booking lifecycle transition
  --
  -- We deliberately retain approved_at and hold_expires_at as historical facts.
  -- The existing booking status-history trigger records:
  --
  --   approved_hold -> hold_expired
  --
  -- System execution normally has no end-user auth.uid(), so the history actor
  -- may correctly be NULL for an automatic expiry.
  -- --------------------------------------------------------------------------

  update public.bookings as b
  set booking_status = 'hold_expired'
  where b.id = target_booking_id;


  -- --------------------------------------------------------------------------
  -- Result
  -- --------------------------------------------------------------------------

  return query
  select
    b.id,
    b.booking_status,
    v_expired_allocation_count,
    v_now
  from public.bookings as b
  where b.id = target_booking_id;

end;
$function$;


-- ============================================================================
-- Function privileges
--
-- Only trusted server/system execution may expire holds.
-- ============================================================================

revoke all
on function public.expire_booking_hold(uuid)
from public;

revoke all
on function public.expire_booking_hold(uuid)
from anon;

revoke all
on function public.expire_booking_hold(uuid)
from authenticated;

grant execute
on function public.expire_booking_hold(uuid)
to service_role;


comment on function public.expire_booking_hold(uuid) is
  'Atomically expires an elapsed booking approval hold and releases its temporary reservation inventory. Trusted server/system execution only.';
