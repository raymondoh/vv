-- ============================================================================
-- VV successful final payment confirmation
-- ============================================================================
--
-- Trusted payment-provider workflow for the final scheduled installment.
--
-- confirmed + partially_paid
--        -> confirmed + paid
--
-- final payment
--        pending/processing -> succeeded
--
-- final schedule
--        pending/due -> paid
--
-- Confirmed reservation allocations remain confirmed.
--
-- Repeated delivery of the same successful provider payment is idempotent.
-- ============================================================================


create or replace function public.confirm_final_payment(
  target_payment_id uuid,
  provider_payment_id_value text,
  provider_succeeded_at timestamptz,
  provider_fee_minor_value bigint default null
)
returns table (
  confirmed_booking_id uuid,
  booking_status text,
  booking_payment_status text,
  final_payment_status text,
  final_schedule_status text,
  total_scheduled_paid_minor bigint,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking_id uuid;

  v_booking public.bookings%rowtype;
  v_payment public.booking_payments%rowtype;
  v_schedule public.booking_payment_schedule%rowtype;

  v_allocation_count integer;
  v_confirmed_allocation_count integer;

  v_paid_schedule_total bigint;
begin
  -- --------------------------------------------------------------------------
  -- Provider input validation
  -- --------------------------------------------------------------------------

  if provider_payment_id_value is null
     or char_length(trim(provider_payment_id_value)) = 0
  then
    raise exception 'Provider payment ID is required'
      using errcode = '23514';
  end if;

  if provider_succeeded_at is null then
    raise exception 'Provider success timestamp is required'
      using errcode = '23514';
  end if;

  if provider_fee_minor_value is not null
     and provider_fee_minor_value < 0
  then
    raise exception 'Provider fee cannot be negative'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Resolve booking ID before taking locks.
  --
  -- Lock ordering:
  --
  --   booking -> payment -> schedule
  -- --------------------------------------------------------------------------

  select p.booking_id
  into v_booking_id
  from public.booking_payments as p
  where p.id = target_payment_id;

  if v_booking_id is null then
    raise exception 'Payment not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock booking first.
  -- --------------------------------------------------------------------------

  select b.*
  into v_booking
  from public.bookings as b
  where b.id = v_booking_id
  for update;

  if not found then
    raise exception 'Payment booking not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock payment.
  -- --------------------------------------------------------------------------

  select p.*
  into v_payment
  from public.booking_payments as p
  where p.id = target_payment_id
  for update;

  if not found then
    raise exception 'Payment not found'
      using errcode = 'P0002';
  end if;

  if v_payment.booking_id <> v_booking.id then
    raise exception 'Payment booking changed unexpectedly'
      using errcode = '23514';
  end if;

  if v_payment.payment_kind <> 'final' then
    raise exception 'Only final payments may use this workflow'
      using errcode = '23514';
  end if;

  if v_payment.payment_schedule_id is null then
    raise exception 'Final payment has no payment schedule installment'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock final payment schedule.
  -- --------------------------------------------------------------------------

  select s.*
  into v_schedule
  from public.booking_payment_schedule as s
  where s.id = v_payment.payment_schedule_id
  for update;

  if not found then
    raise exception 'Final payment schedule installment not found'
      using errcode = 'P0002';
  end if;

  if v_schedule.booking_id <> v_booking.id then
    raise exception 'Final schedule does not belong to booking'
      using errcode = '23514';
  end if;

  if v_schedule.installment_type <> 'final' then
    raise exception 'Payment schedule installment is not final'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotent webhook retry.
  -- --------------------------------------------------------------------------

  if v_booking.booking_status = 'confirmed'
     and v_booking.payment_status = 'paid'
  then

    if v_payment.payment_status <> 'succeeded' then
      raise exception
        'Paid booking has inconsistent final payment state'
        using errcode = '23514';
    end if;

    if v_payment.provider_payment_id is distinct from provider_payment_id_value then
      raise exception
        'Provider payment ID does not match the already confirmed final payment'
        using errcode = '23514';
    end if;

    if v_schedule.status <> 'paid' then
      raise exception
        'Paid booking has inconsistent final payment schedule state'
        using errcode = '23514';
    end if;

    select coalesce(sum(s.amount_minor), 0)
    into v_paid_schedule_total
    from public.booking_payment_schedule as s
    where s.booking_id = v_booking.id
      and s.status = 'paid';

    return query
    select
      v_booking.id,
      v_booking.booking_status,
      v_booking.payment_status,
      v_payment.payment_status,
      v_schedule.status,
      v_paid_schedule_total,
      v_schedule.paid_at;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Booking lifecycle validation.
  -- --------------------------------------------------------------------------

  if v_booking.booking_status <> 'confirmed' then
    raise exception
      'Final payment requires a confirmed booking; current status is %',
      v_booking.booking_status
      using errcode = '23514';
  end if;

  if v_booking.payment_status <> 'partially_paid' then
    raise exception
      'Final payment requires a partially paid booking; current payment status is %',
      v_booking.payment_status
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Confirmed inventory must still be intact.
  -- --------------------------------------------------------------------------

  select count(*)
  into v_allocation_count
  from public.booking_space_allocations as a
  where a.booking_id = v_booking.id;

  select count(*)
  into v_confirmed_allocation_count
  from public.booking_space_allocations as a
  where a.booking_id = v_booking.id
    and a.allocation_status = 'confirmed';

  if v_allocation_count = 0
     or v_confirmed_allocation_count <> v_allocation_count
  then
    raise exception
      'Confirmed booking has inconsistent reservation allocations'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Deposit must already be paid.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from public.booking_payment_schedule as s
    where s.booking_id = v_booking.id
      and s.installment_type = 'deposit'
      and s.status = 'paid'
  ) then
    raise exception
      'Final payment cannot complete before the deposit is paid'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Payment lifecycle validation.
  -- --------------------------------------------------------------------------

  if v_payment.payment_status not in ('pending', 'processing') then
    raise exception
      'Final payment cannot be confirmed from status %',
      v_payment.payment_status
      using errcode = '23514';
  end if;

  if v_payment.provider_payment_id is not null
     and v_payment.provider_payment_id <> provider_payment_id_value
  then
    raise exception
      'Provider payment ID does not match the existing payment'
      using errcode = '23514';
  end if;

  if provider_succeeded_at < v_payment.created_at then
    raise exception
      'Provider success timestamp predates the payment attempt'
      using errcode = '23514';
  end if;

  if v_schedule.status not in ('pending', 'due') then
    raise exception
      'Final schedule cannot be paid from status %',
      v_schedule.status
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Record successful provider payment.
  --
  -- Existing payment validators remain the final authority for immutable
  -- booking/schedule/provider/amount/currency fields and lifecycle transitions.
  -- --------------------------------------------------------------------------

  update public.booking_payments as p
  set
    provider_payment_id = provider_payment_id_value,
    provider_fee_minor = provider_fee_minor_value,
    payment_status = 'succeeded',
    succeeded_at = provider_succeeded_at,
    failed_at = null,
    cancelled_at = null,
    failure_code = null,
    failure_message = null
  where p.id = target_payment_id;


  -- --------------------------------------------------------------------------
  -- Mark final installment paid.
  -- --------------------------------------------------------------------------

  update public.booking_payment_schedule as s
  set
    status = 'paid',
    paid_at = provider_succeeded_at
  where s.id = v_schedule.id;


  -- --------------------------------------------------------------------------
  -- Verify the paid schedule now covers the customer total.
  -- --------------------------------------------------------------------------

  select coalesce(sum(s.amount_minor), 0)
  into v_paid_schedule_total
  from public.booking_payment_schedule as s
  where s.booking_id = v_booking.id
    and s.status = 'paid';

  if v_paid_schedule_total <> v_booking.customer_total_minor then
    raise exception
      'Paid installments do not equal the booking customer total'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Aggregate booking payment state becomes paid.
  --
  -- Booking remains confirmed; reservation inventory remains confirmed.
  -- --------------------------------------------------------------------------

  update public.bookings as b
  set payment_status = 'paid'
  where b.id = v_booking.id;


  -- --------------------------------------------------------------------------
  -- Return paid state.
  -- --------------------------------------------------------------------------

  return query
  select
    b.id,
    b.booking_status,
    b.payment_status,
    p.payment_status,
    s.status,
    v_paid_schedule_total,
    s.paid_at
  from public.bookings as b
  join public.booking_payments as p
    on p.id = target_payment_id
  join public.booking_payment_schedule as s
    on s.id = p.payment_schedule_id
  where b.id = v_booking.id;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.confirm_final_payment(uuid, text, timestamptz, bigint)
from public;

revoke all
on function public.confirm_final_payment(uuid, text, timestamptz, bigint)
from anon;

revoke all
on function public.confirm_final_payment(uuid, text, timestamptz, bigint)
from authenticated;

grant execute
on function public.confirm_final_payment(uuid, text, timestamptz, bigint)
to service_role;


comment on function public.confirm_final_payment(
  uuid,
  text,
  timestamptz,
  bigint
) is
  'Atomically confirms a successful final payment, marks the final installment paid, and moves the confirmed booking aggregate payment status to paid. Trusted server/webhook execution only and idempotent for repeated delivery of the same provider payment.';
