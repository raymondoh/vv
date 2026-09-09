-- ============================================================================
-- VV booking decline workflow
-- ============================================================================
--
-- Venue-side rejection of a booking request.
--
-- requested
--     -> declined
--
-- Decline is distinct from cancellation:
--
--   * customers cancel their own eligible bookings;
--   * venue operators decline requests they do not accept.
--
-- A declined request must not own reservation inventory or have an active/
-- successful payment.
--
-- Pending/due payment-schedule installments are cancelled.
-- Commercial snapshots and historical records remain intact.
-- ============================================================================


create or replace function public.decline_booking(
  target_booking_id uuid,
  decline_reason text
)
returns table (
  declined_booking_id uuid,
  status text,
  booking_payment_status text,
  installments_cancelled integer,
  declined_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.bookings%rowtype;

  v_now timestamptz := now();

  v_installments_cancelled integer := 0;
begin
  -- --------------------------------------------------------------------------
  -- Authentication / authorization
  -- --------------------------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not private.can_operate_booking(target_booking_id) then
    raise exception 'You are not permitted to decline this booking'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Reason
  -- --------------------------------------------------------------------------

  if decline_reason is null
     or char_length(trim(decline_reason)) < 1
     or char_length(trim(decline_reason)) > 1000
  then
    raise exception
      'Decline reason must contain between 1 and 1000 characters'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock booking first.
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

  if v_booking.booking_status <> 'requested' then
    raise exception
      'Only requested bookings may be declined; current status is %',
      v_booking.booking_status
      using errcode = '23514';
  end if;

  if v_booking.payment_status <> 'unpaid' then
    raise exception
      'Requested booking must be unpaid before it can be declined'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Requested bookings must not own reservation inventory.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_space_allocations as a
    where a.booking_id = target_booking_id
  ) then
    raise exception
      'Requested booking unexpectedly has reservation allocations'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- A request must not be declined while money is being attempted/held/settled.
  --
  -- Failed and cancelled attempts may remain as historical records.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_payments as p
    where p.booking_id = target_booking_id
      and p.payment_status not in ('failed', 'cancelled')
  ) then
    raise exception
      'Booking cannot be declined while it has an active or successful payment'
      using errcode = '23514';
  end if;


  -- A paid installment would contradict requested/unpaid state.
  if exists (
    select 1
    from public.booking_payment_schedule as s
    where s.booking_id = target_booking_id
      and s.status = 'paid'
  ) then
    raise exception
      'Requested booking unexpectedly has a paid installment'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Cancel unpaid scheduled installments.
  -- --------------------------------------------------------------------------

  update public.booking_payment_schedule as s
  set
    status = 'cancelled',
    paid_at = null
  where s.booking_id = target_booking_id
    and s.status in ('pending', 'due');

  get diagnostics v_installments_cancelled = row_count;


  -- --------------------------------------------------------------------------
  -- Supply decline reason to append-only booking status history.
  --
  -- The cancellation migration introduced the private, transaction-scoped
  -- context consumed by private.record_booking_status_history().
  -- --------------------------------------------------------------------------

  insert into private.booking_status_change_context (
    backend_pid,
    transaction_id,
    booking_id,
    reason
  )
  values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    target_booking_id,
    trim(decline_reason)
  );


  -- --------------------------------------------------------------------------
  -- Booking lifecycle transition.
  -- --------------------------------------------------------------------------

  update public.bookings as b
  set
    booking_status = 'declined',
    declined_at = v_now
  where b.id = target_booking_id;


  -- The history trigger must have consumed the supplied reason.
  if exists (
    select 1
    from private.booking_status_change_context as c
    where c.backend_pid = pg_catalog.pg_backend_pid()
      and c.transaction_id = pg_catalog.txid_current()
      and c.booking_id = target_booking_id
  ) then
    raise exception
      'Booking status-history context was not consumed'
      using errcode = '55000';
  end if;


  -- --------------------------------------------------------------------------
  -- Result
  -- --------------------------------------------------------------------------

  return query
  select
    b.id,
    b.booking_status,
    b.payment_status,
    v_installments_cancelled,
    b.declined_at
  from public.bookings as b
  where b.id = target_booking_id;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.decline_booking(uuid, text)
from public;

revoke all
on function public.decline_booking(uuid, text)
from anon;

revoke all
on function public.decline_booking(uuid, text)
from authenticated;

grant execute
on function public.decline_booking(uuid, text)
to authenticated;


comment on function public.decline_booking(uuid, text) is
  'Allows an authorized venue operator to decline a requested booking, cancel unpaid scheduled installments, and record the decline reason in append-only booking status history.';
