-- VV Production Database
-- Migration 0017: RLS - catalog and media
--
-- Covers:
--   venues
--   venue_addresses
--   spaces
--   space_layouts
--   media_assets
--   venue_media_assets
--   space_media_assets
--   space_layout_media_assets
--
-- Also introduces:
--   public.catalog_venues
--
-- Principles:
--
--   * public/customer browsing only exposes published catalog data
--   * direct venue contact details are not exposed through the public catalog
--   * organization operators can manage their own catalog
--   * venue publication remains a trusted/server-side operation
--   * media processing state remains server-side
--   * archived/draft catalog data is never exposed publicly


-- ===========================================================================
-- Public-catalog authorization helpers
-- ===========================================================================
--
-- Anonymous users need to execute only these narrowly scoped boolean helpers.
-- USAGE on the schema does not grant access to private tables.

grant usage on schema private to anon;


create or replace function private.is_public_venue(
  target_venue_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.venues as v
    where v.id = target_venue_id
      and v.status = 'published'
      and v.published_at is not null
  );
$$;

revoke all on function private.is_public_venue(uuid)
  from public, anon, authenticated;

grant execute on function private.is_public_venue(uuid)
  to anon, authenticated;


create or replace function private.is_public_space(
  target_space_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.spaces as s
    join public.venues as v
      on v.id = s.venue_id
    where s.id = target_space_id
      and s.status = 'active'
      and v.status = 'published'
      and v.published_at is not null
  );
$$;

revoke all on function private.is_public_space(uuid)
  from public, anon, authenticated;

grant execute on function private.is_public_space(uuid)
  to anon, authenticated;


create or replace function private.is_public_space_layout(
  target_space_layout_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.space_layouts as sl
    join public.spaces as s
      on s.id = sl.space_id
    join public.venues as v
      on v.id = s.venue_id
    where sl.id = target_space_layout_id
      and sl.status = 'active'
      and s.status = 'active'
      and v.status = 'published'
      and v.published_at is not null
  );
$$;

revoke all on function private.is_public_space_layout(uuid)
  from public, anon, authenticated;

grant execute on function private.is_public_space_layout(uuid)
  to anon, authenticated;


create or replace function private.is_public_media_asset(
  target_media_asset_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_assets as ma
    where ma.id = target_media_asset_id
      and ma.status = 'ready'
      and (
        exists (
          select 1
          from public.venue_media_assets as vma
          where vma.media_asset_id = ma.id
            and private.is_public_venue(vma.venue_id)
        )
        or
        exists (
          select 1
          from public.space_media_assets as sma
          where sma.media_asset_id = ma.id
            and private.is_public_space(sma.space_id)
        )
        or
        exists (
          select 1
          from public.space_layout_media_assets as slma
          where slma.media_asset_id = ma.id
            and private.is_public_space_layout(slma.space_layout_id)
        )
      )
  );
$$;

revoke all on function private.is_public_media_asset(uuid)
  from public, anon, authenticated;

grant execute on function private.is_public_media_asset(uuid)
  to anon, authenticated;


-- ===========================================================================
-- Safe public venue catalog
-- ===========================================================================
--
-- Customers do not receive direct SELECT access to public.venues.
--
-- This view deliberately excludes:
--   organization_id
--   contact_email
--   contact_phone
--
-- The view owner performs the underlying read, while the explicit WHERE
-- clause is the public visibility boundary.

create view public.catalog_venues
with (security_barrier = true)
as
select
  v.id,
  v.name,
  v.slug,
  v.description,
  v.timezone,
  v.default_currency_code,
  v.published_at,

  va.address_line_1,
  va.address_line_2,
  va.city,
  va.region,
  va.postal_code,
  va.country_code,
  va.latitude,
  va.longitude

from public.venues as v
left join public.venue_addresses as va
  on va.venue_id = v.id

where v.status = 'published'
  and v.published_at is not null;


revoke all on table public.catalog_venues
  from public, anon, authenticated;

grant select on table public.catalog_venues
  to anon, authenticated;


-- ===========================================================================
-- venues
-- ===========================================================================
--
-- Direct table access is for organization operators/platform admins only.
--
-- Venue creation is allowed as a draft.
--
-- status and published_at are deliberately NOT browser-writable.
-- Publishing/unpublishing will later be a trusted server operation.

revoke all on table public.venues
  from anon, authenticated;

grant select on table public.venues
  to authenticated;

grant insert (
  organization_id,
  name,
  slug,
  description,
  timezone,
  default_currency_code,
  contact_email,
  contact_phone
)
on public.venues
to authenticated;

grant update (
  name,
  slug,
  description,
  timezone,
  default_currency_code,
  contact_email,
  contact_phone
)
on public.venues
to authenticated;


create policy venues_select_operator
on public.venues
for select
to authenticated
using (
  private.can_operate_organization(organization_id)
);


create policy venues_insert_operator
on public.venues
for insert
to authenticated
with check (
  private.can_operate_organization(organization_id)
);


create policy venues_update_operator
on public.venues
for update
to authenticated
using (
  private.can_operate_organization(organization_id)
)
with check (
  private.can_operate_organization(organization_id)
);


-- ===========================================================================
-- venue_addresses
-- ===========================================================================
--
-- Public customers receive address data via catalog_venues.
-- Direct table access is reserved for organization operators.

revoke all on table public.venue_addresses
  from anon, authenticated;

grant select on table public.venue_addresses
  to authenticated;

grant insert (
  venue_id,
  address_line_1,
  address_line_2,
  city,
  region,
  postal_code,
  country_code,
  latitude,
  longitude
)
on public.venue_addresses
to authenticated;

grant update (
  address_line_1,
  address_line_2,
  city,
  region,
  postal_code,
  country_code,
  latitude,
  longitude
)
on public.venue_addresses
to authenticated;


create policy venue_addresses_select_operator
on public.venue_addresses
for select
to authenticated
using (
  private.can_operate_venue(venue_id)
);


create policy venue_addresses_insert_operator
on public.venue_addresses
for insert
to authenticated
with check (
  private.can_operate_venue(venue_id)
);


create policy venue_addresses_update_operator
on public.venue_addresses
for update
to authenticated
using (
  private.can_operate_venue(venue_id)
)
with check (
  private.can_operate_venue(venue_id)
);


-- ===========================================================================
-- spaces
-- ===========================================================================
--
-- Public:
--   active spaces belonging to published venues
--
-- Operators:
--   all spaces belonging to organizations they operate

revoke all on table public.spaces
  from anon, authenticated;

grant select on table public.spaces
  to anon, authenticated;

grant insert (
  venue_id,
  name,
  slug,
  description,
  square_meters,
  seated_capacity,
  standing_capacity,
  theatre_capacity,
  status,
  sort_order
)
on public.spaces
to authenticated;

grant update (
  name,
  slug,
  description,
  square_meters,
  seated_capacity,
  standing_capacity,
  theatre_capacity,
  status,
  sort_order
)
on public.spaces
to authenticated;


create policy spaces_select_public
on public.spaces
for select
to anon, authenticated
using (
  private.is_public_space(id)
);


create policy spaces_select_operator
on public.spaces
for select
to authenticated
using (
  private.can_operate_venue(venue_id)
);


create policy spaces_insert_operator
on public.spaces
for insert
to authenticated
with check (
  private.can_operate_venue(venue_id)
);


create policy spaces_update_operator
on public.spaces
for update
to authenticated
using (
  private.can_operate_venue(venue_id)
)
with check (
  private.can_operate_venue(venue_id)
);


-- ===========================================================================
-- space_layouts
-- ===========================================================================

revoke all on table public.space_layouts
  from anon, authenticated;

grant select on table public.space_layouts
  to anon, authenticated;

grant insert (
  space_id,
  name,
  layout_type,
  description,
  capacity,
  status,
  sort_order
)
on public.space_layouts
to authenticated;

grant update (
  name,
  layout_type,
  description,
  capacity,
  status,
  sort_order
)
on public.space_layouts
to authenticated;


create policy space_layouts_select_public
on public.space_layouts
for select
to anon, authenticated
using (
  private.is_public_space_layout(id)
);


create policy space_layouts_select_operator
on public.space_layouts
for select
to authenticated
using (
  private.can_operate_space(space_id)
);


create policy space_layouts_insert_operator
on public.space_layouts
for insert
to authenticated
with check (
  private.can_operate_space(space_id)
);


create policy space_layouts_update_operator
on public.space_layouts
for update
to authenticated
using (
  private.can_operate_space(space_id)
)
with check (
  private.can_operate_space(space_id)
);


-- ===========================================================================
-- media_assets
-- ===========================================================================
--
-- Public access is restricted to READY assets actually attached to public
-- catalog entities.
--
-- Media creation/storage registration and processing-state changes remain
-- trusted server operations.
--
-- Organization operators may edit alt text for their own assets.

revoke all on table public.media_assets
  from anon, authenticated;

grant select on table public.media_assets
  to anon, authenticated;

grant update (
  alt_text
)
on public.media_assets
to authenticated;


create policy media_assets_select_public
on public.media_assets
for select
to anon, authenticated
using (
  private.is_public_media_asset(id)
);


create policy media_assets_select_operator
on public.media_assets
for select
to authenticated
using (
  private.can_operate_organization(organization_id)
);


create policy media_assets_update_operator
on public.media_assets
for update
to authenticated
using (
  private.can_operate_organization(organization_id)
)
with check (
  private.can_operate_organization(organization_id)
);


-- ===========================================================================
-- venue_media_assets
-- ===========================================================================

revoke all on table public.venue_media_assets
  from anon, authenticated;

grant select on table public.venue_media_assets
  to anon, authenticated;

grant insert (
  venue_id,
  media_asset_id,
  purpose,
  sort_order,
  caption
)
on public.venue_media_assets
to authenticated;

grant update (
  purpose,
  sort_order,
  caption
)
on public.venue_media_assets
to authenticated;

grant delete on table public.venue_media_assets
  to authenticated;


create policy venue_media_assets_select_public
on public.venue_media_assets
for select
to anon, authenticated
using (
  private.is_public_venue(venue_id)
  and private.is_public_media_asset(media_asset_id)
);


create policy venue_media_assets_select_operator
on public.venue_media_assets
for select
to authenticated
using (
  private.can_operate_venue(venue_id)
);


create policy venue_media_assets_insert_operator
on public.venue_media_assets
for insert
to authenticated
with check (
  private.can_operate_venue(venue_id)
);


create policy venue_media_assets_update_operator
on public.venue_media_assets
for update
to authenticated
using (
  private.can_operate_venue(venue_id)
)
with check (
  private.can_operate_venue(venue_id)
);


create policy venue_media_assets_delete_operator
on public.venue_media_assets
for delete
to authenticated
using (
  private.can_operate_venue(venue_id)
);


-- ===========================================================================
-- space_media_assets
-- ===========================================================================

revoke all on table public.space_media_assets
  from anon, authenticated;

grant select on table public.space_media_assets
  to anon, authenticated;

grant insert (
  space_id,
  media_asset_id,
  purpose,
  sort_order,
  caption
)
on public.space_media_assets
to authenticated;

grant update (
  purpose,
  sort_order,
  caption
)
on public.space_media_assets
to authenticated;

grant delete on table public.space_media_assets
  to authenticated;


create policy space_media_assets_select_public
on public.space_media_assets
for select
to anon, authenticated
using (
  private.is_public_space(space_id)
  and private.is_public_media_asset(media_asset_id)
);


create policy space_media_assets_select_operator
on public.space_media_assets
for select
to authenticated
using (
  private.can_operate_space(space_id)
);


create policy space_media_assets_insert_operator
on public.space_media_assets
for insert
to authenticated
with check (
  private.can_operate_space(space_id)
);


create policy space_media_assets_update_operator
on public.space_media_assets
for update
to authenticated
using (
  private.can_operate_space(space_id)
)
with check (
  private.can_operate_space(space_id)
);


create policy space_media_assets_delete_operator
on public.space_media_assets
for delete
to authenticated
using (
  private.can_operate_space(space_id)
);


-- ===========================================================================
-- space_layout_media_assets
-- ===========================================================================

revoke all on table public.space_layout_media_assets
  from anon, authenticated;

grant select on table public.space_layout_media_assets
  to anon, authenticated;

grant insert (
  space_layout_id,
  media_asset_id,
  purpose,
  sort_order,
  caption
)
on public.space_layout_media_assets
to authenticated;

grant update (
  purpose,
  sort_order,
  caption
)
on public.space_layout_media_assets
to authenticated;

grant delete on table public.space_layout_media_assets
  to authenticated;


create policy space_layout_media_assets_select_public
on public.space_layout_media_assets
for select
to anon, authenticated
using (
  private.is_public_space_layout(space_layout_id)
  and private.is_public_media_asset(media_asset_id)
);


create policy space_layout_media_assets_select_operator
on public.space_layout_media_assets
for select
to authenticated
using (
  private.can_operate_space_layout(space_layout_id)
);


create policy space_layout_media_assets_insert_operator
on public.space_layout_media_assets
for insert
to authenticated
with check (
  private.can_operate_space_layout(space_layout_id)
);


create policy space_layout_media_assets_update_operator
on public.space_layout_media_assets
for update
to authenticated
using (
  private.can_operate_space_layout(space_layout_id)
)
with check (
  private.can_operate_space_layout(space_layout_id)
);


create policy space_layout_media_assets_delete_operator
on public.space_layout_media_assets
for delete
to authenticated
using (
  private.can_operate_space_layout(space_layout_id)
);