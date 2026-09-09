-- ============================================================================
-- VV booking completion workflow
-- ============================================================================
--
-- Trusted system workflow:
--
--   confirmed / paid
--          ->
--   completed / paid
--
-- Completion is allowed only after the booked event has ended.
--
-- Completion does not:
--
--   * release confirmed reservation allocations;
--   * alter payment rows;
--   * alter payment schedule rows;
--   * create transfers or payouts;
--   * create refunds.
--
-- Confirmed allocations remain immutable historical evidence that the booking
-- occupied those spaces during its reserved period.
--
-- Completion is idempotent for repeated trusted-system execution.
-- ============================================================================


create or replace function public.complete_booking(
  target_booking_id uuid
)
returns table (
  completed_booking_id uuid,
  booking_status text,
  booking_payment_status text,
  allocations_confirmed integer,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.bookings%rowtype;

  v_now timestamptz := now();

  v_booking_item_count integer;
  v_allocation_count integer;
  v_confirmed_allocation_count integer;

  v_paid_schedule_total bigint;
  v_successful_payment_total bigint;
begin
  -- --------------------------------------------------------------------------
  -- Lock booking first.
  --
  -- This follows the same booking-first lock order as approval, hold expiry,
  -- payment confirmation and cancellation workflows.
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
  -- Idempotent completion retry.
  --
  -- Payment status may legitimately change later if a completed booking is
  -- partially or fully refunded, so an already-completed booking is returned
  -- without requiring payment_status to remain 'paid'.
  -- --------------------------------------------------------------------------

  if v_booking.booking_status = 'completed' then

    if v_booking.completed_at is null then
      raise exception
        'Completed booking has no completion timestamp'
        using errcode = '23514';
    end if;


    select count(*)
    into v_allocation_count
    from public.booking_space_allocations as a
    where a.booking_id = target_booking_id;


    select count(*)
    into v_confirmed_allocation_count
    from public.booking_space_allocations as a
    where a.booking_id = target_booking_id
      and a.allocation_status = 'confirmed';


    if v_allocation_count = 0
       or v_confirmed_allocation_count <> v_allocation_count
    then
      raise exception
        'Completed booking has inconsistent reservation allocations'
        using errcode = '23514';
    end if;


    return query
    select
      v_booking.id,
      v_booking.booking_status,
      v_booking.payment_status,
      v_confirmed_allocation_count,
      v_booking.completed_at;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Lifecycle validation.
  -- --------------------------------------------------------------------------

  if v_booking.booking_status <> 'confirmed' then
    raise exception
      'Only confirmed bookings may be completed; current status is %',
      v_booking.booking_status
      using errcode = '23514';
  end if;


  if v_booking.payment_status <> 'paid' then
    raise exception
      'Booking must be fully paid before completion; current payment status is %',
      v_booking.payment_status
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Event must actually have ended.
  -- --------------------------------------------------------------------------

  if v_booking.event_ends_at > v_now then
    raise exception
      'Booking cannot be completed before the event ends'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Reservation inventory must still be complete and confirmed.
  -- --------------------------------------------------------------------------

  select count(*)
  into v_booking_item_count
  from public.booking_items as bi
  where bi.booking_id = target_booking_id;


  select count(*)
  into v_allocation_count
  from public.booking_space_allocations as a
  where a.booking_id = target_booking_id;


  select count(*)
  into v_confirmed_allocation_count
  from public.booking_space_allocations as a
  where a.booking_id = target_booking_id
    and a.allocation_status = 'confirmed';


  if v_booking_item_count = 0 then
    raise exception
      'Confirmed booking has no booking items'
      using errcode = '23514';
  end if;


  if v_allocation_count <> v_booking_item_count
     or v_confirmed_allocation_count <> v_booking_item_count
  then
    raise exception
      'Confirmed booking has inconsistent reservation allocations'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Payment schedule integrity.
  --
  -- Every scheduled installment must be paid and the paid schedule total must
  -- exactly equal the customer's snapshotted booking total.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_payment_schedule as s
    where s.booking_id = target_booking_id
      and s.status <> 'paid'
  ) then
    raise exception
      'Booking has an unpaid payment schedule installment'
      using errcode = '23514';
  end if;


  select coalesce(sum(s.amount_minor), 0)
  into v_paid_schedule_total
  from public.booking_payment_schedule as s
  where s.booking_id = target_booking_id
    and s.status = 'paid';


  if v_paid_schedule_total <> v_booking.customer_total_minor then
    raise exception
      'Paid payment schedule total does not equal booking customer total'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Successful payment integrity.
  --
  -- Failed/cancelled attempts may coexist historically, but successful payment
  -- amounts must cover the full customer total before completion.
  -- --------------------------------------------------------------------------

  select coalesce(sum(p.amount_minor), 0)
  into v_successful_payment_total
  from public.booking_payments as p
  where p.booking_id = target_booking_id
    and p.payment_status = 'succeeded';


  if v_successful_payment_total <> v_booking.customer_total_minor then
    raise exception
      'Successful payment total does not equal booking customer total'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- No payment attempt may still be processing.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_payments as p
    where p.booking_id = target_booking_id
      and p.payment_status = 'processing'
  ) then
    raise exception
      'Booking cannot be completed while a payment is processing'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Supply system completion reason to append-only status history.
  --
  -- service_role execution has no application user actor, so
  -- changed_by_user_id is expected to remain null.
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
    'Event ended and booking was fully paid'
  );


  -- --------------------------------------------------------------------------
  -- Complete booking.
  --
  -- Reservation allocations deliberately remain confirmed.
  -- Payment state deliberately remains paid.
  -- --------------------------------------------------------------------------

  update public.bookings as b
  set
    booking_status = 'completed',
    completed_at = v_now
  where b.id = target_booking_id;


  -- History trigger must consume its transaction context.
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
  -- Return completed state.
  -- --------------------------------------------------------------------------

  return query
  select
    b.id,
    b.booking_status,
    b.payment_status,
    v_confirmed_allocation_count,
    b.completed_at
  from public.bookings as b
  where b.id = target_booking_id;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.complete_booking(uuid)
from public;

revoke all
on function public.complete_booking(uuid)
from anon;

revoke all
on function public.complete_booking(uuid)
from authenticated;

grant execute
on function public.complete_booking(uuid)
to service_role;


comment on function public.complete_booking(uuid) is
  'Trusted system workflow that completes a fully paid confirmed booking after its event has ended while preserving confirmed reservation allocations and all payment history.';
