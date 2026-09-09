-- ============================================================================
-- VV booking cancellation workflow
-- ============================================================================
--
-- Cancellation changes booking/reservation state without rewriting payment
-- history or implicitly creating refunds.
--
-- Customer:
--   requested / approved_hold / confirmed -> cancelled
--
-- Venue operator:
--   approved_hold / confirmed -> cancelled
--
-- Requested bookings should be declined by venue operators through a separate
-- decline workflow.
--
-- Active allocations:
--   held / confirmed -> released
--
-- Future schedule installments:
--   pending / due -> cancelled
--
-- Paid installments remain paid.
-- Existing payment rows remain historical facts.
-- Refunds are handled separately.
-- ============================================================================


-- ============================================================================
-- Internal status-change context
--
-- The existing booking-status trigger owns history insertion. This private,
-- transaction-scoped context lets trusted workflow functions provide a reason
-- without allowing callers to insert or mutate history rows directly.
-- ============================================================================

create table private.booking_status_change_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  booking_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),

  primary key (
    backend_pid,
    transaction_id,
    booking_id
  ),

  constraint booking_status_change_context_reason_check
    check (
      reason is null
      or (
        char_length(trim(reason)) >= 1
        and char_length(trim(reason)) <= 1000
      )
    )
);


revoke all
on table private.booking_status_change_context
from public, anon, authenticated;


-- ============================================================================
-- Extend existing booking status-history trigger so trusted workflows may
-- supply a reason through the private transaction context.
-- ============================================================================

create or replace function private.record_booking_status_history()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reason text;
begin
  select c.reason
  into v_reason
  from private.booking_status_change_context as c
  where c.backend_pid = pg_catalog.pg_backend_pid()
    and c.transaction_id = pg_catalog.txid_current()
    and c.booking_id = new.id;


  if tg_op = 'INSERT' then

    insert into public.booking_status_history (
      booking_id,
      from_status,
      to_status,
      changed_by_user_id,
      reason
    )
    values (
      new.id,
      null,
      new.booking_status,
      auth.uid(),
      v_reason
    );

  elsif new.booking_status is distinct from old.booking_status then

    insert into public.booking_status_history (
      booking_id,
      from_status,
      to_status,
      changed_by_user_id,
      reason
    )
    values (
      new.id,
      old.booking_status,
      new.booking_status,
      auth.uid(),
      v_reason
    );

  end if;


  -- Context is single-use. If none existed, this is simply a no-op.
  delete from private.booking_status_change_context as c
  where c.backend_pid = pg_catalog.pg_backend_pid()
    and c.transaction_id = pg_catalog.txid_current()
    and c.booking_id = new.id;


  return new;
end;
$function$;


revoke all
on function private.record_booking_status_history()
from public, anon, authenticated;


-- ============================================================================
-- Cancel booking
-- ============================================================================

create or replace function public.cancel_booking(
  target_booking_id uuid,
  cancellation_reason text
)
returns table (
  cancelled_booking_id uuid,
  status text,
  booking_payment_status text,
  allocations_released integer,
  installments_cancelled integer,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.bookings%rowtype;

  v_now timestamptz := now();

  v_is_customer boolean;
  v_is_operator boolean;

  v_booking_item_count integer;
  v_expected_allocation_count integer;

  v_allocations_released integer := 0;
  v_installments_cancelled integer := 0;
begin
  -- --------------------------------------------------------------------------
  -- Authentication
  -- --------------------------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Reason
  -- --------------------------------------------------------------------------

  if cancellation_reason is null
     or char_length(trim(cancellation_reason)) < 1
     or char_length(trim(cancellation_reason)) > 1000
  then
    raise exception
      'Cancellation reason must contain between 1 and 1000 characters'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Authorization
  -- --------------------------------------------------------------------------

  v_is_customer :=
    private.is_booking_customer(target_booking_id);

  v_is_operator :=
    private.can_operate_booking(target_booking_id);

  if not v_is_customer and not v_is_operator then
    raise exception 'You are not permitted to cancel this booking'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock booking first.
  --
  -- Payment confirmation and hold expiry also lock the booking first, so
  -- cancellation cannot race those workflows into contradictory states.
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
  -- Lifecycle authorization
  -- --------------------------------------------------------------------------

  if v_is_customer then

    if v_booking.booking_status not in (
      'requested',
      'approved_hold',
      'confirmed'
    ) then
      raise exception
        'Customer cannot cancel booking from status %',
        v_booking.booking_status
        using errcode = '23514';
    end if;

  else

    -- Venue-side requested bookings belong to the separate decline workflow.
    if v_booking.booking_status not in (
      'approved_hold',
      'confirmed'
    ) then
      raise exception
        'Venue operator cannot cancel booking from status %',
        v_booking.booking_status
        using errcode = '23514';
    end if;

  end if;


  -- --------------------------------------------------------------------------
  -- Do not cancel while a payment attempt is actively processing.
  --
  -- This avoids creating an ambiguous state where the provider may already be
  -- completing a charge while the booking is being cancelled.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_payments as p
    where p.booking_id = target_booking_id
      and p.payment_status = 'processing'
  ) then
    raise exception
      'Booking cannot be cancelled while a payment is processing'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Reservation integrity
  -- --------------------------------------------------------------------------

  select count(*)
  into v_booking_item_count
  from public.booking_items as bi
  where bi.booking_id = target_booking_id;


  if v_booking.booking_status = 'requested' then

    if exists (
      select 1
      from public.booking_space_allocations as a
      where a.booking_id = target_booking_id
        and a.allocation_status in ('held', 'confirmed')
    ) then
      raise exception
        'Requested booking unexpectedly owns active reservation inventory'
        using errcode = '23514';
    end if;

  elsif v_booking.booking_status = 'approved_hold' then

    select count(*)
    into v_expected_allocation_count
    from public.booking_space_allocations as a
    where a.booking_id = target_booking_id
      and a.allocation_status = 'held';

    if v_booking_item_count = 0
       or v_expected_allocation_count <> v_booking_item_count
    then
      raise exception
        'Approved booking has inconsistent held reservation allocations'
        using errcode = '23514';
    end if;

  elsif v_booking.booking_status = 'confirmed' then

    select count(*)
    into v_expected_allocation_count
    from public.booking_space_allocations as a
    where a.booking_id = target_booking_id
      and a.allocation_status = 'confirmed';

    if v_booking_item_count = 0
       or v_expected_allocation_count <> v_booking_item_count
    then
      raise exception
        'Confirmed booking has inconsistent reservation allocations'
        using errcode = '23514';
    end if;

  end if;


  -- --------------------------------------------------------------------------
  -- Release active reservation inventory.
  --
  -- Existing allocation validator permits:
  --
  --   held      -> released
  --   confirmed -> released
  -- --------------------------------------------------------------------------

  update public.booking_space_allocations as a
  set
    allocation_status = 'released',
    released_at = v_now,
    release_reason = 'Booking cancelled'
  where a.booking_id = target_booking_id
    and a.allocation_status in ('held', 'confirmed');

  get diagnostics v_allocations_released = row_count;


  -- --------------------------------------------------------------------------
  -- Cancel unpaid future installments.
  --
  -- Paid/waived installments remain historical facts.
  -- --------------------------------------------------------------------------

  update public.booking_payment_schedule as s
  set
    status = 'cancelled',
    paid_at = null
  where s.booking_id = target_booking_id
    and s.status in ('pending', 'due');

  get diagnostics v_installments_cancelled = row_count;


  -- --------------------------------------------------------------------------
  -- Supply cancellation reason to the existing status-history trigger.
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
    trim(cancellation_reason)
  );


  -- --------------------------------------------------------------------------
  -- Booking lifecycle transition.
  --
  -- Payment status deliberately remains unchanged:
  --
  -- unpaid / partially_paid / paid
  --
  -- Refund workflows will later change financial state when money is actually
  -- refunded.
  -- --------------------------------------------------------------------------

  update public.bookings as b
  set
    booking_status = 'cancelled',
    cancelled_at = v_now
  where b.id = target_booking_id;


  -- The history trigger must consume its context.
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
  -- Return cancelled state.
  -- --------------------------------------------------------------------------

  return query
  select
    b.id,
    b.booking_status,
    b.payment_status,
    v_allocations_released,
    v_installments_cancelled,
    b.cancelled_at
  from public.bookings as b
  where b.id = target_booking_id;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.cancel_booking(uuid, text)
from public;

revoke all
on function public.cancel_booking(uuid, text)
from anon;

revoke all
on function public.cancel_booking(uuid, text)
from authenticated;

grant execute
on function public.cancel_booking(uuid, text)
to authenticated;


comment on function public.cancel_booking(uuid, text) is
  'Cancels an eligible booking, releases active reservation inventory, cancels unpaid future installments, and records the cancellation reason in append-only booking status history. Does not create refunds or rewrite received payment history.';
