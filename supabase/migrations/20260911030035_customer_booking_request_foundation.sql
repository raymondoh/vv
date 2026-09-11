-- Customer booking-request foundation. A request is NOT a reservation.
-- Eligibility is a current snapshot. Only later host approval rechecks inventory
-- and creates the temporary hold; this migration adds no allocation writes.

-- One specific space must satisfy capacity, rules and inventory together.
-- Private reason codes are for trusted workflows only, never public diagnostics.
create function private.evaluate_booking_space_eligibility(
  target_venue_id uuid,
  target_space_id uuid,
  event_start timestamptz,
  event_end timestamptz,
  guest_count integer,
  reference_now timestamptz
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_space public.spaces%rowtype;
  v_rules public.space_booking_rules%rowtype;
  v_capacity integer;
  v_reserved_during tstzrange;
begin
  if event_start is null or event_end is null or reference_now is null
     or not pg_catalog.isfinite(event_start)
     or not pg_catalog.isfinite(event_end)
     or not pg_catalog.isfinite(reference_now)
     or event_start <= reference_now or event_end <= event_start then
    return 'invalid_period';
  end if;

  select s.* into v_space
  from public.spaces as s
  join public.venues as v on v.id = s.venue_id
  where s.id = target_space_id
    and s.venue_id = target_venue_id
    and s.status = 'active'
    and v.status = 'published'
    and v.published_at is not null;

  if not found then
    return 'space_unavailable';
  end if;

  if guest_count is not null then
    if guest_count < 1 or guest_count > 100000 then
      return 'invalid_guest_count';
    end if;
    -- MAX ignores NULLs and returns NULL when all declarations are unknown.
    -- No sum across spaces, and no layout capacity substitutes for this maximum.
    select pg_catalog.max(c.value) into v_capacity
    from (values (v_space.seated_capacity), (v_space.standing_capacity),
                 (v_space.theatre_capacity)) as c(value);
    if v_capacity is null then
      return 'capacity_unknown';
    elsif v_capacity < guest_count then
      return 'capacity_exceeded';
    end if;
  end if;

  select r.* into v_rules
  from public.space_booking_rules as r
  where r.space_id = target_space_id;
  -- No row leaves NULL fields: unrestricted rules and zero buffers below.
  -- requires_host_approval is deliberately not an eligibility restriction.
  if v_rules.minimum_duration_minutes is not null
     and event_end - event_start < pg_catalog.make_interval(mins => v_rules.minimum_duration_minutes) then
    return 'minimum_duration';
  end if;
  if v_rules.maximum_duration_minutes is not null
     and event_end - event_start > pg_catalog.make_interval(mins => v_rules.maximum_duration_minutes) then
    return 'maximum_duration';
  end if;
  if v_rules.minimum_notice_minutes is not null
     and event_start < reference_now + pg_catalog.make_interval(mins => v_rules.minimum_notice_minutes) then
    return 'minimum_notice';
  end if;
  -- Preserve approval's session-timezone day arithmetic. Any future hardening
  -- must change discovery, submission and approval together, not just this helper.
  if v_rules.maximum_advance_days is not null
     and event_start > reference_now + pg_catalog.make_interval(days => v_rules.maximum_advance_days) then
    return 'maximum_advance';
  end if;

  -- Requested setup/teardown buffers are included. Half-open [start,end)
  -- intervals allow exact adjacency. Existing allocations are not buffered again.
  v_reserved_during := pg_catalog.tstzrange(
    event_start - pg_catalog.make_interval(mins => coalesce(v_rules.buffer_before_minutes, 0)),
    event_end + pg_catalog.make_interval(mins => coalesce(v_rules.buffer_after_minutes, 0)),
    '[)'
  );
  if exists (
    select 1 from public.venue_blackouts as b
    where b.venue_id = target_venue_id and b.cancelled_at is null
      and b.blocked_during && v_reserved_during
  ) then
    return 'venue_blackout';
  end if;
  if exists (
    select 1 from public.space_blackouts as b
    where b.space_id = target_space_id and b.cancelled_at is null
      and b.blocked_during && v_reserved_during
  ) then
    return 'space_blackout';
  end if;
  if exists (
    select 1 from public.booking_space_allocations as a
    where a.space_id = target_space_id
      and a.allocation_status in ('held', 'confirmed')
      and a.reserved_during && v_reserved_during
  ) then
    -- Overdue held rows still block until held -> expired actually commits.
    -- No hold-expiry predicate or booking-status reinterpretation is allowed.
    -- Requested bookings without allocations do not block.
    return 'allocation_conflict';
  end if;
  return 'eligible';
end;
$function$;

alter function private.evaluate_booking_space_eligibility(uuid, uuid, timestamptz, timestamptz, integer, timestamptz)
  owner to postgres;
revoke all on function private.evaluate_booking_space_eligibility(uuid, uuid, timestamptz, timestamptz, integer, timestamptz)
  from public, anon, authenticated;

-- Shared lexical/calendar validation for the two new local-time RPCs.
-- This does not interpret a timezone; the existing resolver remains authoritative.
create function private.parse_booking_local_datetime(local_value text)
returns timestamp without time zone
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_value timestamp without time zone;
begin
  if local_value is null or pg_catalog.length(local_value) <> 16
     or local_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Local datetimes must use YYYY-MM-DDTHH:MM'
      using errcode = '22023';
  end if;
  begin
    v_value := local_value::timestamp without time zone;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Local datetimes must contain valid calendar dates and times'
      using errcode = '22023';
  end;
  return v_value;
end;
$function$;

alter function private.parse_booking_local_datetime(text) owner to postgres;
revoke all on function private.parse_booking_local_datetime(text)
  from public, anon, authenticated;

-- Preserve discovery input, projection, ordering and bounds; share only the dated predicate.
create or replace function public.search_catalog_venues(
  name_query text default null,
  city_query text default null,
  guests integer default null,
  start_local text default null,
  end_local text default null
)
returns setof public.catalog_venues
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_name text;
  v_city text;
  v_start_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_local_format constant text :=
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$';
begin
  v_name := nullif(pg_catalog.btrim(pg_catalog.left(
    pg_catalog.regexp_replace(name_query, '^[[:space:]]+|[[:space:]]+$', '', 'g'), 120)), '');
  v_city := nullif(pg_catalog.btrim(pg_catalog.left(
    pg_catalog.regexp_replace(city_query, '^[[:space:]]+|[[:space:]]+$', '', 'g'), 120)), '');

  if guests is not null and (guests < 1 or guests > 100000) then
    raise exception 'Guests must be an integer between 1 and 100000'
      using errcode = '22023';
  end if;

  if (start_local is null) <> (end_local is null) then
    raise exception 'Local start and end must be supplied together'
      using errcode = '22023';
  end if;

  if start_local is null then
    -- Undated discovery retains the authoritative venue-wide capacity value.
    -- Literal text operations give %, _, *, and regex syntax no special role.
    return query
    select v.*
    from public.catalog_venues as v
    where (v_name is null or pg_catalog.strpos(pg_catalog.lower(v.name), pg_catalog.lower(v_name)) > 0)
      and (v_city is null or pg_catalog.lower(v.city) = pg_catalog.lower(v_city))
      and (guests is null or v.maximum_capacity >= guests)
    order by v.published_at desc, v.id asc
    limit 24;
    return;
  end if;

  -- No offsets, Z suffixes, seconds, whitespace or flexible PostgreSQL input.
  if pg_catalog.length(start_local) <> 16
     or pg_catalog.length(end_local) <> 16
     or start_local !~ v_local_format
     or end_local !~ v_local_format
  then
    raise exception 'Local datetimes must use YYYY-MM-DDTHH:MM'
      using errcode = '22023';
  end if;

  begin
    v_start_local := start_local::timestamp without time zone;
    v_end_local := end_local::timestamp without time zone;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Local datetimes must contain valid calendar dates and times'
        using errcode = '22023';
  end;

  if v_end_local <= v_start_local then
    raise exception 'Local end must be after local start; use separate dates for overnight events'
      using errcode = '22023';
  end if;

  return query
  with resolved as materialized (
    select
      v as catalog_row,
      private.resolve_venue_local_timestamp(v_start_local, v.timezone) as event_start,
      private.resolve_venue_local_timestamp(v_end_local, v.timezone) as event_end
    from public.catalog_venues as v
    where (v_name is null or pg_catalog.strpos(pg_catalog.lower(v.name), pg_catalog.lower(v_name)) > 0)
      and (v_city is null or pg_catalog.lower(v.city) = pg_catalog.lower(v_city))
  ), valid_times as materialized (
    -- Validate resolved instants before constructing any reservation range.
    select r.*
    from resolved as r
    where r.event_start is not null
      and r.event_end is not null
      and r.event_start > v_now
      and r.event_end > r.event_start
  )
  select (v.catalog_row).*
  from valid_times as v
  where exists (
    select 1
    from public.spaces as s
    where s.venue_id = (v.catalog_row).id
      and s.status = 'active'
      and private.evaluate_booking_space_eligibility(
        (v.catalog_row).id, s.id, v.event_start, v.event_end, guests, v_now
      ) = 'eligible'
  )
  -- Every predicate precedes the bound; no fetch-24-then-filter behavior.
  order by (v.catalog_row).published_at desc, (v.catalog_row).id asc
  limit 24;
end;
$function$;

alter function public.search_catalog_venues(text, text, integer, text, text)
  owner to postgres;

revoke all on function public.search_catalog_venues(text, text, integer, text, text)
  from public, anon, authenticated;

grant execute on function public.search_catalog_venues(text, text, integer, text, text)
  to anon, authenticated;

-- Public, role-independent eligibility snapshot: only safe space IDs leave SQL.
create function public.get_eligible_booking_spaces(
  target_venue_id uuid,
  start_local text,
  end_local text,
  guests integer
)
returns table (space_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_start_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if guests is null or guests < 1 or guests > 100000 then
    raise exception 'Guests must be an integer between 1 and 100000'
      using errcode = '22023';
  end if;
  v_start_local := private.parse_booking_local_datetime(start_local);
  v_end_local := private.parse_booking_local_datetime(end_local);
  if v_end_local <= v_start_local then
    raise exception 'Local end must be after local start; use separate dates for overnight events'
      using errcode = '22023';
  end if;

  select v.timezone into v_timezone
  from public.venues as v
  where v.id = target_venue_id and v.status = 'published'
    and v.published_at is not null;
  if not found then
    return;
  end if;
  -- Existing resolver rejects spring gaps by round trip and uses PostgreSQL's
  -- normal later occurrence for repeated fall-back times. Invalid zones fail closed.
  v_start := private.resolve_venue_local_timestamp(v_start_local, v_timezone);
  v_end := private.resolve_venue_local_timestamp(v_end_local, v_timezone);
  if v_start is null or v_end is null or v_end <= v_start then
    return;
  end if;

  return query
  select s.id
  from public.spaces as s
  where s.venue_id = target_venue_id and s.status = 'active'
    and private.evaluate_booking_space_eligibility(
      target_venue_id, s.id, v_start, v_end, guests, v_now
    ) = 'eligible'
  order by s.sort_order, s.id;
end;
$function$;

alter function public.get_eligible_booking_spaces(uuid, text, text, integer)
  owner to postgres;
revoke all on function public.get_eligible_booking_spaces(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_eligible_booking_spaces(uuid, text, text, integer)
  to anon, authenticated;

-- Core commercial workflow retained; only eligibility and idempotency are hardened.
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

  v_lock_item record;
  v_lock_space_text text;
  v_lock_space_id uuid;
  v_lock_space_ids uuid[] := '{}'::uuid[];

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

  -- A namespaced 64-bit hash of the UUID serializes this logical submission.
  -- Hash collisions can serialize unrelated keys, but there is no global lock.
  -- Acquire BEFORE lookup; the VOLATILE function's following SQL statement sees
  -- the committed winner after waiting. Wrapper uses the identical lock key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vv:booking-request:' || submission_id::text, 0)
  );

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
     and (guest_count_value <= 0 or guest_count_value > 100000)
  then
    raise exception 'Guest count must be between 1 and 100000'
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

  -- The venue is already locked FOR SHARE above. Lock all selected spaces in
  -- UUID order before the eligibility query, compatible with approval/blackout
  -- venue-then-space locking. Share locks block those workflows' UPDATE locks
  -- until this transaction ends, but are NOT reservation allocations.
  -- Collect lock targets without taking over authoritative item validation.
  -- Missing/blank/invalid UUIDs are left for the original item loop below.
  for v_lock_item in
    select e.value
    from pg_catalog.jsonb_array_elements(selected_items)
      with ordinality as e(value, ordinality)
    order by e.ordinality
  loop
    v_lock_space_text := nullif(pg_catalog.btrim(v_lock_item.value ->> 'space_id'), '');
    if v_lock_space_text is null then
      continue;
    end if;
    begin
      v_lock_space_id := v_lock_space_text::uuid;
    exception when invalid_text_representation then
      continue;
    end;
    if not (v_lock_space_id = any(v_lock_space_ids)) then
      v_lock_space_ids := pg_catalog.array_append(v_lock_space_ids, v_lock_space_id);
    end if;
  end loop;

  perform s.id
  from public.spaces as s
  where s.venue_id = target_venue_id
    and s.id = any(v_lock_space_ids)
  order by s.id
  for share of s;

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


    -- New requests must satisfy the SAME space's known generic capacity when
    -- guests are supplied, current rules, buffers and inventory. No private
    -- reason code leaves this function. Successful replays returned above.
    if private.evaluate_booking_space_eligibility(
      target_venue_id, v_space_id, v_item_start, v_item_end,
      guest_count_value, v_now
    ) is distinct from 'eligible' then
      raise exception 'This space no longer matches your dates and guest count.'
        using errcode = '23P01';
    end if;

    -- The optional layout check below is ADDITIONAL to generic capacity.
    -- NULL layout capacity imposes no extra limit and never bypasses it.

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


alter function public.submit_booking_request(uuid, uuid, timestamptz, timestamptz, jsonb, text, integer, jsonb)
  owner to postgres;


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

-- One-space V1 local-wall-time facade. Pricing, snapshots, payment schedule and
-- booking creation remain exclusively in the core transactional workflow.
-- Required guest_count precedes the optional arguments to satisfy SQL defaults.
create function public.submit_booking_request_local(
  submission_id uuid,
  target_venue_id uuid,
  start_local text,
  end_local text,
  selected_space_id uuid,
  guest_count integer,
  selected_layout_id uuid default null,
  event_type text default null,
  notes text default null
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
volatile
security definer
set search_path = ''
as $function$
declare
  v_existing public.bookings%rowtype;
  v_timezone text;
  v_notes text;
  v_start_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_start timestamptz;
  v_end timestamptz;
  v_items jsonb;
  v_details jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if submission_id is null then
    raise exception 'Submission ID is required' using errcode = '23514';
  end if;
  -- Same advisory-xact key as core, before either wrapper or core replay lookup.
  -- Reacquisition by core in this transaction is safe and releases at transaction end.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vv:booking-request:' || submission_id::text, 0)
  );
  select b.* into v_existing
  from public.bookings as b where b.id = submission_id;
  if found then
    if v_existing.customer_user_id is distinct from auth.uid() then
      raise exception 'Submission ID has already been used' using errcode = '23505';
    end if;
    -- Replay uses HISTORICAL timezone, even after unpublication, timezone,
    -- pricing or inventory changes. Core still compares every request fact and
    -- rejects changed venue/selections/details. It never reprices a replay.
    v_timezone := v_existing.venue_snapshot ->> 'timezone';
  else
    -- Hold venue configuration stable through time resolution and core call.
    -- This is the same first catalog lock as the core/approval/blackout order.
    select v.timezone into v_timezone
    from public.venues as v where v.id = target_venue_id
    for share;
    if not found then
      raise exception 'Venue not found' using errcode = 'P0002';
    end if;
  end if;

  if guest_count is null or guest_count < 1 or guest_count > 100000 then
    raise exception 'Guests must be an integer between 1 and 100000'
      using errcode = '22023';
  end if;
  if selected_space_id is null then
    raise exception 'A space must be selected' using errcode = '22023';
  end if;
  v_notes := nullif(pg_catalog.regexp_replace(notes, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  if pg_catalog.char_length(v_notes) > 2000 then
    raise exception 'Notes must contain no more than 2000 characters'
      using errcode = '22023';
  end if;
  v_start_local := private.parse_booking_local_datetime(start_local);
  v_end_local := private.parse_booking_local_datetime(end_local);
  if v_end_local <= v_start_local then
    raise exception 'Local end must be after local start; use separate dates for overnight events'
      using errcode = '22023';
  end if;
  -- No JavaScript timezone conversion. Spring gaps fail closed; repeated times
  -- use the existing resolver's normal PostgreSQL later-occurrence behavior.
  v_start := private.resolve_venue_local_timestamp(v_start_local, v_timezone);
  v_end := private.resolve_venue_local_timestamp(v_end_local, v_timezone);
  if v_start is null or v_end is null or v_end <= v_start then
    raise exception 'These event times cannot be used in the venue timezone'
      using errcode = '22023';
  end if;

  v_items := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'space_id', selected_space_id,
    'space_layout_id', selected_layout_id
  ));
  v_details := case when v_notes is null then '{}'::jsonb
    else pg_catalog.jsonb_build_object('notes', v_notes) end;

  -- Item timestamps are omitted deliberately: core defaults them to the event.
  -- Authenticated core also validates event_type, layout and all fresh eligibility.
  return query
  select r.* from public.submit_booking_request(
    submission_id, target_venue_id, v_start, v_end, v_items,
    nullif(pg_catalog.btrim(event_type), ''), guest_count, v_details
  ) as r;
end;
$function$;

alter function public.submit_booking_request_local(uuid, uuid, text, text, uuid, integer, uuid, text, text)
  owner to postgres;
revoke all on function public.submit_booking_request_local(uuid, uuid, text, text, uuid, integer, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_booking_request_local(uuid, uuid, text, text, uuid, integer, uuid, text, text)
  to authenticated;

-- Historical customer display fields only. Current catalog visibility/names do
-- not control access to the customer's saved request. No raw snapshots escape.
create view public.my_booking_summaries
with (security_barrier = true)
as
select
  b.id, b.booking_reference, b.venue_id, b.booking_status, b.payment_status,
  b.event_starts_at, b.event_ends_at, b.event_type, b.guest_count,
  b.currency_code, b.customer_total_minor, b.hold_expires_at,
  b.submitted_at, b.created_at,
  b.venue_snapshot ->> 'name' as venue_name,
  b.venue_snapshot ->> 'timezone' as venue_timezone
from public.bookings as b
where b.customer_user_id = auth.uid();

alter view public.my_booking_summaries owner to postgres;
revoke all on table public.my_booking_summaries from public, anon, authenticated;
grant select on table public.my_booking_summaries to authenticated;

create view public.my_booking_item_summaries
with (security_barrier = true)
as
select
  bi.id, bi.booking_id, bi.space_id, bi.space_layout_id,
  bi.item_starts_at, bi.item_ends_at, bi.sort_order,
  bi.selection_snapshot -> 'space' ->> 'name' as space_name,
  bi.selection_snapshot -> 'layout' ->> 'name' as layout_name
from public.booking_items as bi
join public.bookings as b on b.id = bi.booking_id
where b.customer_user_id = auth.uid();

alter view public.my_booking_item_summaries owner to postgres;
revoke all on table public.my_booking_item_summaries from public, anon, authenticated;
grant select on table public.my_booking_item_summaries to authenticated;
