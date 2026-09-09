-- ============================================================================
-- VV customer booking-request submission
-- ============================================================================
--
-- Customer-supplied facts:
--
--   submission UUID
--   venue
--   overall event start/end
--   selected spaces
--   optional layouts
--   optional per-space start/end times
--   event type
--   guest count
--   request details
--
-- Customer/browser does NOT supply:
--
--   rate plan
--   unit price
--   customer total
--   commission
--   venue net
--   deposit amount
--   final balance amount
--   final balance due date
--
-- Those values are derived from authoritative database configuration and
-- snapshotted atomically when the request is submitted.
--
-- Booking requests deliberately create NO reservation allocations.
-- Inventory is reserved later only when an authorized venue operator approves
-- the request through approve_booking_hold().
--
-- V1 pricing semantics:
--
--   hourly -> one unit per started hour
--   daily  -> one unit per started 24-hour block
--   flat   -> one unit
--
-- Rate-plan validity, weekday selection and rate overrides use the venue-local
-- calendar date on which each booking item starts.
-- ============================================================================


create or replace function public.submit_booking_request(
  submission_id uuid,
  target_venue_id uuid,
  event_starts_at_value timestamptz,
  event_ends_at_value timestamptz,
  selected_items jsonb,
  event_type_value text default null,
  guest_count_value integer default null,
  request_details jsonb default '{}'::jsonb
)
returns table (
  submitted_booking_id uuid,
  booking_reference text,
  status text,
  customer_total_minor bigint,
  deposit_amount_minor bigint,
  final_amount_minor bigint,
  final_due_at timestamptz,
  items_created integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := now();

  v_existing public.bookings%rowtype;

  v_customer_email text;
  v_customer_display_name text;
  v_customer_phone text;
  v_customer_locale text;

  v_venue_organization_id uuid;
  v_venue_name text;
  v_venue_slug text;
  v_venue_description text;
  v_venue_timezone text;
  v_venue_currency text;
  v_venue_status text;
  v_venue_published_at timestamptz;

  v_address_snapshot jsonb;

  v_term_id uuid;
  v_term_version integer;
  v_commission_bps integer;
  v_deposit_bps integer;
  v_final_due_days integer;
  v_terms_jsonb jsonb;

  v_reference text;

  v_input_item record;
  v_item_json jsonb;

  v_space_id uuid;
  v_layout_id uuid;

  v_item_start timestamptz;
  v_item_end timestamptz;

  v_space_name text;
  v_space_description text;
  v_space_status text;

  v_layout_name text;
  v_layout_type text;
  v_layout_description text;
  v_layout_capacity integer;
  v_layout_status text;

  v_minimum_duration_minutes integer;
  v_maximum_duration_minutes integer;
  v_minimum_notice_minutes integer;
  v_maximum_advance_days integer;
  v_buffer_before_minutes integer;
  v_buffer_after_minutes integer;
  v_requires_host_approval boolean;

  v_local_date date;
  v_local_weekday smallint;

  v_rate_plan_id uuid;
  v_rate_plan_name text;
  v_pricing_model text;
  v_base_unit_amount bigint;
  v_applied_unit_amount bigint;
  v_rate_priority integer;

  v_override_id uuid;
  v_override_amount bigint;
  v_override_reason text;

  v_billing_units bigint;
  v_item_amount bigint;

  v_booking_item_id uuid;

  v_customer_total bigint := 0;
  v_marketplace_commission bigint;
  v_venue_net bigint;

  v_deposit_amount bigint;
  v_final_amount bigint;
  v_final_due_at timestamptz;

  v_items_created integer := 0;
  v_price_sequence integer := 0;

  v_existing_deposit bigint;
  v_existing_final bigint;
  v_existing_final_due_at timestamptz;
  v_existing_items integer;
begin
  -- --------------------------------------------------------------------------
  -- Authentication
  -- --------------------------------------------------------------------------

  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if submission_id is null then
    raise exception 'Submission ID is required'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotency
  --
  -- The client generates one UUID for one logical submission and reuses that
  -- UUID when retrying after a network failure or accidental double-click.
  --
  -- The first successful submission owns the UUID permanently.
  -- --------------------------------------------------------------------------

  select b.*
  into v_existing
  from public.bookings as b
  where b.id = submission_id;

  if found then

    if v_existing.customer_user_id is distinct from auth.uid() then
      raise exception 'Submission ID has already been used'
        using errcode = '23505';
    end if;

    -- An idempotency key may replay the same logical request only.
    -- Reusing it for different venue/event/selections/details is an error.
    if v_existing.venue_id is distinct from target_venue_id
       or v_existing.event_starts_at is distinct from event_starts_at_value
       or v_existing.event_ends_at is distinct from event_ends_at_value
       or v_existing.event_type
            is distinct from nullif(trim(event_type_value), '')
       or v_existing.guest_count is distinct from guest_count_value
       or coalesce(
            v_existing.booking_request_snapshot -> 'request_details',
            '{}'::jsonb
          ) is distinct from request_details
       or coalesce(
            v_existing.booking_request_snapshot -> 'selected_items',
            '[]'::jsonb
          ) is distinct from selected_items
    then
      raise exception
        'Submission ID has already been used with different request data'
        using errcode = '23505';
    end if;

    select s.amount_minor
    into v_existing_deposit
    from public.booking_payment_schedule as s
    where s.booking_id = submission_id
      and s.installment_type = 'deposit'
    order by s.sequence
    limit 1;

    select
      s.amount_minor,
      s.due_at
    into
      v_existing_final,
      v_existing_final_due_at
    from public.booking_payment_schedule as s
    where s.booking_id = submission_id
      and s.installment_type = 'final'
    order by s.sequence
    limit 1;

    select count(*)
    into v_existing_items
    from public.booking_items as bi
    where bi.booking_id = submission_id;

    return query
    select
      v_existing.id,
      v_existing.booking_reference,
      v_existing.booking_status,
      v_existing.customer_total_minor,
      v_existing_deposit,
      v_existing_final,
      v_existing_final_due_at,
      v_existing_items;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Input validation
  -- --------------------------------------------------------------------------

  if event_starts_at_value is null
     or event_ends_at_value is null
  then
    raise exception 'Event start and end times are required'
      using errcode = '23514';
  end if;


  if event_ends_at_value <= event_starts_at_value then
    raise exception 'Event end time must be after event start time'
      using errcode = '23514';
  end if;


  if event_starts_at_value <= v_now then
    raise exception 'Booking request event must start in the future'
      using errcode = '23514';
  end if;


  if event_type_value is not null
     and (
       char_length(trim(event_type_value)) < 1
       or char_length(trim(event_type_value)) > 120
     )
  then
    raise exception 'Event type must contain between 1 and 120 characters'
      using errcode = '23514';
  end if;


  if guest_count_value is not null
     and guest_count_value <= 0
  then
    raise exception 'Guest count must be greater than zero'
      using errcode = '23514';
  end if;


  if selected_items is null
     or jsonb_typeof(selected_items) <> 'array'
  then
    raise exception 'Selected items must be a JSON array'
      using errcode = '23514';
  end if;


  if jsonb_array_length(selected_items) < 1 then
    raise exception 'At least one space must be selected'
      using errcode = '23514';
  end if;


  if jsonb_array_length(selected_items) > 20 then
    raise exception 'A booking request may contain at most 20 selected spaces'
      using errcode = '23514';
  end if;


  if request_details is null
     or jsonb_typeof(request_details) <> 'object'
  then
    raise exception 'Request details must be a JSON object'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Customer snapshot
  -- --------------------------------------------------------------------------

  select
    u.email,
    p.display_name,
    p.phone_e164,
    p.locale
  into
    v_customer_email,
    v_customer_display_name,
    v_customer_phone,
    v_customer_locale
  from public.user_profiles as p
  left join auth.users as u
    on u.id = p.id
  where p.id = auth.uid();

  if not found then
    raise exception 'Authenticated user profile not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Authoritative venue
  -- --------------------------------------------------------------------------

  select
    v.organization_id,
    v.name,
    v.slug,
    v.description,
    v.timezone,
    v.default_currency_code,
    v.status,
    v.published_at
  into
    v_venue_organization_id,
    v_venue_name,
    v_venue_slug,
    v_venue_description,
    v_venue_timezone,
    v_venue_currency,
    v_venue_status,
    v_venue_published_at
  from public.venues as v
  where v.id = target_venue_id
  for share;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  if v_venue_status <> 'published'
     or v_venue_published_at is null
  then
    raise exception 'Venue is not currently published'
      using errcode = '23514';
  end if;


  select jsonb_build_object(
    'address_line_1', va.address_line_1,
    'address_line_2', va.address_line_2,
    'city', va.city,
    'region', va.region,
    'postal_code', va.postal_code,
    'country_code', va.country_code,
    'latitude', va.latitude,
    'longitude', va.longitude
  )
  into v_address_snapshot
  from public.venue_addresses as va
  where va.venue_id = target_venue_id;


  -- --------------------------------------------------------------------------
  -- Effective commercial terms
  --
  -- The booking snapshots whichever version is effective at the exact
  -- submission instant.
  -- --------------------------------------------------------------------------

  select
    t.id,
    t.version_number,
    t.commission_bps,
    t.deposit_bps,
    t.final_balance_due_days_before_event,
    t.terms_jsonb
  into
    v_term_id,
    v_term_version,
    v_commission_bps,
    v_deposit_bps,
    v_final_due_days,
    v_terms_jsonb
  from public.organization_commercial_term_versions as t
  where t.organization_id = v_venue_organization_id
    and t.effective_during @> v_now
  order by t.effective_from desc
  limit 1
  for share;

  if not found then
    raise exception 'Venue organization has no effective commercial terms'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Stable booking identity
  --
  -- The browser-generated submission UUID is safe to trust as identity only.
  -- It is never trusted for commercial values.
  -- --------------------------------------------------------------------------

  v_reference :=
    'VV-' || upper(replace(submission_id::text, '-', ''));


  -- --------------------------------------------------------------------------
  -- Create shell booking.
  --
  -- Financial aggregates start at zero while authoritative item pricing is
  -- calculated inside this same transaction. No partial state can commit.
  -- --------------------------------------------------------------------------

  insert into public.bookings (
    id,
    booking_reference,
    organization_id,
    venue_id,
    customer_user_id,
    booking_status,
    payment_status,
    event_starts_at,
    event_ends_at,
    event_type,
    guest_count,
    currency_code,
    commercial_term_version_id,
    commission_bps,
    customer_total_minor,
    marketplace_commission_minor,
    venue_net_before_fees_minor,
    customer_snapshot,
    venue_snapshot,
    commercial_terms_snapshot,
    booking_request_snapshot,
    submitted_at
  )
  values (
    submission_id,
    v_reference,
    v_venue_organization_id,
    target_venue_id,
    auth.uid(),
    'requested',
    'unpaid',
    event_starts_at_value,
    event_ends_at_value,
    nullif(trim(event_type_value), ''),
    guest_count_value,
    v_venue_currency,
    v_term_id,
    v_commission_bps,
    0,
    0,
    0,

    jsonb_build_object(
      'user_id', auth.uid(),
      'email', v_customer_email,
      'display_name', v_customer_display_name,
      'phone_e164', v_customer_phone,
      'locale', v_customer_locale
    ),

    jsonb_build_object(
      'venue_id', target_venue_id,
      'organization_id', v_venue_organization_id,
      'name', v_venue_name,
      'slug', v_venue_slug,
      'description', v_venue_description,
      'timezone', v_venue_timezone,
      'currency_code', v_venue_currency,
      'address', v_address_snapshot
    ),

    jsonb_build_object(
      'commercial_term_version_id', v_term_id,
      'version_number', v_term_version,
      'commission_bps', v_commission_bps,
      'deposit_bps', v_deposit_bps,
      'final_balance_due_days_before_event', v_final_due_days,
      'terms', v_terms_jsonb
    ),

    jsonb_build_object(
      'submission_id', submission_id,
      'submitted_via', 'customer_booking_request',
      'request_details', request_details,
      'selected_items', selected_items
    ),

    v_now
  );


  -- --------------------------------------------------------------------------
  -- Price and snapshot every selected space.
  --
  -- Rate-plan choice is server-side:
  --
  --   * plan belongs to selected space
  --   * active
  --   * currency matches venue
  --   * venue-local start date is inside plan validity
  --   * venue-local weekday is supported
  --   * highest priority wins
  --
  -- Equal highest priorities are rejected instead of arbitrarily choosing one.
  -- --------------------------------------------------------------------------

  for v_input_item in
    select
      e.value,
      e.ordinality
    from jsonb_array_elements(selected_items)
      with ordinality as e(value, ordinality)
    order by e.ordinality
  loop

    v_item_json := v_input_item.value;


    if jsonb_typeof(v_item_json) <> 'object' then
      raise exception 'Every selected item must be a JSON object'
        using errcode = '23514';
    end if;


    v_space_id :=
      nullif(trim(v_item_json ->> 'space_id'), '')::uuid;

    if v_space_id is null then
      raise exception 'Every selected item requires a space_id'
        using errcode = '23514';
    end if;


    v_layout_id :=
      nullif(trim(v_item_json ->> 'space_layout_id'), '')::uuid;


    v_item_start :=
      coalesce(
        nullif(trim(v_item_json ->> 'item_starts_at'), '')::timestamptz,
        event_starts_at_value
      );

    v_item_end :=
      coalesce(
        nullif(trim(v_item_json ->> 'item_ends_at'), '')::timestamptz,
        event_ends_at_value
      );


    if v_item_end <= v_item_start then
      raise exception 'Booking item end time must be after its start time'
        using errcode = '23514';
    end if;


    if v_item_start < event_starts_at_value
       or v_item_end > event_ends_at_value
    then
      raise exception
        'Booking item period must fall within the overall event period'
        using errcode = '23514';
    end if;


    -- ------------------------------------------------------------------------
    -- Space
    -- ------------------------------------------------------------------------

    select
      s.name,
      s.description,
      s.status
    into
      v_space_name,
      v_space_description,
      v_space_status
    from public.spaces as s
    where s.id = v_space_id
      and s.venue_id = target_venue_id
    for share;

    if not found then
      raise exception 'Selected space does not belong to booking venue'
        using errcode = '23514';
    end if;


    if v_space_status <> 'active' then
      raise exception 'Selected space is not active'
        using errcode = '23514';
    end if;


    -- A single request may use the same space in separate time periods, but
    -- overlapping duplicate selections would never be approvable.

    if exists (
      select 1
      from public.booking_items as bi
      where bi.booking_id = submission_id
        and bi.space_id = v_space_id
        and bi.event_period &&
            tstzrange(v_item_start, v_item_end, '[)')
    ) then
      raise exception
        'The same space cannot be selected for overlapping item periods'
        using errcode = '23514';
    end if;


    -- ------------------------------------------------------------------------
    -- Optional layout
    -- ------------------------------------------------------------------------

    v_layout_name := null;
    v_layout_type := null;
    v_layout_description := null;
    v_layout_capacity := null;
    v_layout_status := null;


    if v_layout_id is not null then

      select
        sl.name,
        sl.layout_type,
        sl.description,
        sl.capacity,
        sl.status
      into
        v_layout_name,
        v_layout_type,
        v_layout_description,
        v_layout_capacity,
        v_layout_status
      from public.space_layouts as sl
      where sl.id = v_layout_id
        and sl.space_id = v_space_id
      for share;

      if not found then
        raise exception
          'Selected layout does not belong to selected space'
          using errcode = '23514';
      end if;


      if v_layout_status <> 'active' then
        raise exception 'Selected layout is not active'
          using errcode = '23514';
      end if;


      if guest_count_value is not null
         and v_layout_capacity is not null
         and guest_count_value > v_layout_capacity
      then
        raise exception
          'Guest count exceeds the selected layout capacity'
          using errcode = '23514';
      end if;

    end if;


    -- ------------------------------------------------------------------------
    -- Current operational booking rules
    --
    -- These are checked now for customer feedback and snapshotted. Approval
    -- checks the then-current rules again before inventory is actually held.
    -- ------------------------------------------------------------------------

    select
      r.minimum_duration_minutes,
      r.maximum_duration_minutes,
      r.minimum_notice_minutes,
      r.maximum_advance_days,
      coalesce(r.buffer_before_minutes, 0),
      coalesce(r.buffer_after_minutes, 0),
      coalesce(r.requires_host_approval, true)
    into
      v_minimum_duration_minutes,
      v_maximum_duration_minutes,
      v_minimum_notice_minutes,
      v_maximum_advance_days,
      v_buffer_before_minutes,
      v_buffer_after_minutes,
      v_requires_host_approval
    from public.space_booking_rules as r
    where r.space_id = v_space_id;


    if not found then
      v_minimum_duration_minutes := null;
      v_maximum_duration_minutes := null;
      v_minimum_notice_minutes := null;
      v_maximum_advance_days := null;
      v_buffer_before_minutes := 0;
      v_buffer_after_minutes := 0;
      v_requires_host_approval := true;
    end if;


    if v_minimum_duration_minutes is not null
       and v_item_end - v_item_start
           < make_interval(mins => v_minimum_duration_minutes)
    then
      raise exception
        'Booking item is shorter than the minimum duration for its space'
        using errcode = '23514';
    end if;


    if v_maximum_duration_minutes is not null
       and v_item_end - v_item_start
           > make_interval(mins => v_maximum_duration_minutes)
    then
      raise exception
        'Booking item exceeds the maximum duration for its space'
        using errcode = '23514';
    end if;


    if v_minimum_notice_minutes is not null
       and v_item_start
           < v_now + make_interval(mins => v_minimum_notice_minutes)
    then
      raise exception
        'Booking item does not satisfy the minimum notice period'
        using errcode = '23514';
    end if;


    if v_maximum_advance_days is not null
       and v_item_start
           > v_now + make_interval(days => v_maximum_advance_days)
    then
      raise exception
        'Booking item is beyond the maximum advance-booking period'
        using errcode = '23514';
    end if;


    -- ------------------------------------------------------------------------
    -- Venue-local pricing date
    -- ------------------------------------------------------------------------

    v_local_date :=
      (v_item_start at time zone v_venue_timezone)::date;

    v_local_weekday :=
      (extract(isodow from v_local_date)::integer - 1)::smallint;


    -- ------------------------------------------------------------------------
    -- Authoritative rate plan
    -- ------------------------------------------------------------------------

    select
      rp.id,
      rp.name,
      rp.pricing_model,
      rp.unit_amount_minor,
      rp.priority
    into
      v_rate_plan_id,
      v_rate_plan_name,
      v_pricing_model,
      v_base_unit_amount,
      v_rate_priority
    from public.space_rate_plans as rp
    where rp.space_id = v_space_id
      and rp.is_active = true
      and rp.currency_code = v_venue_currency
      and rp.valid_during @> v_local_date
      and v_local_weekday = any(rp.weekdays)
    order by
      rp.priority desc,
      rp.id
    limit 1
    for share;

    if not found then
      raise exception
        'Selected space has no applicable active rate plan for the event date'
        using errcode = '23514';
    end if;


    -- Equal highest-priority plans are configuration ambiguity. Do not silently
    -- choose based on UUID ordering.

    if exists (
      select 1
      from public.space_rate_plans as rp
      where rp.space_id = v_space_id
        and rp.is_active = true
        and rp.currency_code = v_venue_currency
        and rp.valid_during @> v_local_date
        and v_local_weekday = any(rp.weekdays)
        and rp.priority = v_rate_priority
        and rp.id <> v_rate_plan_id
    ) then
      raise exception
        'Selected space has multiple applicable rate plans with the same highest priority'
        using errcode = '23514';
    end if;


    -- ------------------------------------------------------------------------
    -- Date override
    -- ------------------------------------------------------------------------

    v_override_id := null;
    v_override_amount := null;
    v_override_reason := null;


    select
      ro.id,
      ro.unit_amount_minor,
      ro.reason
    into
      v_override_id,
      v_override_amount,
      v_override_reason
    from public.rate_overrides as ro
    where ro.rate_plan_id = v_rate_plan_id
      and ro.override_during @> v_local_date
    limit 1
    for share;


    v_applied_unit_amount :=
      coalesce(v_override_amount, v_base_unit_amount);


    -- ------------------------------------------------------------------------
    -- V1 billable units
    -- ------------------------------------------------------------------------

    case v_pricing_model

      when 'hourly' then
        v_billing_units :=
          ceil(
            extract(epoch from (v_item_end - v_item_start))
            / 3600.0
          )::bigint;

      when 'daily' then
        v_billing_units :=
          ceil(
            extract(epoch from (v_item_end - v_item_start))
            / 86400.0
          )::bigint;

      when 'flat' then
        v_billing_units := 1;

      else
        raise exception
          'Unsupported pricing model %',
          v_pricing_model
          using errcode = '23514';

    end case;


    if v_billing_units < 1 then
      raise exception 'Calculated billing units must be positive'
        using errcode = '23514';
    end if;


    v_item_amount :=
      v_applied_unit_amount * v_billing_units;


    if v_item_amount < 0 then
      raise exception 'Calculated booking item amount cannot be negative'
        using errcode = '23514';
    end if;


    -- ------------------------------------------------------------------------
    -- Immutable booking item snapshot
    -- ------------------------------------------------------------------------

    v_booking_item_id := gen_random_uuid();


    insert into public.booking_items (
      id,
      booking_id,
      space_id,
      space_layout_id,
      rate_plan_id,
      item_starts_at,
      item_ends_at,
      selection_snapshot,
      sort_order
    )
    values (
      v_booking_item_id,
      submission_id,
      v_space_id,
      v_layout_id,
      v_rate_plan_id,
      v_item_start,
      v_item_end,

      jsonb_build_object(
        'space',
          jsonb_build_object(
            'id', v_space_id,
            'name', v_space_name,
            'description', v_space_description
          ),

        'layout',
          case
            when v_layout_id is null then null
            else jsonb_build_object(
              'id', v_layout_id,
              'name', v_layout_name,
              'layout_type', v_layout_type,
              'description', v_layout_description,
              'capacity', v_layout_capacity
            )
          end,

        'rate_plan',
          jsonb_build_object(
            'id', v_rate_plan_id,
            'name', v_rate_plan_name,
            'pricing_model', v_pricing_model,
            'base_unit_amount_minor', v_base_unit_amount,
            'applied_unit_amount_minor', v_applied_unit_amount,
            'currency_code', v_venue_currency,
            'priority', v_rate_priority,
            'pricing_local_date', v_local_date,
            'pricing_local_weekday', v_local_weekday,
            'billing_units', v_billing_units,
            'rate_override_id', v_override_id,
            'rate_override_reason', v_override_reason
          ),

        'booking_rules',
          jsonb_build_object(
            'minimum_duration_minutes', v_minimum_duration_minutes,
            'maximum_duration_minutes', v_maximum_duration_minutes,
            'minimum_notice_minutes', v_minimum_notice_minutes,
            'maximum_advance_days', v_maximum_advance_days,
            'buffer_before_minutes', v_buffer_before_minutes,
            'buffer_after_minutes', v_buffer_after_minutes,
            'requires_host_approval', v_requires_host_approval
          )
      ),

      (v_input_item.ordinality - 1)::integer
    );


    -- ------------------------------------------------------------------------
    -- Immutable customer price line
    -- ------------------------------------------------------------------------

    v_price_sequence := v_price_sequence + 1;


    insert into public.booking_price_lines (
      booking_id,
      booking_item_id,
      sequence,
      line_type,
      payer,
      description,
      amount_minor,
      currency_code,
      calculation_snapshot
    )
    values (
      submission_id,
      v_booking_item_id,
      v_price_sequence,
      'space_charge',
      'customer',
      v_space_name || ' — ' || v_rate_plan_name,
      v_item_amount,
      v_venue_currency,

      jsonb_build_object(
        'pricing_model', v_pricing_model,
        'base_unit_amount_minor', v_base_unit_amount,
        'applied_unit_amount_minor', v_applied_unit_amount,
        'billing_units', v_billing_units,
        'pricing_local_date', v_local_date,
        'rate_plan_id', v_rate_plan_id,
        'rate_override_id', v_override_id,
        'line_total_minor', v_item_amount
      )
    );


    v_customer_total :=
      v_customer_total + v_item_amount;

    v_items_created :=
      v_items_created + 1;

  end loop;


  -- --------------------------------------------------------------------------
  -- Final authoritative commercial aggregates
  -- --------------------------------------------------------------------------

  if v_items_created < 1 then
    raise exception 'Booking request contains no priced booking items'
      using errcode = '23514';
  end if;


  if v_customer_total < 2 then
    raise exception
      'Booking total is too small for the configured deposit/final payment model'
      using errcode = '23514';
  end if;


  v_marketplace_commission :=
    round(
      v_customer_total::numeric
      * v_commission_bps::numeric
      / 10000
    )::bigint;


  v_venue_net :=
    v_customer_total - v_marketplace_commission;


  v_deposit_amount :=
    round(
      v_customer_total::numeric
      * v_deposit_bps::numeric
      / 10000
    )::bigint;


  v_final_amount :=
    v_customer_total - v_deposit_amount;


  if v_deposit_amount <= 0
     or v_final_amount <= 0
  then
    raise exception
      'Configured deposit percentage cannot produce positive deposit and final installments for this booking total'
      using errcode = '23514';
  end if;


  update public.bookings as b
  set
    customer_total_minor = v_customer_total,
    marketplace_commission_minor = v_marketplace_commission,
    venue_net_before_fees_minor = v_venue_net
  where b.id = submission_id;


  -- --------------------------------------------------------------------------
  -- Venue-side VV commission ledger line
  --
  -- The commission is not an extra customer charge.
  -- --------------------------------------------------------------------------

  v_price_sequence := v_price_sequence + 1;


  insert into public.booking_price_lines (
    booking_id,
    booking_item_id,
    sequence,
    line_type,
    payer,
    description,
    amount_minor,
    currency_code,
    calculation_snapshot
  )
  values (
    submission_id,
    null,
    v_price_sequence,
    'commission',
    'venue',
    'VV marketplace commission',
    v_marketplace_commission,
    v_venue_currency,

    jsonb_build_object(
      'commission_bps', v_commission_bps,
      'customer_total_minor', v_customer_total,
      'commission_minor', v_marketplace_commission
    )
  );


  -- --------------------------------------------------------------------------
  -- Payment schedule
  --
  -- Final due date is calculated in venue-local civil time so "14 days before"
  -- retains the same local clock time across daylight-saving transitions.
  -- --------------------------------------------------------------------------

  v_final_due_at :=
    (
      (
        event_starts_at_value
        at time zone v_venue_timezone
      )
      - make_interval(days => v_final_due_days)
    )
    at time zone v_venue_timezone;


  insert into public.booking_payment_schedule (
    booking_id,
    sequence,
    installment_type,
    amount_minor,
    currency_code,
    due_at,
    status,
    due_rule_snapshot
  )
  values
  (
    submission_id,
    1,
    'deposit',
    v_deposit_amount,
    v_venue_currency,
    null,
    'pending',

    jsonb_build_object(
      'rule', 'due_on_venue_approval',
      'deposit_bps', v_deposit_bps,
      'customer_total_minor', v_customer_total
    )
  ),
  (
    submission_id,
    2,
    'final',
    v_final_amount,
    v_venue_currency,
    v_final_due_at,

    case
      when v_final_due_at <= v_now then 'due'
      else 'pending'
    end,

    jsonb_build_object(
      'rule', 'days_before_event',
      'days_before_event', v_final_due_days,
      'venue_timezone', v_venue_timezone,
      'event_starts_at', event_starts_at_value,
      'calculated_due_at', v_final_due_at
    )
  );


  -- --------------------------------------------------------------------------
  -- Safety invariant: requests do not reserve inventory.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from public.booking_space_allocations as a
    where a.booking_id = submission_id
  ) then
    raise exception
      'Booking request submission unexpectedly created reservation inventory'
      using errcode = '55000';
  end if;


  -- --------------------------------------------------------------------------
  -- Result
  -- --------------------------------------------------------------------------

  return query
  select
    b.id,
    b.booking_reference,
    b.booking_status,
    b.customer_total_minor,
    v_deposit_amount,
    v_final_amount,
    v_final_due_at,
    v_items_created
  from public.bookings as b
  where b.id = submission_id;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.submit_booking_request(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  integer,
  jsonb
)
from public;


revoke all
on function public.submit_booking_request(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  integer,
  jsonb
)
from anon;


revoke all
on function public.submit_booking_request(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  integer,
  jsonb
)
from authenticated;


grant execute
on function public.submit_booking_request(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  integer,
  jsonb
)
to authenticated;


comment on function public.submit_booking_request(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  integer,
  jsonb
) is
  'Atomically creates an authenticated customer booking request from authoritative venue pricing and commercial terms. The browser supplies selections and event facts but never authoritative money values. Requests create no reservation allocation.';
