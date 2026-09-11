-- Host booking requests: snapshot-safe reads and current approval eligibility.
-- No repricing, snapshot changes, payment collection or scheduler configuration.

-- Safe projections run with a fixed trusted owner after raw SELECT is revoked.
alter view public.my_bookings owner to postgres;
alter view public.my_booking_items owner to postgres;
alter view public.my_booking_price_lines owner to postgres;
alter view public.my_booking_payment_schedule owner to postgres;
alter view public.my_booking_payments owner to postgres;
alter view public.my_payment_refunds owner to postgres;
alter view public.my_booking_status_history owner to postgres;
alter view public.operator_booking_payments owner to postgres;
alter view public.operator_payment_refunds owner to postgres;
alter view public.my_booking_summaries owner to postgres;
alter view public.my_booking_item_summaries owner to postgres;

create view public.operator_booking_summaries
with (security_barrier = true)
as
select
  b.id,
  b.booking_reference,
  b.organization_id,
  o.display_name as organization_display_name,
  o.status as organization_status,
  b.venue_id,
  b.venue_snapshot ->> 'name' as venue_name,
  b.venue_snapshot ->> 'timezone' as venue_timezone,
  case when jsonb_typeof(b.customer_snapshot -> 'display_name') = 'string'
    then b.customer_snapshot ->> 'display_name'
    else null end as customer_display_name,
  case when jsonb_typeof(b.booking_request_snapshot #> '{request_details,notes}') = 'string'
    then b.booking_request_snapshot #>> '{request_details,notes}'
    else null end as customer_notes,
  b.booking_status,
  b.payment_status,
  b.event_starts_at,
  b.event_ends_at,
  b.event_type,
  b.guest_count,
  b.submitted_at,
  b.created_at,
  b.hold_expires_at,
  b.currency_code,
  b.customer_total_minor,
  b.marketplace_commission_minor,
  b.venue_net_before_fees_minor
from public.bookings as b
join public.organizations as o on o.id = b.organization_id
where private.can_operate_organization(b.organization_id);

alter view public.operator_booking_summaries owner to postgres;
revoke all on table public.operator_booking_summaries from public, anon, authenticated;
grant select on table public.operator_booking_summaries to authenticated;

create view public.operator_booking_item_summaries
with (security_barrier = true)
as
select
  bi.id,
  bi.booking_id,
  bi.space_id,
  bi.space_layout_id,
  bi.item_starts_at,
  bi.item_ends_at,
  bi.sort_order,
  bi.selection_snapshot -> 'space' ->> 'name' as space_name,
  bi.selection_snapshot -> 'layout' ->> 'name' as layout_name
from public.booking_items as bi
join public.bookings as b on b.id = bi.booking_id
where private.can_operate_organization(b.organization_id);

alter view public.operator_booking_item_summaries owner to postgres;
revoke all on table public.operator_booking_item_summaries from public, anon, authenticated;
grant select on table public.operator_booking_item_summaries to authenticated;

-- Browser reads must use safe projections, never snapshot-bearing base rows.
revoke select on table public.bookings, public.booking_items from authenticated;

create or replace function public.approve_booking_hold(
  target_booking_id uuid
)
returns table (
  approved_booking_id uuid,
  status text,
  hold_expires_at timestamptz,
  allocations_created integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.bookings%rowtype;

  v_now timestamptz;

  -- Initial VV operational default.
  -- This can later move to platform configuration without changing callers.
  v_hold_duration constant interval := interval '30 minutes';

  v_hold_expires_at timestamptz;

  v_organization_status text;
  v_venue_status text;

  v_item record;

  v_reserved_from timestamptz;
  v_reserved_until timestamptz;

  v_allocation_count integer := 0;
begin
  -- --------------------------------------------------------------------------
  -- Authentication / authorization
  -- --------------------------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not private.can_operate_booking(target_booking_id) then
    raise exception 'You are not permitted to approve this booking'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock booking
  --
  -- Only one lifecycle workflow may operate this booking at a time.
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
  -- Validate booking lifecycle
  -- --------------------------------------------------------------------------

  if v_booking.booking_status <> 'requested' then
    raise exception
      'Booking must be requested before approval; current status is %',
      v_booking.booking_status
      using errcode = '23514';
  end if;

  if v_booking.payment_status <> 'unpaid' then
    raise exception 'Booking payment status must be unpaid before approval'
      using errcode = '23514';
  end if;

  -- Publication also locks organization before venue. SHARE prevents concurrent
  -- organization status changes without serializing approvals at other venues.
  select o.status
  into v_organization_status
  from public.organizations as o
  where o.id = v_booking.organization_id
  for share;

  if not found then
    raise exception 'Booking organization not found'
      using errcode = 'P0002';
  end if;

  if v_organization_status <> 'active' then
    raise exception 'Booking organization is not active'
      using errcode = '23514';
  end if;

  -- Venue UPDATE serializes publication and blackout workflows.
  select v.status
  into v_venue_status
  from public.venues as v
  where v.id = v_booking.venue_id
  for update;

  if not found then
    raise exception 'Booking venue not found'
      using errcode = 'P0002';
  end if;

  if v_venue_status <> 'published' then
    raise exception 'Booking venue is not currently published'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Booking must contain at least one space.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from public.booking_items as bi
    where bi.booking_id = target_booking_id
  ) then
    raise exception 'Booking contains no reservable spaces'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock all involved spaces in deterministic UUID order.
  --
  -- This serializes competing reservation/blackout workflows touching the
  -- same spaces and reduces deadlock risk.
  -- --------------------------------------------------------------------------

  perform s.id
  from public.spaces as s
  where exists (
    select 1 from public.booking_items as bi
    where bi.booking_id = target_booking_id and bi.space_id = s.id
  )
  order by s.id
  for update;

  -- Existing rule rows cannot be updated/deleted while approval consumes them.
  -- For a missing row, the immediate space_id FK requires parent KEY SHARE
  -- on INSERT, which conflicts with the parent space UPDATE lock above.
  -- At READ COMMITTED, an insert that obtained that FK lock first commits before
  -- our parent lock completes and is visible to this subsequent statement.
  -- An insert starting after our parent lock waits until approval commits.
  perform r.space_id
  from public.space_booking_rules as r
  where exists (
    select 1 from public.booking_items as bi
    where bi.booking_id = target_booking_id and bi.space_id = r.space_id
  )
  order by r.space_id
  for share;

  perform sl.id
  from public.space_layouts as sl
  where exists (
    select 1 from public.booking_items as bi
    where bi.booking_id = target_booking_id and bi.space_layout_id = sl.id
  )
  order by sl.id
  for share;

  -- Recheck permission after all potentially blocking workflow row locks.
  if not private.can_operate_booking(target_booking_id) then
    raise exception 'You are not permitted to approve this booking'
      using errcode = '42501';
  end if;

  v_now := clock_timestamp();

  if v_booking.event_starts_at <= v_now then
    raise exception 'Cannot approve a booking whose event has already started'
      using errcode = '23514';
  end if;

  -- Every selected space must still be active.

  if exists (
    select 1
    from public.booking_items as bi
    join public.spaces as s
      on s.id = bi.space_id
    where bi.booking_id = target_booking_id
      and s.status <> 'active'
  ) then
    raise exception 'One or more selected spaces are not active'
      using errcode = '23514';
  end if;


  -- A declared guest count must fit the current generic space capacity.
  -- MAX ignores NULL; an entirely undeclared capacity remains NULL, never zero.
  -- Legacy NULL guest counts skip this comparison without inventing a count.
  if v_booking.guest_count is not null and exists (
    select 1
    from public.booking_items as bi
    join public.spaces as s on s.id = bi.space_id
    cross join lateral (
      select max(c.capacity) as maximum_capacity
      from (values (s.seated_capacity), (s.standing_capacity),
                   (s.theatre_capacity)) as c(capacity)
    ) as capacity
    where bi.booking_id = target_booking_id
      and (capacity.maximum_capacity is null
           or capacity.maximum_capacity < v_booking.guest_count)
  ) then
    raise exception 'Current space capacity does not accommodate the guest count'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.booking_items as bi
    left join public.space_layouts as sl on sl.id = bi.space_layout_id
    where bi.booking_id = target_booking_id
      and bi.space_layout_id is not null
      and (sl.id is null or sl.space_id is distinct from bi.space_id
           or sl.status <> 'active'
           or (v_booking.guest_count is not null and sl.capacity is not null
               and sl.capacity < v_booking.guest_count))
  ) then
    raise exception 'Selected layout is no longer eligible for this booking'
      using errcode = '23514';
  end if;


  -- A requested booking should never already own active reservation inventory.

  if exists (
    select 1
    from public.booking_space_allocations as a
    where a.booking_id = target_booking_id
      and a.allocation_status in ('held', 'confirmed')
  ) then
    raise exception 'Booking already has active reservation allocations'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Hold expiry
  -- --------------------------------------------------------------------------

  v_hold_expires_at := v_now + v_hold_duration;


  -- --------------------------------------------------------------------------
  -- Allocate each booking item.
  --
  -- Reservation periods include operational buffer time from
  -- space_booking_rules.
  -- --------------------------------------------------------------------------

  for v_item in
    select
      bi.id as booking_item_id,
      bi.space_id,
      bi.item_starts_at,
      bi.item_ends_at,
      r.minimum_duration_minutes,
      r.maximum_duration_minutes,
      r.minimum_notice_minutes,
      r.maximum_advance_days,
      coalesce(r.buffer_before_minutes, 0) as buffer_before_minutes,
      coalesce(r.buffer_after_minutes, 0) as buffer_after_minutes
    from public.booking_items as bi
    left join public.space_booking_rules as r
      on r.space_id = bi.space_id
    where bi.booking_id = target_booking_id
    order by
      bi.space_id,
      bi.id
  loop

    -- ------------------------------------------------------------------------
    -- Space booking rules
    -- ------------------------------------------------------------------------

    if v_item.minimum_duration_minutes is not null
       and v_item.item_ends_at - v_item.item_starts_at
           < make_interval(mins => v_item.minimum_duration_minutes)
    then
      raise exception
        'Booking item is shorter than the minimum duration for its space'
        using errcode = '23514';
    end if;

    if v_item.maximum_duration_minutes is not null
       and v_item.item_ends_at - v_item.item_starts_at
           > make_interval(mins => v_item.maximum_duration_minutes)
    then
      raise exception
        'Booking item exceeds the maximum duration for its space'
        using errcode = '23514';
    end if;

    if v_item.minimum_notice_minutes is not null
       and v_item.item_starts_at
           < v_now + make_interval(mins => v_item.minimum_notice_minutes)
    then
      raise exception
        'Booking item does not satisfy the minimum notice period'
        using errcode = '23514';
    end if;

    if v_item.maximum_advance_days is not null
       and v_item.item_starts_at
           > v_now + make_interval(days => v_item.maximum_advance_days)
    then
      raise exception
        'Booking item is beyond the maximum advance-booking period'
        using errcode = '23514';
    end if;


    -- ------------------------------------------------------------------------
    -- Operational reservation buffers
    -- ------------------------------------------------------------------------

    v_reserved_from :=
      v_item.item_starts_at
      - make_interval(mins => v_item.buffer_before_minutes);

    v_reserved_until :=
      v_item.item_ends_at
      + make_interval(mins => v_item.buffer_after_minutes);


    -- ------------------------------------------------------------------------
    -- Venue blackout
    -- ------------------------------------------------------------------------

    if exists (
      select 1
      from public.venue_blackouts as vb
      where vb.venue_id = v_booking.venue_id
        and vb.cancelled_at is null
        and vb.blocked_during &&
            tstzrange(v_reserved_from, v_reserved_until, '[)')
    ) then
      raise exception
        'Booking conflicts with an active venue blackout'
        using errcode = '23P01';
    end if;


    -- ------------------------------------------------------------------------
    -- Space blackout
    -- ------------------------------------------------------------------------

    if exists (
      select 1
      from public.space_blackouts as sb
      where sb.space_id = v_item.space_id
        and sb.cancelled_at is null
        and sb.blocked_during &&
            tstzrange(v_reserved_from, v_reserved_until, '[)')
    ) then
      raise exception
        'Booking conflicts with an active space blackout'
        using errcode = '23P01';
    end if;


    -- ------------------------------------------------------------------------
    -- Temporary inventory hold
    --
    -- PostgreSQL's exclusion constraint is the final authority preventing
    -- overlapping held/confirmed allocations.
    -- ------------------------------------------------------------------------

    begin
      insert into public.booking_space_allocations (
        booking_id,
        booking_item_id,
        space_id,
        allocation_status,
        reserved_from,
        reserved_until,
        hold_expires_at
      )
      values (
        target_booking_id,
        v_item.booking_item_id,
        v_item.space_id,
        'held',
        v_reserved_from,
        v_reserved_until,
        v_hold_expires_at
      );

    exception
      when exclusion_violation then
        raise exception
          'One or more requested spaces are no longer available'
          using errcode = '23P01';
    end;

    v_allocation_count := v_allocation_count + 1;

  end loop;


  -- --------------------------------------------------------------------------
  -- Booking lifecycle transition
  --
  -- The existing AFTER booking-status trigger automatically records:
  --   requested -> approved_hold
  -- and auth.uid() as changed_by_user_id.
  -- --------------------------------------------------------------------------

  update public.bookings as b
  set
    booking_status = 'approved_hold',
    approved_at = v_now,
    hold_expires_at = v_hold_expires_at
  where b.id = target_booking_id;


  -- --------------------------------------------------------------------------
  -- Result
  -- --------------------------------------------------------------------------

  return query
  select
    b.id,
    b.booking_status,
    b.hold_expires_at,
    v_allocation_count
  from public.bookings as b
  where b.id = target_booking_id;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

alter function public.approve_booking_hold(uuid) owner to postgres;

revoke all
on function public.approve_booking_hold(uuid)
from public;

revoke all
on function public.approve_booking_hold(uuid)
from anon;

revoke all
on function public.approve_booking_hold(uuid)
from authenticated;

grant execute
on function public.approve_booking_hold(uuid)
to authenticated;


comment on function public.approve_booking_hold(uuid) is
  'Atomically approves a requested booking and creates temporary held space allocations for an authorized organization operator.';

-- Preserve the existing trusted-only expiry implementation. Overdue held rows
-- keep blocking inventory until expiry commits. Production must provision a
-- trusted runner at approximately one-minute cadence before enabling approval.
alter function public.expire_booking_hold(uuid) owner to postgres;
revoke all on function public.expire_booking_hold(uuid) from public, anon, authenticated;
grant execute on function public.expire_booking_hold(uuid) to service_role;
