-- ============================================================================
-- VV venue publication workflows
-- ============================================================================
--
-- Trusted lifecycle boundary for:
--
--   publish_venue()
--   unpublish_venue()
--   archive_venue()
--
-- Publication is an administrative action:
--
--   platform admin
--   organisation owner
--   organisation manager
--
-- Ordinary staff remains operational but cannot control public marketplace
-- exposure.
--
-- Publication prerequisites:
--
--   * organisation is active
--   * venue has an address
--   * venue has at least one active space
--   * at least one active space has usable positive pricing
--   * usable pricing currency matches the venue currency
--   * organisation has commercial terms effective now
--
-- Media, layouts and live walkthrough availability are deliberately NOT
-- publication requirements.
--
-- published_at records the venue's FIRST publication instant and is retained
-- across later unpublish / republish cycles.
--
-- Archived venues cannot be reopened by ordinary lifecycle operations.
-- ============================================================================


-- ============================================================================
-- Assert venue is currently publishable
-- ============================================================================

create or replace function private.assert_venue_publishable(
  target_venue_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := now();

  v_organization_id uuid;
  v_organization_status text;

  v_venue_currency text;
  v_venue_timezone text;

  v_local_today date;
begin
  -- --------------------------------------------------------------------------
  -- Authoritative venue + organisation context
  -- --------------------------------------------------------------------------

  select
    v.organization_id,
    o.status,
    v.default_currency_code,
    v.timezone
  into
    v_organization_id,
    v_organization_status,
    v_venue_currency,
    v_venue_timezone
  from public.venues as v
  join public.organizations as o
    on o.id = v.organization_id
  where v.id = target_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  if v_organization_status <> 'active' then
    raise exception
      'Venue organization must be active before the venue can be published'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Venue address
  --
  -- The address table already guarantees address_line_1, city and country.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from public.venue_addresses as va
    where va.venue_id = target_venue_id
  ) then
    raise exception
      'Venue must have an address before it can be published'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- At least one active reservable space
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from public.spaces as s
    where s.venue_id = target_venue_id
      and s.status = 'active'
  ) then
    raise exception
      'Venue must have at least one active space before it can be published'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Venue-local date
  --
  -- Publication may legitimately precede a future pricing season, so a rate
  -- plan does not need to have started already. It must simply not already be
  -- expired.
  -- --------------------------------------------------------------------------

  v_local_today :=
    (v_now at time zone v_venue_timezone)::date;


  -- --------------------------------------------------------------------------
  -- Positive usable pricing
  --
  -- V1 marketplace publication requires at least one positive-price active
  -- rate plan belonging to an active venue space.
  --
  -- Zero-priced configurations remain representable in the schema, but they
  -- do not by themselves make a venue publishable.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from public.space_rate_plans as rp
    join public.spaces as s
      on s.id = rp.space_id
    where s.venue_id = target_venue_id
      and s.status = 'active'
      and rp.is_active = true
      and rp.unit_amount_minor > 0
      and rp.currency_code = v_venue_currency
      and (
        rp.valid_until is null
        or rp.valid_until > v_local_today
      )
  ) then
    raise exception
      'Venue must have usable positive pricing in its venue currency before it can be published'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Current VV commercial terms
  --
  -- A venue cannot enter the marketplace until VV's commercial relationship
  -- with the organisation is currently defined.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from public.organization_commercial_term_versions as t
    where t.organization_id = v_organization_id
      and t.effective_during @> v_now
  ) then
    raise exception
      'Venue organization has no commercial terms effective at publication time'
      using errcode = '23514';
  end if;

end;
$function$;


revoke all
on function private.assert_venue_publishable(uuid)
from public, anon, authenticated;


-- ============================================================================
-- Lower-level venue lifecycle invariant
--
-- This protects against accidental trusted/server-side UPDATEs that bypass the
-- public publication workflows.
-- ============================================================================

create or replace function private.validate_venue_publication_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- --------------------------------------------------------------------------
  -- INSERT
  --
  -- Normal application creation inserts a draft venue.
  -- A direct trusted attempt to insert a published venue must still satisfy
  -- the publication rules. In practice its dependent address/spaces/pricing
  -- cannot exist yet, so such an insert will be rejected.
  -- --------------------------------------------------------------------------

  if tg_op = 'INSERT' then

    if new.status = 'published' then

      if new.published_at is null then
        raise exception
          'Published venue requires published_at'
          using errcode = '23514';
      end if;

      perform private.assert_venue_publishable(new.id);
    end if;

    return new;
  end if;


  -- --------------------------------------------------------------------------
  -- Archived is terminal for the current V1 lifecycle.
  -- --------------------------------------------------------------------------

  if old.status = 'archived'
     and new.status <> 'archived'
  then
    raise exception
      'Archived venue cannot be reopened'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- First publication timestamp is immutable once established.
  -- --------------------------------------------------------------------------

  if old.published_at is not null
     and new.published_at is distinct from old.published_at
  then
    raise exception
      'Venue first publication timestamp is immutable'
      using errcode = '55000';
  end if;


  -- --------------------------------------------------------------------------
  -- Transition into published state.
  -- --------------------------------------------------------------------------

  if new.status = 'published'
     and old.status <> 'published'
  then

    if new.published_at is null then
      raise exception
        'Published venue requires published_at'
        using errcode = '23514';
    end if;

    perform private.assert_venue_publishable(new.id);
  end if;


  return new;
end;
$function$;


revoke all
on function private.validate_venue_publication_lifecycle()
from public, anon, authenticated;


create trigger validate_venue_publication_lifecycle_insert
before insert
on public.venues
for each row
execute function private.validate_venue_publication_lifecycle();


create trigger validate_venue_publication_lifecycle_update
before update of
  status,
  published_at
on public.venues
for each row
execute function private.validate_venue_publication_lifecycle();


-- ============================================================================
-- Publish venue
-- ============================================================================

create or replace function public.publish_venue(
  target_venue_id uuid
)
returns table (
  venue_id uuid,
  venue_status text,
  first_published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_status text;
  v_published_at timestamptz;

  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if target_venue_id is null then
    raise exception 'Venue ID is required'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Resolve immutable parent organisation.
  -- --------------------------------------------------------------------------

  select v.organization_id
  into v_organization_id
  from public.venues as v
  where v.id = target_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock hierarchy:
  --
  --   organisation
  --   venue
  --   address
  --   spaces
  --   rate plans
  --   commercial terms
  --
  -- This prevents catalogue/pricing configuration from changing underneath
  -- the publication validation transaction.
  -- --------------------------------------------------------------------------

  perform o.id
  from public.organizations as o
  where o.id = v_organization_id
  for update;


  select
    v.status,
    v.published_at
  into
    v_status,
    v_published_at
  from public.venues as v
  where v.id = target_venue_id
  for update;


  -- --------------------------------------------------------------------------
  -- Authorization
  -- --------------------------------------------------------------------------

  if not private.can_administer_organization(v_organization_id) then
    raise exception
      'Only an organization owner, manager or platform admin may publish a venue'
      using errcode = '42501';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotent replay
  -- --------------------------------------------------------------------------

  if v_status = 'published' then
    return query
    select
      target_venue_id,
      v_status,
      v_published_at;

    return;
  end if;


  if v_status = 'archived' then
    raise exception
      'Archived venue cannot be published'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Lock dependent publication configuration.
  -- --------------------------------------------------------------------------

  perform va.venue_id
  from public.venue_addresses as va
  where va.venue_id = target_venue_id
  for share;


  perform s.id
  from public.spaces as s
  where s.venue_id = target_venue_id
  order by s.id
  for share;


  perform rp.id
  from public.space_rate_plans as rp
  join public.spaces as s
    on s.id = rp.space_id
  where s.venue_id = target_venue_id
  order by rp.id
  for share;


  perform t.id
  from public.organization_commercial_term_versions as t
  where t.organization_id = v_organization_id
  order by t.version_number
  for share;


  -- Friendly validation before the lower-level trigger validates again.

  perform private.assert_venue_publishable(target_venue_id);


  update public.venues as v
  set
    status = 'published',
    published_at = coalesce(v.published_at, v_now)
  where v.id = target_venue_id
  returning
    v.status,
    v.published_at
  into
    v_status,
    v_published_at;


  return query
  select
    target_venue_id,
    v_status,
    v_published_at;

end;
$function$;


-- ============================================================================
-- Unpublish venue
--
-- Unpublishing hides the venue from the catalogue and prevents new customer
-- booking requests. Historical bookings remain untouched.
--
-- published_at is deliberately retained as the FIRST publication timestamp.
-- ============================================================================

create or replace function public.unpublish_venue(
  target_venue_id uuid
)
returns table (
  venue_id uuid,
  venue_status text,
  first_published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_status text;
  v_published_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if target_venue_id is null then
    raise exception 'Venue ID is required'
      using errcode = '23514';
  end if;


  select v.organization_id
  into v_organization_id
  from public.venues as v
  where v.id = target_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  perform o.id
  from public.organizations as o
  where o.id = v_organization_id
  for update;


  select
    v.status,
    v.published_at
  into
    v_status,
    v_published_at
  from public.venues as v
  where v.id = target_venue_id
  for update;


  if not private.can_administer_organization(v_organization_id) then
    raise exception
      'Only an organization owner, manager or platform admin may unpublish a venue'
      using errcode = '42501';
  end if;


  if v_status = 'draft' then
    return query
    select
      target_venue_id,
      v_status,
      v_published_at;

    return;
  end if;


  if v_status = 'archived' then
    raise exception
      'Archived venue cannot be unpublished'
      using errcode = '23514';
  end if;


  update public.venues as v
  set status = 'draft'
  where v.id = target_venue_id
  returning
    v.status,
    v.published_at
  into
    v_status,
    v_published_at;


  return query
  select
    target_venue_id,
    v_status,
    v_published_at;

end;
$function$;


-- ============================================================================
-- Archive venue
--
-- Archive is intentionally one-way in V1.
--
-- Historical bookings, price snapshots, status history and other dependent
-- records remain intact.
-- ============================================================================

create or replace function public.archive_venue(
  target_venue_id uuid
)
returns table (
  venue_id uuid,
  venue_status text,
  first_published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_status text;
  v_published_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if target_venue_id is null then
    raise exception 'Venue ID is required'
      using errcode = '23514';
  end if;


  select v.organization_id
  into v_organization_id
  from public.venues as v
  where v.id = target_venue_id;

  if not found then
    raise exception 'Venue not found'
      using errcode = 'P0002';
  end if;


  perform o.id
  from public.organizations as o
  where o.id = v_organization_id
  for update;


  select
    v.status,
    v.published_at
  into
    v_status,
    v_published_at
  from public.venues as v
  where v.id = target_venue_id
  for update;


  if not private.can_administer_organization(v_organization_id) then
    raise exception
      'Only an organization owner, manager or platform admin may archive a venue'
      using errcode = '42501';
  end if;


  if v_status = 'archived' then
    return query
    select
      target_venue_id,
      v_status,
      v_published_at;

    return;
  end if;


  update public.venues as v
  set status = 'archived'
  where v.id = target_venue_id
  returning
    v.status,
    v.published_at
  into
    v_status,
    v_published_at;


  return query
  select
    target_venue_id,
    v_status,
    v_published_at;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.publish_venue(uuid)
from public, anon, authenticated;


revoke all
on function public.unpublish_venue(uuid)
from public, anon, authenticated;


revoke all
on function public.archive_venue(uuid)
from public, anon, authenticated;


grant execute
on function public.publish_venue(uuid)
to authenticated;


grant execute
on function public.unpublish_venue(uuid)
to authenticated;


grant execute
on function public.archive_venue(uuid)
to authenticated;


-- ============================================================================
-- Documentation
-- ============================================================================

comment on function private.assert_venue_publishable(uuid) is
  'Raises unless a venue satisfies the authoritative VV marketplace publication prerequisites.';


comment on function public.publish_venue(uuid) is
  'Publishes a complete draft venue after validating organization, address, active space, positive matching pricing and current VV commercial terms.';


comment on function public.unpublish_venue(uuid) is
  'Returns a published venue to draft while retaining its immutable first publication timestamp.';


comment on function public.archive_venue(uuid) is
  'Archives a draft or published venue. Archived venues are terminal in the V1 publication lifecycle.';


comment on column public.venues.published_at is
  'Timestamp of the venue first entering the public marketplace. Retained across later unpublish and republish cycles.';
