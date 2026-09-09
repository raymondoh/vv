-- ============================================================================
-- VV successful deposit payment confirmation
-- ============================================================================
--
-- A successful deposit converts a temporary reservation hold into a confirmed
-- booking.
--
-- This workflow is trusted server/system only. In production it is intended to
-- be called from verified payment-provider webhook processing.
--
-- approved_hold
--      -> confirmed
--
-- held allocations
--      -> confirmed
--
-- deposit payment
--      pending/processing -> succeeded
--
-- deposit schedule
--      pending/due -> paid
--
-- Booking row is locked FIRST, matching the hold-expiry workflow. Therefore
-- payment confirmation and hold expiry cannot successfully race each other.
--
-- Repeated delivery of the same successful provider payment is idempotent.
-- ============================================================================


create or replace function public.confirm_deposit_payment(
  target_payment_id uuid,
  provider_payment_id_value text,
  provider_succeeded_at timestamptz,
  provider_fee_minor_value bigint default null
)
returns table (
  confirmed_booking_id uuid,
  booking_status text,
  booking_payment_status text,
  deposit_payment_status text,
  deposit_schedule_status text,
  allocations_confirmed integer,
  confirmed_at timestamptz
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
  v_confirmed_allocation_count integer := 0;

  v_new_booking_payment_status text;
begin
  -- --------------------------------------------------------------------------
  -- Basic provider input validation
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
  -- Resolve booking ID without locking payment yet.
  --
  -- Lock ordering must remain:
  --
  --   booking -> payment -> schedule -> allocations
  --
  -- Hold expiry also locks the booking first.
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
  -- Lock booking FIRST.
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
  -- Lock and validate payment.
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

  if v_payment.payment_kind <> 'deposit' then
    raise exception 'Only deposit payments may confirm a booking hold'
      using errcode = '23514';
  end if;

  if v_payment.payment_schedule_id is null then
    raise exception 'Deposit payment has no payment schedule installment'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock deposit schedule.
  -- --------------------------------------------------------------------------

  select s.*
  into v_schedule
  from public.booking_payment_schedule as s
  where s.id = v_payment.payment_schedule_id
  for update;

  if not found then
    raise exception 'Deposit payment schedule installment not found'
      using errcode = 'P0002';
  end if;

  if v_schedule.booking_id <> v_booking.id then
    raise exception 'Deposit schedule does not belong to booking'
      using errcode = '23514';
  end if;

  if v_schedule.installment_type <> 'deposit' then
    raise exception 'Payment schedule installment is not a deposit'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotent webhook retry
  --
  -- A provider may deliver the same success event repeatedly.
  -- If every important state is already confirmed consistently, simply return
  -- the existing result.
  -- --------------------------------------------------------------------------

  if v_booking.booking_status = 'confirmed' then

    if v_payment.payment_status <> 'succeeded' then
      raise exception
        'Confirmed booking has inconsistent deposit payment state'
        using errcode = '23514';
    end if;

    if v_payment.provider_payment_id is distinct from provider_payment_id_value then
      raise exception
        'Provider payment ID does not match the already confirmed deposit'
        using errcode = '23514';
    end if;

    if v_schedule.status <> 'paid' then
      raise exception
        'Confirmed booking has inconsistent deposit schedule state'
        using errcode = '23514';
    end if;

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

    return query
    select
      v_booking.id,
      v_booking.booking_status,
      v_booking.payment_status,
      v_payment.payment_status,
      v_schedule.status,
      v_confirmed_allocation_count,
      v_booking.confirmed_at;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Booking lifecycle validation
  -- --------------------------------------------------------------------------

  if v_booking.booking_status <> 'approved_hold' then
    raise exception
      'Deposit may only confirm an approved hold; current status is %',
      v_booking.booking_status
      using errcode = '23514';
  end if;

  if v_booking.hold_expires_at is null then
    raise exception 'Approved booking has no hold expiry'
      using errcode = '23514';
  end if;


  -- Use provider success time rather than webhook arrival time.
  --
  -- If the payment actually succeeded after the hold deadline, confirmation
  -- must not claim the inventory.
  if provider_succeeded_at > v_booking.hold_expires_at then
    raise exception
      'Deposit succeeded after the booking hold expired'
      using errcode = '23514';
  end if;

  if provider_succeeded_at < v_payment.created_at then
    raise exception
      'Provider success timestamp predates the payment attempt'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Payment lifecycle validation
  -- --------------------------------------------------------------------------

  if v_payment.payment_status not in ('pending', 'processing') then
    raise exception
      'Deposit payment cannot be confirmed from status %',
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

  if v_schedule.status not in ('pending', 'due') then
    raise exception
      'Deposit schedule cannot be paid from status %',
      v_schedule.status
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Reservation integrity before payment mutation.
  -- --------------------------------------------------------------------------

  select count(*)
  into v_allocation_count
  from public.booking_space_allocations as a
  where a.booking_id = v_booking.id;

  if v_allocation_count = 0 then
    raise exception 'Approved booking has no reservation allocations'
      using errcode = '23514';
  end if;

  select count(*)
  into v_confirmed_allocation_count
  from public.booking_space_allocations as a
  where a.booking_id = v_booking.id
    and a.allocation_status = 'held';

  if v_confirmed_allocation_count <> v_allocation_count then
    raise exception
      'Approved booking does not have a complete set of held allocations'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Record provider-confirmed payment success.
  --
  -- Existing payment validators enforce immutable booking/schedule/provider/
  -- amount/currency and valid payment lifecycle transitions.
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
  -- Mark deposit installment paid.
  -- --------------------------------------------------------------------------

  update public.booking_payment_schedule as s
  set
    status = 'paid',
    paid_at = provider_succeeded_at
  where s.id = v_schedule.id;


  -- --------------------------------------------------------------------------
  -- Confirm reservation inventory.
  --
  -- Existing allocation lifecycle validator permits:
  --
  --   held -> confirmed
  -- --------------------------------------------------------------------------

  update public.booking_space_allocations as a
  set
    allocation_status = 'confirmed',
    confirmed_at = provider_succeeded_at
  where a.booking_id = v_booking.id
    and a.allocation_status = 'held';

  get diagnostics v_confirmed_allocation_count = row_count;

  if v_confirmed_allocation_count <> v_allocation_count then
    raise exception
      'Failed to confirm the complete reservation allocation set'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Booking aggregate payment state.
  --
  -- If the deposit itself equals the full customer total, the booking is fully
  -- paid immediately. Otherwise it is partially paid.
  -- --------------------------------------------------------------------------

  if v_payment.amount_minor >= v_booking.customer_total_minor then
    v_new_booking_payment_status := 'paid';
  else
    v_new_booking_payment_status := 'partially_paid';
  end if;


  -- --------------------------------------------------------------------------
  -- Booking lifecycle transition
  --
  -- Status-history trigger records:
  --
  --   approved_hold -> confirmed
  --
  -- A trusted webhook normally has no end-user auth.uid(), so automatic payment
  -- confirmation will normally have a NULL end-user actor.
  -- --------------------------------------------------------------------------

  update public.bookings as b
  set
    booking_status = 'confirmed',
    payment_status = v_new_booking_payment_status,
    confirmed_at = provider_succeeded_at
  where b.id = v_booking.id;


  -- --------------------------------------------------------------------------
  -- Return confirmed state.
  -- --------------------------------------------------------------------------

  return query
  select
    b.id,
    b.booking_status,
    b.payment_status,
    p.payment_status,
    s.status,
    v_confirmed_allocation_count,
    b.confirmed_at
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
--
-- Successful provider payment confirmation must only be driven by trusted
-- server-side webhook processing.
-- ============================================================================

revoke all
on function public.confirm_deposit_payment(uuid, text, timestamptz, bigint)
from public;

revoke all
on function public.confirm_deposit_payment(uuid, text, timestamptz, bigint)
from anon;

revoke all
on function public.confirm_deposit_payment(uuid, text, timestamptz, bigint)
from authenticated;

grant execute
on function public.confirm_deposit_payment(uuid, text, timestamptz, bigint)
to service_role;


comment on function public.confirm_deposit_payment(
  uuid,
  text,
  timestamptz,
  bigint
) is
  'Atomically confirms a successful deposit payment, marks its installment paid, converts held reservation allocations to confirmed, and confirms the booking. Trusted server/webhook execution only and idempotent for repeated delivery of the same provider payment.';
