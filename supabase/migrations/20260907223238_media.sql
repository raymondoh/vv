-- VV Production Database
-- Migration 0006: media assets and entity-media relationships

-- ===========================================================================
-- media_assets
-- ===========================================================================
--
-- A media asset is an organisation-owned stored file.
--
-- The asset describes WHAT the file is technically:
--   image
--   video
--   document
--
-- Join tables describe HOW that asset is being used:
--   hero
--   gallery
--   floor_plan
--   walkthrough
--   diagram
--   document

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  storage_bucket text not null,
  storage_path text not null,

  media_kind text not null,
  mime_type text not null,

  file_size_bytes bigint null,

  width_px integer null,
  height_px integer null,
  duration_ms bigint null,

  alt_text text null,

  status text not null default 'ready',

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_assets_storage_bucket_check
    check (
      char_length(trim(storage_bucket)) between 1 and 100
    ),

  constraint media_assets_storage_path_check
    check (
      char_length(trim(storage_path)) between 1 and 1000
    ),

  constraint media_assets_kind_check
    check (
      media_kind in (
        'image',
        'video',
        'document'
      )
    ),

  constraint media_assets_mime_type_check
    check (
      char_length(trim(mime_type)) between 3 and 255
    ),

  constraint media_assets_file_size_check
    check (
      file_size_bytes is null
      or file_size_bytes >= 0
    ),

  constraint media_assets_width_check
    check (
      width_px is null
      or width_px > 0
    ),

  constraint media_assets_height_check
    check (
      height_px is null
      or height_px > 0
    ),

  constraint media_assets_duration_check
    check (
      duration_ms is null
      or duration_ms >= 0
    ),

  constraint media_assets_status_check
    check (
      status in (
        'processing',
        'ready',
        'failed',
        'archived'
      )
    ),

  constraint media_assets_storage_location_unique
    unique (
      storage_bucket,
      storage_path
    )
);

comment on table public.media_assets is
  'Organisation-owned media stored for VV venues, spaces and layouts.';

comment on column public.media_assets.storage_path is
  'Path inside the Supabase Storage bucket; the database does not store binary file data.';

comment on column public.media_assets.media_kind is
  'Technical file category: image, video or document.';

comment on column public.media_assets.status is
  'Processing lifecycle for the stored media asset.';


create index media_assets_org_status_idx
  on public.media_assets (
    organization_id,
    status
  );

create index media_assets_org_kind_idx
  on public.media_assets (
    organization_id,
    media_kind
  );


create trigger set_media_assets_updated_at
before update on public.media_assets
for each row
execute function private.set_updated_at();


alter table public.media_assets enable row level security;


-- ===========================================================================
-- venue_media_assets
-- ===========================================================================

create table public.venue_media_assets (
  venue_id uuid not null
    references public.venues(id)
    on delete cascade,

  media_asset_id uuid not null
    references public.media_assets(id)
    on delete cascade,

  purpose text not null,

  sort_order integer not null default 0,

  caption text null,

  created_at timestamptz not null default now(),

  primary key (
    venue_id,
    media_asset_id
  ),

  constraint venue_media_assets_purpose_check
    check (
      purpose in (
        'hero',
        'gallery',
        'walkthrough',
        'document'
      )
    ),

  constraint venue_media_assets_sort_order_check
    check (
      sort_order >= 0
    )
);

comment on table public.venue_media_assets is
  'Associates organisation-owned media assets with venues.';


-- One explicit hero asset per venue.

create unique index venue_media_assets_one_hero_uidx
  on public.venue_media_assets (venue_id)
  where purpose = 'hero';


create index venue_media_assets_display_idx
  on public.venue_media_assets (
    venue_id,
    purpose,
    sort_order
  );

create index venue_media_assets_media_asset_id_idx
  on public.venue_media_assets (
    media_asset_id
  );


alter table public.venue_media_assets enable row level security;


-- ===========================================================================
-- space_media_assets
-- ===========================================================================

create table public.space_media_assets (
  space_id uuid not null
    references public.spaces(id)
    on delete cascade,

  media_asset_id uuid not null
    references public.media_assets(id)
    on delete cascade,

  purpose text not null,

  sort_order integer not null default 0,

  caption text null,

  created_at timestamptz not null default now(),

  primary key (
    space_id,
    media_asset_id
  ),

  constraint space_media_assets_purpose_check
    check (
      purpose in (
        'hero',
        'gallery',
        'floor_plan',
        'walkthrough',
        'document'
      )
    ),

  constraint space_media_assets_sort_order_check
    check (
      sort_order >= 0
    )
);

comment on table public.space_media_assets is
  'Associates organisation-owned media assets with reservable venue spaces.';


create unique index space_media_assets_one_hero_uidx
  on public.space_media_assets (space_id)
  where purpose = 'hero';


create index space_media_assets_display_idx
  on public.space_media_assets (
    space_id,
    purpose,
    sort_order
  );

create index space_media_assets_media_asset_id_idx
  on public.space_media_assets (
    media_asset_id
  );


alter table public.space_media_assets enable row level security;


-- ===========================================================================
-- space_layout_media_assets
-- ===========================================================================

create table public.space_layout_media_assets (
  space_layout_id uuid not null
    references public.space_layouts(id)
    on delete cascade,

  media_asset_id uuid not null
    references public.media_assets(id)
    on delete cascade,

  purpose text not null,

  sort_order integer not null default 0,

  caption text null,

  created_at timestamptz not null default now(),

  primary key (
    space_layout_id,
    media_asset_id
  ),

  constraint space_layout_media_assets_purpose_check
    check (
      purpose in (
        'diagram',
        'gallery',
        'document'
      )
    ),

  constraint space_layout_media_assets_sort_order_check
    check (
      sort_order >= 0
    )
);

comment on table public.space_layout_media_assets is
  'Associates organisation-owned media assets with individual space layouts.';


create index space_layout_media_assets_display_idx
  on public.space_layout_media_assets (
    space_layout_id,
    purpose,
    sort_order
  );

create index space_layout_media_assets_media_asset_id_idx
  on public.space_layout_media_assets (
    media_asset_id
  );


alter table public.space_layout_media_assets enable row level security;


-- ===========================================================================
-- Cross-organisation ownership protection
-- ===========================================================================
--
-- RLS will eventually prevent users manipulating another organisation's
-- records, but tenant integrity must not rely only on application/RLS logic.
--
-- These trigger functions ensure an organisation-owned media asset can only
-- be attached to entities belonging to that same organisation.


-- ---------------------------------------------------------------------------
-- Venue media ownership
-- ---------------------------------------------------------------------------

create or replace function private.validate_venue_media_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  venue_organization_id uuid;
  media_organization_id uuid;
begin
  select v.organization_id
    into venue_organization_id
  from public.venues as v
  where v.id = new.venue_id;

  select m.organization_id
    into media_organization_id
  from public.media_assets as m
  where m.id = new.media_asset_id;

  if venue_organization_id is null then
    raise exception
      'Venue % does not exist',
      new.venue_id;
  end if;

  if media_organization_id is null then
    raise exception
      'Media asset % does not exist',
      new.media_asset_id;
  end if;

  if venue_organization_id <> media_organization_id then
    raise exception
      'Media asset organization does not match venue organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_venue_media_ownership()
  from public, anon, authenticated;


create trigger validate_venue_media_ownership
before insert or update of venue_id, media_asset_id
on public.venue_media_assets
for each row
execute function private.validate_venue_media_ownership();


-- ---------------------------------------------------------------------------
-- Space media ownership
-- ---------------------------------------------------------------------------

create or replace function private.validate_space_media_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  space_organization_id uuid;
  media_organization_id uuid;
begin
  select v.organization_id
    into space_organization_id
  from public.spaces as s
  join public.venues as v
    on v.id = s.venue_id
  where s.id = new.space_id;

  select m.organization_id
    into media_organization_id
  from public.media_assets as m
  where m.id = new.media_asset_id;

  if space_organization_id is null then
    raise exception
      'Space % does not exist',
      new.space_id;
  end if;

  if media_organization_id is null then
    raise exception
      'Media asset % does not exist',
      new.media_asset_id;
  end if;

  if space_organization_id <> media_organization_id then
    raise exception
      'Media asset organization does not match space organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_space_media_ownership()
  from public, anon, authenticated;


create trigger validate_space_media_ownership
before insert or update of space_id, media_asset_id
on public.space_media_assets
for each row
execute function private.validate_space_media_ownership();


-- ---------------------------------------------------------------------------
-- Space-layout media ownership
-- ---------------------------------------------------------------------------

create or replace function private.validate_space_layout_media_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  layout_organization_id uuid;
  media_organization_id uuid;
begin
  select v.organization_id
    into layout_organization_id
  from public.space_layouts as l
  join public.spaces as s
    on s.id = l.space_id
  join public.venues as v
    on v.id = s.venue_id
  where l.id = new.space_layout_id;

  select m.organization_id
    into media_organization_id
  from public.media_assets as m
  where m.id = new.media_asset_id;

  if layout_organization_id is null then
    raise exception
      'Space layout % does not exist',
      new.space_layout_id;
  end if;

  if media_organization_id is null then
    raise exception
      'Media asset % does not exist',
      new.media_asset_id;
  end if;

  if layout_organization_id <> media_organization_id then
    raise exception
      'Media asset organization does not match space layout organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_space_layout_media_ownership()
  from public, anon, authenticated;


create trigger validate_space_layout_media_ownership
before insert or update of space_layout_id, media_asset_id
on public.space_layout_media_assets
for each row
execute function private.validate_space_layout_media_ownership();