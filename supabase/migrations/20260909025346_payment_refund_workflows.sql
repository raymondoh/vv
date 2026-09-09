-- ============================================================================
-- VV payment refund workflows
-- ============================================================================
--
-- Booking cancellation and payment refunding are deliberately separate.
--
-- Cancellation:
--   changes booking/inventory state.
--
-- Refund:
--   changes financial state only after money is actually returned.
--
-- Refund request:
--   * owner / manager / platform admin only
--   * cancelled or completed bookings only
--   * derives booking/provider/currency from the successful payment
--   * prevents over-refunding
--   * creates an idempotent pending refund
--
-- Provider confirmation:
--   * service_role only
--   * marks the refund succeeded
--   * updates original payment:
--       succeeded -> partially_refunded / refunded
--   * updates booking aggregate:
--       partially_refunded / refunded
--
-- Payment schedules remain historical evidence of what was originally paid.
-- Booking commercial snapshots and commission terms are never rewritten.
-- ============================================================================


-- ============================================================================
-- Request refund
-- ============================================================================

create or replace function public.request_payment_refund(
  refund_id uuid,
  target_payment_id uuid,
  amount_minor_value bigint,
  reason_value text
)
returns table (
  requested_refund_id uuid,
  booking_id uuid,
  refund_status text,
  amount_minor bigint,
  currency_code text,
  remaining_refundable_minor bigint
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking_id uuid;

  v_booking public.bookings%rowtype;
  v_payment public.booking_payments%rowtype;
  v_existing public.payment_refunds%rowtype;

  v_reserved_refund_total bigint;
  v_remaining_refundable bigint;
begin
  -- --------------------------------------------------------------------------
  -- Authentication
  -- --------------------------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if refund_id is null then
    raise exception 'Refund ID is required'
      using errcode = '23514';
  end if;


  if target_payment_id is null then
    raise exception 'Payment ID is required'
      using errcode = '23514';
  end if;


  if amount_minor_value is null
     or amount_minor_value <= 0
  then
    raise exception 'Refund amount must be greater than zero'
      using errcode = '23514';
  end if;


  if reason_value is null
     or char_length(trim(reason_value)) < 1
     or char_length(trim(reason_value)) > 500
  then
    raise exception
      'Refund reason must contain between 1 and 500 characters'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Resolve booking ID.
  --
  -- Payment identity is immutable, so this lookup can safely establish which
  -- booking must be locked first.
  -- --------------------------------------------------------------------------

  select p.booking_id
  into v_booking_id
  from public.booking_payments as p
  where p.id = target_payment_id;

  if not found then
    raise exception 'Payment not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock booking first.
  --
  -- This follows the same booking-first lock discipline used by the other
  -- financial/lifecycle workflows.
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
  -- Financial authorization.
  --
  -- Ordinary venue staff deliberately cannot issue refunds.
  -- --------------------------------------------------------------------------

  if not private.can_administer_booking(v_booking.id) then
    raise exception 'You are not permitted to refund this booking'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Refund lifecycle.
  --
  -- Cancelled bookings are the normal refund path.
  --
  -- Completed bookings are also supported for legitimate post-event customer
  -- service adjustments/refunds.
  -- --------------------------------------------------------------------------

  if v_booking.booking_status not in (
    'cancelled',
    'completed'
  ) then
    raise exception
      'Refunds require a cancelled or completed booking; current status is %',
      v_booking.booking_status
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock original payment second.
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


  -- --------------------------------------------------------------------------
  -- Idempotent refund request.
  --
  -- The UUID identifies one logical refund request.
  -- Reusing it with different data is rejected.
  -- --------------------------------------------------------------------------

  select r.*
  into v_existing
  from public.payment_refunds as r
  where r.id = refund_id
  for update;

  if found then

    if v_existing.booking_payment_id is distinct from target_payment_id
       or v_existing.amount_minor is distinct from amount_minor_value
       or v_existing.reason is distinct from trim(reason_value)
    then
      raise exception
        'Refund ID has already been used with different refund data'
        using errcode = '23505';
    end if;


    select coalesce(sum(r.amount_minor), 0)
    into v_reserved_refund_total
    from public.payment_refunds as r
    where r.booking_payment_id = target_payment_id
      and r.refund_status in (
        'pending',
        'processing',
        'succeeded'
      );


    v_remaining_refundable :=
      greatest(
        v_payment.amount_minor - v_reserved_refund_total,
        0
      );


    return query
    select
      v_existing.id,
      v_existing.booking_id,
      v_existing.refund_status,
      v_existing.amount_minor,
      v_existing.currency_code,
      v_remaining_refundable;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- New refund eligibility.
  --
  -- This deliberately comes AFTER the idempotency check so an exact replay of
  -- an already-completed full refund remains harmless even though the original
  -- payment is now in status refunded.
  -- --------------------------------------------------------------------------

  if v_payment.payment_status not in (
    'succeeded',
    'partially_refunded'
  ) then
    raise exception
      'Payment is not currently refundable; payment status is %',
      v_payment.payment_status
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Refundable balance.
  --
  -- Pending/processing refunds reserve capacity because another provider
  -- request may already be underway.
  -- --------------------------------------------------------------------------

  select coalesce(sum(r.amount_minor), 0)
  into v_reserved_refund_total
  from public.payment_refunds as r
  where r.booking_payment_id = target_payment_id
    and r.refund_status in (
      'pending',
      'processing',
      'succeeded'
    );


  v_remaining_refundable :=
    v_payment.amount_minor - v_reserved_refund_total;


  if v_remaining_refundable <= 0 then
    raise exception 'Payment has no remaining refundable amount'
      using errcode = '23514';
  end if;


  if amount_minor_value > v_remaining_refundable then
    raise exception
      'Requested refund exceeds the remaining refundable payment amount'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Create pending refund.
  --
  -- Provider/currency/booking are derived from the payment, never supplied by
  -- the browser.
  --
  -- The refund UUID itself should later be used by the server as the provider
  -- idempotency key when making the external refund request.
  -- --------------------------------------------------------------------------

  insert into public.payment_refunds (
    id,
    booking_id,
    booking_payment_id,
    provider,
    refund_status,
    amount_minor,
    currency_code,
    reason,
    metadata
  )
  values (
    refund_id,
    v_booking.id,
    v_payment.id,
    v_payment.provider,
    'pending',
    amount_minor_value,
    v_payment.currency_code,
    trim(reason_value),

    jsonb_build_object(
      'requested_by_user_id', auth.uid(),
      'request_source', 'authorized_refund_request',
      'provider_idempotency_key', refund_id
    )
  );


  v_remaining_refundable :=
    v_remaining_refundable - amount_minor_value;


  return query
  select
    r.id,
    r.booking_id,
    r.refund_status,
    r.amount_minor,
    r.currency_code,
    v_remaining_refundable
  from public.payment_refunds as r
  where r.id = refund_id;

end;
$function$;


-- ============================================================================
-- Confirm successful provider refund
-- ============================================================================

create or replace function public.confirm_payment_refund(
  target_refund_id uuid,
  provider_refund_id_value text,
  provider_succeeded_at timestamptz
)
returns table (
  confirmed_refund_id uuid,
  booking_id uuid,
  refund_status text,
  payment_status text,
  booking_payment_status text,
  payment_refunded_total_minor bigint,
  booking_refunded_total_minor bigint,
  succeeded_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking_id uuid;
  v_payment_id uuid;

  v_booking public.bookings%rowtype;
  v_payment public.booking_payments%rowtype;
  v_refund public.payment_refunds%rowtype;

  v_payment_refunded_total bigint;
  v_booking_refunded_total bigint;
  v_booking_gross_collected bigint;

  v_expected_payment_status text;
  v_expected_booking_payment_status text;
begin
  -- --------------------------------------------------------------------------
  -- Provider input validation
  -- --------------------------------------------------------------------------

  if target_refund_id is null then
    raise exception 'Refund ID is required'
      using errcode = '23514';
  end if;


  if provider_refund_id_value is null
     or char_length(trim(provider_refund_id_value)) < 1
  then
    raise exception 'Provider refund ID is required'
      using errcode = '23514';
  end if;


  if provider_succeeded_at is null then
    raise exception 'Provider success timestamp is required'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Resolve immutable booking/payment identity.
  -- --------------------------------------------------------------------------

  select
    r.booking_id,
    r.booking_payment_id
  into
    v_booking_id,
    v_payment_id
  from public.payment_refunds as r
  where r.id = target_refund_id;

  if not found then
    raise exception 'Refund not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock order:
  --
  --   booking -> payment -> refund
  --
  -- Multiple refund webhooks for the same booking/payment therefore serialize.
  -- --------------------------------------------------------------------------

  select b.*
  into v_booking
  from public.bookings as b
  where b.id = v_booking_id
  for update;

  if not found then
    raise exception 'Refund booking not found'
      using errcode = 'P0002';
  end if;


  select p.*
  into v_payment
  from public.booking_payments as p
  where p.id = v_payment_id
  for update;

  if not found then
    raise exception 'Refund payment not found'
      using errcode = 'P0002';
  end if;


  select r.*
  into v_refund
  from public.payment_refunds as r
  where r.id = target_refund_id
  for update;

  if not found then
    raise exception 'Refund not found'
      using errcode = 'P0002';
  end if;


  if v_refund.booking_id <> v_booking.id
     or v_refund.booking_payment_id <> v_payment.id
     or v_payment.booking_id <> v_booking.id
  then
    raise exception 'Refund/payment/booking relationship is inconsistent'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotent webhook replay.
  -- --------------------------------------------------------------------------

  if v_refund.refund_status = 'succeeded' then

    if v_refund.provider_refund_id
         is distinct from provider_refund_id_value
    then
      raise exception
        'Provider refund ID does not match the already confirmed refund'
        using errcode = '23514';
    end if;


    select coalesce(sum(r.amount_minor), 0)
    into v_payment_refunded_total
    from public.payment_refunds as r
    where r.booking_payment_id = v_payment.id
      and r.refund_status = 'succeeded';


    if v_payment_refunded_total = v_payment.amount_minor then
      v_expected_payment_status := 'refunded';
    elsif v_payment_refunded_total > 0
          and v_payment_refunded_total < v_payment.amount_minor
    then
      v_expected_payment_status := 'partially_refunded';
    else
      raise exception
        'Succeeded refund totals are inconsistent with original payment amount'
        using errcode = '23514';
    end if;


    select coalesce(sum(p.amount_minor), 0)
    into v_booking_gross_collected
    from public.booking_payments as p
    where p.booking_id = v_booking.id
      and p.payment_status in (
        'succeeded',
        'partially_refunded',
        'refunded'
      );


    select coalesce(sum(r.amount_minor), 0)
    into v_booking_refunded_total
    from public.payment_refunds as r
    where r.booking_id = v_booking.id
      and r.refund_status = 'succeeded';


    if v_booking_gross_collected <= 0
       or v_booking_refunded_total > v_booking_gross_collected
    then
      raise exception
        'Booking refund totals are inconsistent with collected payments'
        using errcode = '23514';
    end if;


    if v_booking_refunded_total = v_booking_gross_collected then
      v_expected_booking_payment_status := 'refunded';
    else
      v_expected_booking_payment_status := 'partially_refunded';
    end if;


    if v_payment.payment_status <> v_expected_payment_status then
      raise exception
        'Confirmed refund has inconsistent original payment state'
        using errcode = '23514';
    end if;


    if v_booking.payment_status <> v_expected_booking_payment_status then
      raise exception
        'Confirmed refund has inconsistent booking payment state'
        using errcode = '23514';
    end if;


    return query
    select
      v_refund.id,
      v_booking.id,
      v_refund.refund_status,
      v_payment.payment_status,
      v_booking.payment_status,
      v_payment_refunded_total,
      v_booking_refunded_total,
      v_refund.succeeded_at;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Normal provider-success path.
  -- --------------------------------------------------------------------------

  if v_refund.refund_status not in (
    'pending',
    'processing'
  ) then
    raise exception
      'Refund cannot be confirmed from status %',
      v_refund.refund_status
      using errcode = '23514';
  end if;


  if v_payment.payment_status not in (
    'succeeded',
    'partially_refunded'
  ) then
    raise exception
      'Original payment is not in a refundable state; current status is %',
      v_payment.payment_status
      using errcode = '23514';
  end if;


  if v_refund.provider_refund_id is not null
     and v_refund.provider_refund_id <> provider_refund_id_value
  then
    raise exception
      'Provider refund ID does not match the existing refund'
      using errcode = '23514';
  end if;


  if provider_succeeded_at < v_refund.created_at then
    raise exception
      'Provider success timestamp predates the refund request'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Mark refund succeeded.
  --
  -- Existing refund validation remains the final authority preventing
  -- over-refunds and invalid identity/status changes.
  -- --------------------------------------------------------------------------

  update public.payment_refunds as r
  set
    provider_refund_id = provider_refund_id_value,
    refund_status = 'succeeded',
    succeeded_at = provider_succeeded_at,
    failed_at = null,
    cancelled_at = null
  where r.id = target_refund_id;


  -- --------------------------------------------------------------------------
  -- Recalculate original payment state.
  -- --------------------------------------------------------------------------

  select coalesce(sum(r.amount_minor), 0)
  into v_payment_refunded_total
  from public.payment_refunds as r
  where r.booking_payment_id = v_payment.id
    and r.refund_status = 'succeeded';


  if v_payment_refunded_total > v_payment.amount_minor then
    raise exception
      'Successful refunds exceed original payment amount'
      using errcode = '23514';
  end if;


  if v_payment_refunded_total = v_payment.amount_minor then
    v_expected_payment_status := 'refunded';

  elsif v_payment_refunded_total > 0 then
    v_expected_payment_status := 'partially_refunded';

  else
    raise exception
      'Successful refund total must be positive'
      using errcode = '23514';
  end if;


  update public.booking_payments as p
  set payment_status = v_expected_payment_status
  where p.id = v_payment.id;


  -- Refresh locked payment record after state transition.

  select p.*
  into v_payment
  from public.booking_payments as p
  where p.id = v_payment.id;


  -- --------------------------------------------------------------------------
  -- Recalculate aggregate booking financial state.
  --
  -- "Gross collected" deliberately includes succeeded, partially-refunded and
  -- refunded payment rows because all three represent money that was
  -- successfully collected before refund activity.
  -- --------------------------------------------------------------------------

  select coalesce(sum(p.amount_minor), 0)
  into v_booking_gross_collected
  from public.booking_payments as p
  where p.booking_id = v_booking.id
    and p.payment_status in (
      'succeeded',
      'partially_refunded',
      'refunded'
    );


  select coalesce(sum(r.amount_minor), 0)
  into v_booking_refunded_total
  from public.payment_refunds as r
  where r.booking_id = v_booking.id
    and r.refund_status = 'succeeded';


  if v_booking_gross_collected <= 0 then
    raise exception
      'Refund booking has no successful collected payments'
      using errcode = '23514';
  end if;


  if v_booking_refunded_total > v_booking_gross_collected then
    raise exception
      'Successful booking refunds exceed collected payments'
      using errcode = '23514';
  end if;


  if v_booking_refunded_total = v_booking_gross_collected then
    v_expected_booking_payment_status := 'refunded';
  else
    v_expected_booking_payment_status := 'partially_refunded';
  end if;


  update public.bookings as b
  set payment_status = v_expected_booking_payment_status
  where b.id = v_booking.id;


  -- --------------------------------------------------------------------------
  -- Return confirmed financial state.
  -- --------------------------------------------------------------------------

  return query
  select
    r.id,
    b.id,
    r.refund_status,
    p.payment_status,
    b.payment_status,
    v_payment_refunded_total,
    v_booking_refunded_total,
    r.succeeded_at
  from public.payment_refunds as r
  join public.booking_payments as p
    on p.id = r.booking_payment_id
  join public.bookings as b
    on b.id = r.booking_id
  where r.id = target_refund_id;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.request_payment_refund(
  uuid,
  uuid,
  bigint,
  text
)
from public, anon, authenticated;


grant execute
on function public.request_payment_refund(
  uuid,
  uuid,
  bigint,
  text
)
to authenticated;


revoke all
on function public.confirm_payment_refund(
  uuid,
  text,
  timestamptz
)
from public, anon, authenticated;


grant execute
on function public.confirm_payment_refund(
  uuid,
  text,
  timestamptz
)
to service_role;


comment on function public.request_payment_refund(
  uuid,
  uuid,
  bigint,
  text
) is
  'Creates an idempotent pending refund against a refundable payment for a cancelled or completed booking. Restricted to booking financial administrators; booking/provider/currency are derived from authoritative payment records.';


comment on function public.confirm_payment_refund(
  uuid,
  text,
  timestamptz
) is
  'Trusted provider-success workflow that atomically confirms a refund and recalculates the original payment and aggregate booking payment states.';
