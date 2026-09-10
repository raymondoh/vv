-- Discovery availability is a current snapshot, never a reservation or hold.
-- No operational booking/allocation/blackout details are returned to callers.

create function private.resolve_venue_local_timestamp(
  local_value timestamp without time zone,
  venue_timezone text
)
returns timestamptz
language plpgsql
stable
strict
set search_path = ''
as $function$
declare
  resolved_value timestamptz;
begin
  -- Accept recognized timezone names, not arbitrary offset/POSIX expressions.
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as tz
    where tz.name = venue_timezone
  ) then
    return null;
  end if;

  resolved_value := local_value at time zone venue_timezone;

  -- DST gaps fail closed instead of silently shifting the customer's time.
  -- Repeated fall-back times use PostgreSQL's normal post-transition/later
  -- occurrence resolution. Do not reinterpret them in the browser timezone.
  if not pg_catalog.isfinite(resolved_value)
     or (resolved_value at time zone venue_timezone) <> local_value
  then
    return null;
  end if;

  return resolved_value;
exception
  when invalid_parameter_value or datetime_field_overflow then
    -- Invalid venue configuration must not abort the whole public search.
    return null;
end;
$function$;

alter function private.resolve_venue_local_timestamp(timestamp without time zone, text)
  owner to postgres;

revoke all on function private.resolve_venue_local_timestamp(timestamp without time zone, text)
  from public, anon, authenticated;


create function public.search_catalog_venues(
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
    left join public.space_booking_rules as rules
      on rules.space_id = s.id
    cross join lateral (
      select pg_catalog.max(capacity.value) as maximum_capacity
      from (values
        (s.seated_capacity),
        (s.standing_capacity),
        (s.theatre_capacity)
      ) as capacity(value)
    ) as space_capacity
    cross join lateral (
      select pg_catalog.tstzrange(
        v.event_start - pg_catalog.make_interval(mins => coalesce(rules.buffer_before_minutes, 0)),
        v.event_end + pg_catalog.make_interval(mins => coalesce(rules.buffer_after_minutes, 0)),
        '[)'
      ) as reserved_during
    ) as requested
    where s.venue_id = (v.catalog_row).id
      and s.status = 'active'
      -- Capacity and every timing/inventory condition apply to THIS SAME SPACE.
      -- MAX ignores NULLs; unknown capacity does not satisfy a guest threshold.
      -- Capacities are never summed and layout capacities are not consulted.
      and (guests is null or space_capacity.maximum_capacity >= guests)
      and (rules.minimum_duration_minutes is null
        or v.event_end - v.event_start >= pg_catalog.make_interval(mins => rules.minimum_duration_minutes))
      and (rules.maximum_duration_minutes is null
        or v.event_end - v.event_start <= pg_catalog.make_interval(mins => rules.maximum_duration_minutes))
      and (rules.minimum_notice_minutes is null
        or v.event_start >= v_now + pg_catalog.make_interval(mins => rules.minimum_notice_minutes))
      -- Intentionally mirrors approve_booking_hold, including session-timezone
      -- day arithmetic. Any timezone hardening must change both workflows later.
      and (rules.maximum_advance_days is null
        or v.event_start <= v_now + pg_catalog.make_interval(days => rules.maximum_advance_days))
      -- Missing rules impose no limits and zero buffers. Host approval is not
      -- an unavailability condition. Conflicts include setup/teardown buffers.
      -- All ranges are half-open [start,end): exact adjacency is not overlap.
      and not exists (
        select 1
        from public.venue_blackouts as blackout
        where blackout.venue_id = (v.catalog_row).id
          and blackout.cancelled_at is null
          and blackout.blocked_during && requested.reserved_during
      )
      and not exists (
        select 1
        from public.space_blackouts as blackout
        where blackout.space_id = s.id
          and blackout.cancelled_at is null
          and blackout.blocked_during && requested.reserved_during
      )
      and not exists (
        select 1
        from public.booking_space_allocations as allocation
        where allocation.space_id = s.id
          and allocation.allocation_status in ('held', 'confirmed')
          and allocation.reserved_during && requested.reserved_during
        -- Overdue held rows STILL block until held -> expired commits, matching
        -- the exclusion constraint. Never filter by hold_expires_at or booking
        -- status. Existing allocations already contain their original buffers.
      )
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
