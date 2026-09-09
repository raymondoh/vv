-- ============================================================================
-- VV Supabase Storage + media workflows
-- ============================================================================
--
-- Private bucket:
--
--   venue-media
--
-- Canonical object path:
--
--   <organization-uuid>/<media-asset-uuid>/<filename>
--
-- Lifecycle:
--
--   authenticated organization operator
--       -> uploads object into an organization path they operate
--
--   authenticated organization operator
--       -> register_media_asset()
--       -> media_assets.status = processing
--
--   trusted processing service
--       -> complete_media_asset_processing()
--       -> processing -> ready | failed
--
--   organization operator
--       -> archive_media_asset()
--       -> media must first be detached from catalog entities
--
--   archived/unregistered object
--       -> may be physically deleted through Storage
--
-- Public Storage reads are allowed only when:
--
--   * the database media asset is READY, and
--   * it is attached to a publicly visible venue/space/layout.
--
-- The Storage bucket itself remains private.
-- ============================================================================


-- ============================================================================
-- Private venue-media bucket
-- ============================================================================
--
-- 2 GiB is the VV database-level per-object ceiling for now.
-- A deployment/provider plan may impose a lower external limit.
--
-- SVG is deliberately excluded from the initial browser-media whitelist.
-- ============================================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'venue-media',
  'venue-media',
  false,
  2147483648,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/pdf'
  ]::text[]
)
on conflict (id)
do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================================
-- Parse canonical venue-media path
-- ============================================================================

create or replace function private.parse_venue_media_storage_path(
  object_name text
)
returns table (
  organization_id uuid,
  media_asset_id uuid,
  file_name text
)
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_folders text[];
  v_file_name text;

  v_organization_id uuid;
  v_media_asset_id uuid;
begin
  if object_name is null
     or char_length(object_name) < 1
     or char_length(object_name) > 1000
  then
    return;
  end if;


  v_folders :=
    storage.foldername(object_name);

  v_file_name :=
    storage.filename(object_name);


  -- Exactly:
  --
  --   organization UUID
  --   media-asset UUID
  --   filename

  if cardinality(v_folders) <> 2
     or v_file_name is null
     or char_length(v_file_name) < 1
     or char_length(v_file_name) > 255
     or v_file_name <> trim(v_file_name)
     or v_file_name in ('.', '..')
  then
    return;
  end if;


  begin
    v_organization_id :=
      v_folders[1]::uuid;

    v_media_asset_id :=
      v_folders[2]::uuid;

  exception
    when invalid_text_representation then
      return;
  end;


  -- UUID casts normalize their textual representation. Requiring the
  -- canonical reconstruction prevents unusual alternate path spellings.

  if object_name is distinct from
       (
         v_organization_id::text
         || '/'
         || v_media_asset_id::text
         || '/'
         || v_file_name
       )
  then
    return;
  end if;


  return query
  select
    v_organization_id,
    v_media_asset_id,
    v_file_name;

end;
$function$;


revoke all
on function private.parse_venue_media_storage_path(text)
from public, anon, authenticated;


-- ============================================================================
-- MIME / media-kind relationship
-- ============================================================================

create or replace function private.media_kind_matches_mime_type(
  media_kind_value text,
  mime_type_value text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select case lower(trim(media_kind_value))
    when 'image' then
      lower(trim(mime_type_value)) in (
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif'
      )

    when 'video' then
      lower(trim(mime_type_value)) in (
        'video/mp4',
        'video/quicktime',
        'video/webm'
      )

    when 'document' then
      lower(trim(mime_type_value)) = 'application/pdf'

    else false
  end;
$function$;


revoke all
on function private.media_kind_matches_mime_type(text, text)
from public, anon, authenticated;


-- ============================================================================
-- Can current user access an organization Storage path?
--
-- This intentionally does NOT require the organization to be active.
--
-- Existing operators may still need to read/archive/clean up historical media
-- if an organization is later suspended.
-- ============================================================================

create or replace function private.can_access_venue_media_storage_path(
  object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;


  select p.organization_id
  into v_organization_id
  from private.parse_venue_media_storage_path(object_name) as p;


  if not found then
    return false;
  end if;


  return private.can_operate_organization(
    v_organization_id
  );

end;
$function$;


revoke all
on function private.can_access_venue_media_storage_path(text)
from public, anon, authenticated;


grant execute
on function private.can_access_venue_media_storage_path(text)
to authenticated;


-- ============================================================================
-- Can current user create/change an UNREGISTERED upload?
--
-- Ordinary operators may upload only while the organization is active.
-- Platform admins retain recovery capability for suspended organizations.
-- ============================================================================

create or replace function private.can_upload_venue_media_storage_path(
  object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_organization_status text;
begin
  if not private.can_access_venue_media_storage_path(
    object_name
  ) then
    return false;
  end if;


  select p.organization_id
  into v_organization_id
  from private.parse_venue_media_storage_path(object_name) as p;


  select o.status
  into v_organization_status
  from public.organizations as o
  where o.id = v_organization_id;


  if not found then
    return false;
  end if;


  return
    v_organization_status = 'active'
    or private.is_platform_admin();

end;
$function$;


revoke all
on function private.can_upload_venue_media_storage_path(text)
from public, anon, authenticated;


grant execute
on function private.can_upload_venue_media_storage_path(text)
to authenticated;


-- ============================================================================
-- Public Storage visibility
-- ============================================================================

create or replace function private.is_public_venue_media_storage_object(
  target_bucket_id text,
  target_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    target_bucket_id = 'venue-media'
    and exists (
      select 1
      from public.media_assets as ma
      where ma.storage_bucket = target_bucket_id
        and ma.storage_path = target_storage_path
        and private.is_public_media_asset(ma.id)
    );
$function$;


revoke all
on function private.is_public_venue_media_storage_object(text, text)
from public, anon, authenticated;


grant execute
on function private.is_public_venue_media_storage_object(text, text)
to anon, authenticated;


-- ============================================================================
-- Update permission for unregistered uploads
--
-- This supports Storage upload mechanics/retries without permitting overwrite
-- of an already registered VV media asset.
-- ============================================================================

create or replace function private.can_update_unregistered_venue_media_object(
  target_bucket_id text,
  target_storage_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if target_bucket_id <> 'venue-media' then
    return false;
  end if;


  if not private.can_upload_venue_media_storage_path(
    target_storage_path
  ) then
    return false;
  end if;


  return not exists (
    select 1
    from public.media_assets as ma
    where ma.storage_bucket = target_bucket_id
      and ma.storage_path = target_storage_path
  );

end;
$function$;


revoke all
on function private.can_update_unregistered_venue_media_object(text, text)
from public, anon, authenticated;


grant execute
on function private.can_update_unregistered_venue_media_object(text, text)
to authenticated;


-- ============================================================================
-- Storage deletion permission
--
-- Allowed when:
--
--   * object is an unregistered orphan upload, OR
--   * matching media asset is archived AND detached from all catalog entities.
-- ============================================================================

create or replace function private.can_delete_venue_media_storage_object(
  target_bucket_id text,
  target_storage_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_path_organization_id uuid;
  v_path_media_asset_id uuid;

  v_database_media_asset_id uuid;
  v_database_organization_id uuid;
  v_media_status text;
begin
  if target_bucket_id <> 'venue-media' then
    return false;
  end if;


  if not private.can_access_venue_media_storage_path(
    target_storage_path
  ) then
    return false;
  end if;


  select
    p.organization_id,
    p.media_asset_id
  into
    v_path_organization_id,
    v_path_media_asset_id
  from private.parse_venue_media_storage_path(
    target_storage_path
  ) as p;


  if not found then
    return false;
  end if;


  select
    ma.id,
    ma.organization_id,
    ma.status
  into
    v_database_media_asset_id,
    v_database_organization_id,
    v_media_status
  from public.media_assets as ma
  where ma.storage_bucket = target_bucket_id
    and ma.storage_path = target_storage_path;


  -- No registration exists: safe orphan cleanup.

  if not found then
    return true;
  end if;


  -- Registered paths must agree with their canonical UUID path.

  if v_database_media_asset_id
       is distinct from v_path_media_asset_id
     or v_database_organization_id
       is distinct from v_path_organization_id
  then
    return false;
  end if;


  if v_media_status <> 'archived' then
    return false;
  end if;


  if exists (
    select 1
    from public.venue_media_assets as vma
    where vma.media_asset_id =
      v_database_media_asset_id

    union all

    select 1
    from public.space_media_assets as sma
    where sma.media_asset_id =
      v_database_media_asset_id

    union all

    select 1
    from public.space_layout_media_assets as slma
    where slma.media_asset_id =
      v_database_media_asset_id
  ) then
    return false;
  end if;


  return true;

end;
$function$;


revoke all
on function private.can_delete_venue_media_storage_object(text, text)
from public, anon, authenticated;


grant execute
on function private.can_delete_venue_media_storage_object(text, text)
to authenticated;


-- ============================================================================
-- Storage object privileges
--
-- Storage RLS remains the authoritative row boundary.
-- ============================================================================

grant select
on table storage.objects
to anon, authenticated;


grant insert, update, delete
on table storage.objects
to authenticated;


revoke insert, update, delete
on table storage.objects
from anon;


-- ============================================================================
-- Storage RLS policies
-- ============================================================================

drop policy if exists venue_media_public_read
on storage.objects;

drop policy if exists venue_media_operator_read
on storage.objects;

drop policy if exists venue_media_operator_insert
on storage.objects;

drop policy if exists venue_media_operator_update_unregistered
on storage.objects;

drop policy if exists venue_media_operator_delete
on storage.objects;


-- Public may read only DB-authorized public media.

create policy venue_media_public_read
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'venue-media'
  and private.is_public_venue_media_storage_object(
    bucket_id,
    name
  )
);


-- Organization operators may read their organization media, including drafts,
-- processing assets and unregistered upload retries.

create policy venue_media_operator_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'venue-media'
  and private.can_access_venue_media_storage_path(
    name
  )
);


-- New uploads must use the canonical organization/media UUID path.

create policy venue_media_operator_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'venue-media'
  and private.can_upload_venue_media_storage_path(
    name
  )
);


-- Upload mechanics may update an object only BEFORE that object has been
-- registered as a VV media asset.

create policy venue_media_operator_update_unregistered
on storage.objects
for update
to authenticated
using (
  bucket_id = 'venue-media'
  and private.can_update_unregistered_venue_media_object(
    bucket_id,
    name
  )
)
with check (
  bucket_id = 'venue-media'
  and private.can_update_unregistered_venue_media_object(
    bucket_id,
    name
  )
);


-- Physical deletion is allowed only for orphan uploads or archived,
-- fully-detached media assets.

create policy venue_media_operator_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'venue-media'
  and private.can_delete_venue_media_storage_object(
    bucket_id,
    name
  )
);


-- ============================================================================
-- Media asset storage identity
--
-- Once registered, an asset cannot silently point at another object.
-- ============================================================================

create trigger protect_media_asset_storage_identity
before update on public.media_assets
for each row
execute function private.prevent_column_changes(
  'storage_bucket',
  'storage_path',
  'media_kind',
  'created_at'
);


-- ============================================================================
-- Media lifecycle invariant
-- ============================================================================

create or replace function private.validate_media_asset_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;


  if old.status = 'archived' then
    raise exception
      'Archived media asset cannot be reopened'
      using errcode = '23514';
  end if;


  if new.status = 'archived' then
    return new;
  end if;


  if old.status = 'processing'
     and new.status in ('ready', 'failed')
  then
    return new;
  end if;


  raise exception
    'Invalid media asset status transition: % -> %',
    old.status,
    new.status
    using errcode = '23514';

end;
$function$;


revoke all
on function private.validate_media_asset_status_transition()
from public, anon, authenticated;


create trigger validate_media_asset_status_transition
before update of status
on public.media_assets
for each row
execute function private.validate_media_asset_status_transition();


-- ============================================================================
-- Register uploaded object
-- ============================================================================

create or replace function public.register_media_asset(
  media_asset_id uuid,
  target_organization_id uuid,
  storage_path_value text,
  media_kind_value text,
  mime_type_value text,
  alt_text_value text default null
)
returns table (
  registered_media_asset_id uuid,
  organization_id uuid,
  storage_bucket text,
  storage_path text,
  media_kind text,
  mime_type text,
  media_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_storage_path text :=
    nullif(trim(storage_path_value), '');

  v_media_kind text :=
    lower(nullif(trim(media_kind_value), ''));

  v_mime_type text :=
    lower(nullif(trim(mime_type_value), ''));

  v_alt_text text :=
    nullif(trim(alt_text_value), '');

  v_path_organization_id uuid;
  v_path_media_asset_id uuid;
  v_file_name text;

  v_organization_status text;

  v_existing public.media_assets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if media_asset_id is null
     or target_organization_id is null
  then
    raise exception
      'Media asset ID and organization ID are required'
      using errcode = '23514';
  end if;


  if v_storage_path is null then
    raise exception 'Storage path is required'
      using errcode = '23514';
  end if;


  if not private.media_kind_matches_mime_type(
    v_media_kind,
    v_mime_type
  ) then
    raise exception
      'Media kind and MIME type are not an allowed VV media combination'
      using errcode = '23514';
  end if;


  if v_alt_text is not null
     and char_length(v_alt_text) > 1000
  then
    raise exception
      'Media alt text is too long'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Canonical path identity
  -- --------------------------------------------------------------------------

  select
    p.organization_id,
    p.media_asset_id,
    p.file_name
  into
    v_path_organization_id,
    v_path_media_asset_id,
    v_file_name
  from private.parse_venue_media_storage_path(
    v_storage_path
  ) as p;


  if not found then
    raise exception
      'Venue media storage path is invalid'
      using errcode = '23514';
  end if;


  if v_path_organization_id
       is distinct from target_organization_id
     or v_path_media_asset_id
       is distinct from media_asset_id
  then
    raise exception
      'Storage path organization/media IDs do not match registration IDs'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Organization authorization
  -- --------------------------------------------------------------------------

  select o.status
  into v_organization_status
  from public.organizations as o
  where o.id = target_organization_id
  for share;


  if not found then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;


  if not private.can_operate_organization(
    target_organization_id
  ) then
    raise exception
      'You are not permitted to register media for this organization'
      using errcode = '42501';
  end if;


  if v_organization_status <> 'active'
     and not private.is_platform_admin()
  then
    raise exception
      'Media cannot be registered while the organization is not active'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotent UUID replay
  -- --------------------------------------------------------------------------

  select ma.*
  into v_existing
  from public.media_assets as ma
  where ma.id = media_asset_id
  for update;


  if found then

    if v_existing.organization_id
         is distinct from target_organization_id
       or v_existing.storage_bucket
         is distinct from 'venue-media'
       or v_existing.storage_path
         is distinct from v_storage_path
    then
      raise exception
        'Media asset ID has already been used for different storage identity'
        using errcode = '23505';
    end if;


    return query
    select
      v_existing.id,
      v_existing.organization_id,
      v_existing.storage_bucket,
      v_existing.storage_path,
      v_existing.media_kind,
      v_existing.mime_type,
      v_existing.status;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Uploaded Storage object must already exist.
  -- --------------------------------------------------------------------------

  perform so.id
  from storage.objects as so
  where so.bucket_id = 'venue-media'
    and so.name = v_storage_path
    and so.archived_at is null
    and so.is_delete_marker = false
  for share;


  if not found then
    raise exception
      'Uploaded venue-media Storage object was not found'
      using errcode = 'P0002';
  end if;


  -- Storage location may belong to only one media row.

  if exists (
    select 1
    from public.media_assets as ma
    where ma.storage_bucket = 'venue-media'
      and ma.storage_path = v_storage_path
  ) then
    raise exception
      'Storage object is already registered to another media asset'
      using errcode = '23505';
  end if;


  insert into public.media_assets (
    id,
    organization_id,
    storage_bucket,
    storage_path,
    media_kind,
    mime_type,
    alt_text,
    status,
    created_by_user_id
  )
  values (
    media_asset_id,
    target_organization_id,
    'venue-media',
    v_storage_path,
    v_media_kind,
    v_mime_type,
    v_alt_text,
    'processing',
    auth.uid()
  )
  returning *
  into v_existing;


  return query
  select
    v_existing.id,
    v_existing.organization_id,
    v_existing.storage_bucket,
    v_existing.storage_path,
    v_existing.media_kind,
    v_existing.mime_type,
    v_existing.status;

end;
$function$;


-- ============================================================================
-- Trusted media processing completion
-- ============================================================================

create or replace function public.complete_media_asset_processing(
  target_media_asset_id uuid,
  processing_outcome_value text,
  mime_type_value text default null,
  file_size_bytes_value bigint default null,
  width_px_value integer default null,
  height_px_value integer default null,
  duration_ms_value bigint default null
)
returns table (
  media_asset_id uuid,
  media_status text,
  mime_type text,
  file_size_bytes bigint,
  width_px integer,
  height_px integer,
  duration_ms bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outcome text :=
    lower(nullif(trim(processing_outcome_value), ''));

  v_mime_type text :=
    lower(nullif(trim(mime_type_value), ''));

  v_asset public.media_assets%rowtype;
begin
  if target_media_asset_id is null then
    raise exception 'Media asset ID is required'
      using errcode = '23514';
  end if;


  if v_outcome not in ('ready', 'failed') then
    raise exception
      'Processing outcome must be ready or failed'
      using errcode = '23514';
  end if;


  if file_size_bytes_value is not null
     and file_size_bytes_value < 0
  then
    raise exception
      'Media file size cannot be negative'
      using errcode = '23514';
  end if;


  if width_px_value is not null
     and width_px_value <= 0
  then
    raise exception
      'Media width must be positive'
      using errcode = '23514';
  end if;


  if height_px_value is not null
     and height_px_value <= 0
  then
    raise exception
      'Media height must be positive'
      using errcode = '23514';
  end if;


  if duration_ms_value is not null
     and duration_ms_value < 0
  then
    raise exception
      'Media duration cannot be negative'
      using errcode = '23514';
  end if;


  select ma.*
  into v_asset
  from public.media_assets as ma
  where ma.id = target_media_asset_id
  for update;


  if not found then
    raise exception 'Media asset not found'
      using errcode = 'P0002';
  end if;


  -- Idempotent same-terminal-outcome replay.

  if v_asset.status = v_outcome then

    if v_outcome = 'ready'
       and not exists (
         select 1
         from storage.objects as so
         where so.bucket_id = v_asset.storage_bucket
           and so.name = v_asset.storage_path
           and so.archived_at is null
           and so.is_delete_marker = false
       )
    then
      raise exception
        'Ready media asset no longer has its Storage object'
        using errcode = '23514';
    end if;


    return query
    select
      v_asset.id,
      v_asset.status,
      v_asset.mime_type,
      v_asset.file_size_bytes,
      v_asset.width_px,
      v_asset.height_px,
      v_asset.duration_ms;

    return;
  end if;


  if v_asset.status <> 'processing' then
    raise exception
      'Media asset is not awaiting processing; current status is %',
      v_asset.status
      using errcode = '23514';
  end if;


  if v_outcome = 'ready' then

    if v_mime_type is null then
      raise exception
        'Ready media requires a final MIME type'
        using errcode = '23514';
    end if;


    if not private.media_kind_matches_mime_type(
      v_asset.media_kind,
      v_mime_type
    ) then
      raise exception
        'Final MIME type does not match the registered media kind'
        using errcode = '23514';
    end if;


    if not exists (
      select 1
      from storage.objects as so
      where so.bucket_id = v_asset.storage_bucket
        and so.name = v_asset.storage_path
        and so.archived_at is null
        and so.is_delete_marker = false
    ) then
      raise exception
        'Storage object must exist before media can become ready'
        using errcode = '23514';
    end if;

  else

    -- Failed processing may still retain/correct a known MIME value.

    if v_mime_type is not null
       and not private.media_kind_matches_mime_type(
         v_asset.media_kind,
         v_mime_type
       )
    then
      raise exception
        'Final MIME type does not match the registered media kind'
        using errcode = '23514';
    end if;

  end if;


  update public.media_assets as ma
  set
    status = v_outcome,
    mime_type = coalesce(
      v_mime_type,
      ma.mime_type
    ),
    file_size_bytes = coalesce(
      file_size_bytes_value,
      ma.file_size_bytes
    ),
    width_px = coalesce(
      width_px_value,
      ma.width_px
    ),
    height_px = coalesce(
      height_px_value,
      ma.height_px
    ),
    duration_ms = coalesce(
      duration_ms_value,
      ma.duration_ms
    )
  where ma.id = target_media_asset_id
  returning *
  into v_asset;


  return query
  select
    v_asset.id,
    v_asset.status,
    v_asset.mime_type,
    v_asset.file_size_bytes,
    v_asset.width_px,
    v_asset.height_px,
    v_asset.duration_ms;

end;
$function$;


-- ============================================================================
-- Archive media asset
--
-- Attachments must be removed first.
--
-- The database row is retained as historical metadata. Once archived and
-- detached, Storage RLS allows the physical object to be deleted.
-- ============================================================================

create or replace function public.archive_media_asset(
  target_media_asset_id uuid
)
returns table (
  media_asset_id uuid,
  media_status text,
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_asset public.media_assets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if target_media_asset_id is null then
    raise exception 'Media asset ID is required'
      using errcode = '23514';
  end if;


  select ma.*
  into v_asset
  from public.media_assets as ma
  where ma.id = target_media_asset_id
  for update;


  if not found then
    raise exception 'Media asset not found'
      using errcode = 'P0002';
  end if;


  if not private.can_operate_organization(
    v_asset.organization_id
  ) then
    raise exception
      'You are not permitted to archive this media asset'
      using errcode = '42501';
  end if;


  if v_asset.status = 'archived' then
    return query
    select
      v_asset.id,
      v_asset.status,
      v_asset.storage_bucket,
      v_asset.storage_path;

    return;
  end if;


  if exists (
    select 1
    from public.venue_media_assets as vma
    where vma.media_asset_id = target_media_asset_id

    union all

    select 1
    from public.space_media_assets as sma
    where sma.media_asset_id = target_media_asset_id

    union all

    select 1
    from public.space_layout_media_assets as slma
    where slma.media_asset_id = target_media_asset_id
  ) then
    raise exception
      'Detach media asset from all venue catalog entities before archiving it'
      using errcode = '23514';
  end if;


  update public.media_assets as ma
  set status = 'archived'
  where ma.id = target_media_asset_id
  returning *
  into v_asset;


  return query
  select
    v_asset.id,
    v_asset.status,
    v_asset.storage_bucket,
    v_asset.storage_path;

end;
$function$;


-- ============================================================================
-- Workflow privileges
-- ============================================================================

revoke all
on function public.register_media_asset(
  uuid,
  uuid,
  text,
  text,
  text,
  text
)
from public, anon, authenticated;


revoke all
on function public.complete_media_asset_processing(
  uuid,
  text,
  text,
  bigint,
  integer,
  integer,
  bigint
)
from public, anon, authenticated;


revoke all
on function public.archive_media_asset(uuid)
from public, anon, authenticated;


grant execute
on function public.register_media_asset(
  uuid,
  uuid,
  text,
  text,
  text,
  text
)
to authenticated;


grant execute
on function public.complete_media_asset_processing(
  uuid,
  text,
  text,
  bigint,
  integer,
  integer,
  bigint
)
to service_role;


grant execute
on function public.archive_media_asset(uuid)
to authenticated;


-- ============================================================================
-- Documentation
-- ============================================================================

comment on function public.register_media_asset(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) is
  'Registers an already-uploaded private venue-media Storage object as a processing VV media asset. The canonical path embeds organization and media UUID identity.';


comment on function public.complete_media_asset_processing(
  uuid,
  text,
  text,
  bigint,
  integer,
  integer,
  bigint
) is
  'Service-role-only workflow that records media processing success/failure and authoritative technical metadata.';


comment on function public.archive_media_asset(uuid) is
  'Archives a detached organization media asset. The database history remains while Storage deletion becomes permitted.';


comment on table public.media_assets is
  'VV organization-owned media registry backed by private Supabase Storage. Registered storage identity is immutable; public delivery requires ready status plus attachment to a public catalog entity.';
