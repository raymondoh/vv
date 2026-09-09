-- ============================================================================
-- VV organisation administration workflows
-- ============================================================================
--
-- Trusted organisation lifecycle boundary for:
--
--   create_organization()
--   add_organization_member()
--   set_organization_member_role()
--   set_organization_member_status()
--   create_organization_commercial_term_version()
--
-- Core rules:
--
--   * authenticated user creates organisation -> automatically becomes owner
--   * membership administration is owner / platform-admin only
--   * managers remain organisation administrators for ordinary business
--     details, but cannot alter membership ownership
--   * every non-closed organisation must retain an active owner
--   * membership identity is immutable
--   * VV commercial terms are platform-admin controlled
--   * commercial terms are appended as immutable versions
-- ============================================================================


-- ============================================================================
-- Protect the final active owner
--
-- This is deliberately enforced below the public workflow layer.
--
-- The organisation row is locked before checking the other owners. Therefore
-- two concurrent attempts to demote/suspend the final two owners cannot both
-- observe the other owner and leave the organisation ownerless.
-- ============================================================================

create or replace function private.protect_last_active_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_losing_active_owner boolean;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;

    v_losing_active_owner :=
      old.role = 'owner'
      and old.status = 'active';

  else
    v_organization_id := old.organization_id;

    v_losing_active_owner :=
      old.role = 'owner'
      and old.status = 'active'
      and (
        new.role <> 'owner'
        or new.status <> 'active'
      );
  end if;


  if not v_losing_active_owner then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;


  -- Serialize ownership changes for this organisation.

  perform o.id
  from public.organizations as o
  where o.id = v_organization_id
  for update;


  if not found then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;


  if not exists (
    select 1
    from public.organization_memberships as om
    where om.organization_id = v_organization_id
      and om.user_id <> old.user_id
      and om.role = 'owner'
      and om.status = 'active'
  ) then
    raise exception
      'Organization must retain at least one active owner'
      using errcode = '23514';
  end if;


  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;


revoke all
on function private.protect_last_active_organization_owner()
from public, anon, authenticated;


create trigger protect_last_active_organization_owner
before update of role, status
or delete
on public.organization_memberships
for each row
execute function private.protect_last_active_organization_owner();


-- ============================================================================
-- Deferred organisation ownership invariant
--
-- The final-owner trigger protects an existing organisation.
--
-- This deferred constraint additionally proves that a newly-created
-- non-closed organisation has acquired at least one active owner before its
-- transaction commits.
--
-- create_organization() inserts the organisation and its owner atomically,
-- so normal application creation satisfies this automatically.
-- ============================================================================

create or replace function private.validate_organization_has_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'closed' then
    return new;
  end if;


  if not exists (
    select 1
    from public.organization_memberships as om
    where om.organization_id = new.id
      and om.role = 'owner'
      and om.status = 'active'
  ) then
    raise exception
      'Organization must have at least one active owner'
      using errcode = '23514';
  end if;


  return new;
end;
$function$;


revoke all
on function private.validate_organization_has_active_owner()
from public, anon, authenticated;


create constraint trigger validate_organization_has_active_owner
after insert or update of status
on public.organizations
deferrable initially deferred
for each row
execute function private.validate_organization_has_active_owner();


-- ============================================================================
-- Create organisation
-- ============================================================================

create or replace function public.create_organization(
  organization_id uuid,
  legal_name_value text,
  display_name_value text,
  slug_value text,
  country_code_value text,
  company_number_value text default null,
  tax_registration_number_value text default null,
  contact_email_value text default null,
  contact_phone_value text default null
)
returns table (
  created_organization_id uuid,
  owner_membership_id uuid,
  organization_status text,
  membership_role text,
  membership_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();

  v_legal_name text;
  v_display_name text;
  v_slug text;
  v_country_code text;
  v_company_number text;
  v_tax_registration_number text;
  v_contact_email text;
  v_contact_phone text;

  v_existing public.organizations%rowtype;
  v_membership public.organization_memberships%rowtype;
begin
  -- --------------------------------------------------------------------------
  -- Authentication
  -- --------------------------------------------------------------------------

  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if not exists (
    select 1
    from public.user_profiles as up
    where up.id = v_user_id
  ) then
    raise exception 'User profile is required before creating an organization'
      using errcode = '23514';
  end if;


  if organization_id is null then
    raise exception 'Organization ID is required'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Normalize browser-supplied business details.
  -- --------------------------------------------------------------------------

  v_legal_name := nullif(trim(legal_name_value), '');
  v_display_name := nullif(trim(display_name_value), '');
  v_slug := lower(nullif(trim(slug_value), ''));
  v_country_code := upper(nullif(trim(country_code_value), ''));

  v_company_number :=
    nullif(trim(company_number_value), '');

  v_tax_registration_number :=
    nullif(trim(tax_registration_number_value), '');

  v_contact_email :=
    nullif(lower(trim(contact_email_value)), '');

  v_contact_phone :=
    nullif(trim(contact_phone_value), '');


  if v_legal_name is null then
    raise exception 'Organization legal name is required'
      using errcode = '23514';
  end if;


  if v_display_name is null then
    raise exception 'Organization display name is required'
      using errcode = '23514';
  end if;


  if v_slug is null
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(v_slug) > 120
  then
    raise exception 'Organization slug is invalid'
      using errcode = '23514';
  end if;


  if v_country_code is null
     or v_country_code !~ '^[A-Z]{2}$'
  then
    raise exception 'Organization country code must be two letters'
      using errcode = '23514';
  end if;


  -- --------------------------------------------------------------------------
  -- Idempotent retry.
  --
  -- The client-generated UUID identifies one logical organisation creation.
  -- --------------------------------------------------------------------------

  select o.*
  into v_existing
  from public.organizations as o
  where o.id = organization_id
  for update;

  if found then

    if v_existing.created_by_user_id is distinct from v_user_id
       or v_existing.legal_name is distinct from v_legal_name
       or v_existing.display_name is distinct from v_display_name
       or v_existing.slug is distinct from v_slug
       or v_existing.country_code is distinct from v_country_code
       or v_existing.company_number is distinct from v_company_number
       or v_existing.tax_registration_number
            is distinct from v_tax_registration_number
       or v_existing.contact_email is distinct from v_contact_email
       or v_existing.contact_phone is distinct from v_contact_phone
    then
      raise exception
        'Organization ID has already been used with different organization data'
        using errcode = '23505';
    end if;


    select om.*
    into v_membership
    from public.organization_memberships as om
    where om.organization_id = v_existing.id
      and om.user_id = v_user_id
    for update;


    if not found
       or v_membership.role <> 'owner'
       or v_membership.status <> 'active'
    then
      raise exception
        'Organization creation replay is no longer authorized'
        using errcode = '42501';
    end if;


    return query
    select
      v_existing.id,
      v_membership.id,
      v_existing.status,
      v_membership.role,
      v_membership.status;

    return;
  end if;


  -- --------------------------------------------------------------------------
  -- Create organisation.
  --
  -- No commercial terms are created here. Marketplace commercial terms remain
  -- under VV/platform control.
  -- --------------------------------------------------------------------------

  insert into public.organizations (
    id,
    legal_name,
    display_name,
    slug,
    company_number,
    tax_registration_number,
    country_code,
    contact_email,
    contact_phone,
    status,
    created_by_user_id
  )
  values (
    organization_id,
    v_legal_name,
    v_display_name,
    v_slug,
    v_company_number,
    v_tax_registration_number,
    v_country_code,
    v_contact_email,
    v_contact_phone,
    'active',
    v_user_id
  )
  returning *
  into v_existing;


  -- The creator becomes the first active owner atomically.

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    created_by_user_id
  )
  values (
    organization_id,
    v_user_id,
    'owner',
    'active',
    v_user_id
  )
  returning *
  into v_membership;


  return query
  select
    v_existing.id,
    v_membership.id,
    v_existing.status,
    v_membership.role,
    v_membership.status;

end;
$function$;


-- ============================================================================
-- Add organisation member
--
-- V1 accepts an existing user UUID.
--
-- Account discovery/invitation by email belongs in the application/server
-- onboarding flow later. The database does not expose arbitrary user lookup.
-- ============================================================================

create or replace function public.add_organization_member(
  target_organization_id uuid,
  target_user_id uuid,
  member_role_value text
)
returns table (
  membership_id uuid,
  organization_id uuid,
  user_id uuid,
  member_role text,
  member_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org_status text;
  v_role text := lower(nullif(trim(member_role_value), ''));

  v_existing public.organization_memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if target_organization_id is null
     or target_user_id is null
  then
    raise exception 'Organization ID and user ID are required'
      using errcode = '23514';
  end if;


  if v_role not in ('owner', 'manager', 'staff') then
    raise exception 'Organization role must be owner, manager or staff'
      using errcode = '23514';
  end if;


  -- Serialize membership administration by organisation.

  select o.status
  into v_org_status
  from public.organizations as o
  where o.id = target_organization_id
  for update;

  if not found then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;


  -- Membership ownership is stricter than ordinary organisation administration.
  --
  -- Managers may edit business details but may not change who controls the
  -- organisation.

  if not (
    private.is_platform_admin()
    or private.has_organization_role(
      target_organization_id,
      array['owner']::text[]
    )
  ) then
    raise exception
      'Only an organization owner or platform admin may manage membership'
      using errcode = '42501';
  end if;


  if v_org_status <> 'active'
     and not private.is_platform_admin()
  then
    raise exception
      'Membership cannot be changed while the organization is not active'
      using errcode = '23514';
  end if;


  if not exists (
    select 1
    from public.user_profiles as up
    where up.id = target_user_id
  ) then
    raise exception 'Target user profile does not exist'
      using errcode = 'P0002';
  end if;


  -- Idempotent exact retry.

  select om.*
  into v_existing
  from public.organization_memberships as om
  where om.organization_id = target_organization_id
    and om.user_id = target_user_id
  for update;

  if found then

    if v_existing.role = v_role
       and v_existing.status = 'active'
    then
      return query
      select
        v_existing.id,
        v_existing.organization_id,
        v_existing.user_id,
        v_existing.role,
        v_existing.status;

      return;
    end if;


    raise exception
      'User already has an organization membership; use the role/status workflows'
      using errcode = '23505';
  end if;


  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    created_by_user_id
  )
  values (
    target_organization_id,
    target_user_id,
    v_role,
    'active',
    auth.uid()
  )
  returning *
  into v_existing;


  return query
  select
    v_existing.id,
    v_existing.organization_id,
    v_existing.user_id,
    v_existing.role,
    v_existing.status;

end;
$function$;


-- ============================================================================
-- Change organisation member role
-- ============================================================================

create or replace function public.set_organization_member_role(
  target_organization_id uuid,
  target_user_id uuid,
  new_role_value text
)
returns table (
  membership_id uuid,
  organization_id uuid,
  user_id uuid,
  member_role text,
  member_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org_status text;
  v_new_role text := lower(nullif(trim(new_role_value), ''));

  v_membership public.organization_memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if v_new_role not in ('owner', 'manager', 'staff') then
    raise exception 'Organization role must be owner, manager or staff'
      using errcode = '23514';
  end if;


  -- Organisation first: common membership lock boundary.

  select o.status
  into v_org_status
  from public.organizations as o
  where o.id = target_organization_id
  for update;

  if not found then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;


  if not (
    private.is_platform_admin()
    or private.has_organization_role(
      target_organization_id,
      array['owner']::text[]
    )
  ) then
    raise exception
      'Only an organization owner or platform admin may manage membership'
      using errcode = '42501';
  end if;


  if v_org_status <> 'active'
     and not private.is_platform_admin()
  then
    raise exception
      'Membership cannot be changed while the organization is not active'
      using errcode = '23514';
  end if;


  select om.*
  into v_membership
  from public.organization_memberships as om
  where om.organization_id = target_organization_id
    and om.user_id = target_user_id
  for update;

  if not found then
    raise exception 'Organization membership not found'
      using errcode = 'P0002';
  end if;


  if v_membership.role = v_new_role then
    return query
    select
      v_membership.id,
      v_membership.organization_id,
      v_membership.user_id,
      v_membership.role,
      v_membership.status;

    return;
  end if;


  -- Friendly workflow error before the lower-level trigger also enforces it.

  if v_membership.role = 'owner'
     and v_membership.status = 'active'
     and v_new_role <> 'owner'
     and not exists (
       select 1
       from public.organization_memberships as other_owner
       where other_owner.organization_id = target_organization_id
         and other_owner.user_id <> target_user_id
         and other_owner.role = 'owner'
         and other_owner.status = 'active'
     )
  then
    raise exception
      'The final active owner cannot be demoted'
      using errcode = '23514';
  end if;


  update public.organization_memberships as om
  set role = v_new_role
  where om.id = v_membership.id
  returning *
  into v_membership;


  return query
  select
    v_membership.id,
    v_membership.organization_id,
    v_membership.user_id,
    v_membership.role,
    v_membership.status;

end;
$function$;


-- ============================================================================
-- Suspend / reactivate organisation member
-- ============================================================================

create or replace function public.set_organization_member_status(
  target_organization_id uuid,
  target_user_id uuid,
  new_status_value text
)
returns table (
  membership_id uuid,
  organization_id uuid,
  user_id uuid,
  member_role text,
  member_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org_status text;
  v_new_status text := lower(nullif(trim(new_status_value), ''));

  v_membership public.organization_memberships%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if v_new_status not in ('active', 'suspended') then
    raise exception 'Membership status must be active or suspended'
      using errcode = '23514';
  end if;


  select o.status
  into v_org_status
  from public.organizations as o
  where o.id = target_organization_id
  for update;

  if not found then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;


  if not (
    private.is_platform_admin()
    or private.has_organization_role(
      target_organization_id,
      array['owner']::text[]
    )
  ) then
    raise exception
      'Only an organization owner or platform admin may manage membership'
      using errcode = '42501';
  end if;


  if v_org_status <> 'active'
     and not private.is_platform_admin()
  then
    raise exception
      'Membership cannot be changed while the organization is not active'
      using errcode = '23514';
  end if;


  select om.*
  into v_membership
  from public.organization_memberships as om
  where om.organization_id = target_organization_id
    and om.user_id = target_user_id
  for update;

  if not found then
    raise exception 'Organization membership not found'
      using errcode = 'P0002';
  end if;


  if v_membership.status = v_new_status then
    return query
    select
      v_membership.id,
      v_membership.organization_id,
      v_membership.user_id,
      v_membership.role,
      v_membership.status;

    return;
  end if;


  if v_membership.role = 'owner'
     and v_membership.status = 'active'
     and v_new_status = 'suspended'
     and not exists (
       select 1
       from public.organization_memberships as other_owner
       where other_owner.organization_id = target_organization_id
         and other_owner.user_id <> target_user_id
         and other_owner.role = 'owner'
         and other_owner.status = 'active'
     )
  then
    raise exception
      'The final active owner cannot be suspended'
      using errcode = '23514';
  end if;


  update public.organization_memberships as om
  set status = v_new_status
  where om.id = v_membership.id
  returning *
  into v_membership;


  return query
  select
    v_membership.id,
    v_membership.organization_id,
    v_membership.user_id,
    v_membership.role,
    v_membership.status;

end;
$function$;


-- ============================================================================
-- Create next organisation commercial-term version
--
-- Platform-admin only.
--
-- Existing open-ended term:
--
--     v1 [effective_from, infinity)
--
-- becomes:
--
--     v1 [effective_from, new_effective_from)
--     v2 [new_effective_from, infinity)
--
-- Existing booking validation prevents closing an earlier term so far back
-- that a historical booking would cease to fall within its original term.
-- ============================================================================

create or replace function public.create_organization_commercial_term_version(
  commercial_term_id uuid,
  target_organization_id uuid,
  effective_from_value timestamptz,
  commission_bps_value integer,
  deposit_bps_value integer,
  final_balance_due_days_before_event_value integer,
  terms_jsonb_value jsonb default '{}'::jsonb
)
returns table (
  created_commercial_term_id uuid,
  organization_id uuid,
  version_number integer,
  commission_bps integer,
  deposit_bps integer,
  final_balance_due_days_before_event integer,
  effective_from timestamptz,
  effective_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_terms_jsonb jsonb :=
    coalesce(terms_jsonb_value, '{}'::jsonb);

  v_existing public.organization_commercial_term_versions%rowtype;
  v_open public.organization_commercial_term_versions%rowtype;

  v_next_version integer;
  v_latest_effective_from timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;


  if not private.is_platform_admin() then
    raise exception
      'Only a platform admin may create organization commercial terms'
      using errcode = '42501';
  end if;


  if commercial_term_id is null
     or target_organization_id is null
     or effective_from_value is null
  then
    raise exception
      'Commercial term ID, organization ID and effective start are required'
      using errcode = '23514';
  end if;


  if commission_bps_value is null
     or commission_bps_value not between 0 and 10000
  then
    raise exception 'Commission basis points must be between 0 and 10000'
      using errcode = '23514';
  end if;


  if deposit_bps_value is null
     or deposit_bps_value not between 1 and 9999
  then
    raise exception 'Deposit basis points must be between 1 and 9999'
      using errcode = '23514';
  end if;


  if final_balance_due_days_before_event_value is null
     or final_balance_due_days_before_event_value not between 0 and 3650
  then
    raise exception
      'Final-balance due days must be between 0 and 3650'
      using errcode = '23514';
  end if;


  if jsonb_typeof(v_terms_jsonb) <> 'object' then
    raise exception 'Commercial terms JSON must be an object'
      using errcode = '23514';
  end if;


  -- Serialize commercial governance for the organisation.

  perform o.id
  from public.organizations as o
  where o.id = target_organization_id
  for update;

  if not found then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;


  -- --------------------------------------------------------------------------
  -- Exact UUID replay.
  --
  -- effective_until is deliberately not compared because a once-open term may
  -- legitimately have been closed later by the next term version.
  -- --------------------------------------------------------------------------

  select t.*
  into v_existing
  from public.organization_commercial_term_versions as t
  where t.id = commercial_term_id
  for update;

  if found then

    if v_existing.organization_id
         is distinct from target_organization_id
       or v_existing.effective_from
         is distinct from effective_from_value
       or v_existing.commission_bps
         is distinct from commission_bps_value
       or v_existing.deposit_bps
         is distinct from deposit_bps_value
       or v_existing.final_balance_due_days_before_event
         is distinct from final_balance_due_days_before_event_value
       or v_existing.terms_jsonb
         is distinct from v_terms_jsonb
    then
      raise exception
        'Commercial term ID has already been used with different term data'
        using errcode = '23505';
    end if;


    return query
    select
      v_existing.id,
      v_existing.organization_id,
      v_existing.version_number,
      v_existing.commission_bps,
      v_existing.deposit_bps,
      v_existing.final_balance_due_days_before_event,
      v_existing.effective_from,
      v_existing.effective_until;

    return;
  end if;


  -- Lock all existing versions in deterministic version order.

  perform t.id
  from public.organization_commercial_term_versions as t
  where t.organization_id = target_organization_id
  order by t.version_number
  for update;


  select
    coalesce(max(t.version_number), 0) + 1,
    max(t.effective_from)
  into
    v_next_version,
    v_latest_effective_from
  from public.organization_commercial_term_versions as t
  where t.organization_id = target_organization_id;


  if v_latest_effective_from is not null
     and effective_from_value <= v_latest_effective_from
  then
    raise exception
      'New commercial terms must start after the latest existing term version'
      using errcode = '23514';
  end if;


  select t.*
  into v_open
  from public.organization_commercial_term_versions as t
  where t.organization_id = target_organization_id
    and t.effective_until is null
  for update;


  if found then
    if effective_from_value <= v_open.effective_from then
      raise exception
        'New commercial terms must begin after the current open term'
        using errcode = '23514';
    end if;


    update public.organization_commercial_term_versions as t
    set effective_until = effective_from_value
    where t.id = v_open.id;
  end if;


  insert into public.organization_commercial_term_versions (
    id,
    organization_id,
    version_number,
    commission_bps,
    deposit_bps,
    final_balance_due_days_before_event,
    effective_from,
    effective_until,
    terms_jsonb,
    created_by_user_id
  )
  values (
    commercial_term_id,
    target_organization_id,
    v_next_version,
    commission_bps_value,
    deposit_bps_value,
    final_balance_due_days_before_event_value,
    effective_from_value,
    null,
    v_terms_jsonb,
    auth.uid()
  )
  returning *
  into v_existing;


  return query
  select
    v_existing.id,
    v_existing.organization_id,
    v_existing.version_number,
    v_existing.commission_bps,
    v_existing.deposit_bps,
    v_existing.final_balance_due_days_before_event,
    v_existing.effective_from,
    v_existing.effective_until;

end;
$function$;


-- ============================================================================
-- Function privileges
-- ============================================================================

revoke all
on function public.create_organization(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
from public, anon, authenticated;


revoke all
on function public.add_organization_member(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;


revoke all
on function public.set_organization_member_role(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;


revoke all
on function public.set_organization_member_status(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;


revoke all
on function public.create_organization_commercial_term_version(
  uuid,
  uuid,
  timestamptz,
  integer,
  integer,
  integer,
  jsonb
)
from public, anon, authenticated;


grant execute
on function public.create_organization(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
to authenticated;


grant execute
on function public.add_organization_member(
  uuid,
  uuid,
  text
)
to authenticated;


grant execute
on function public.set_organization_member_role(
  uuid,
  uuid,
  text
)
to authenticated;


grant execute
on function public.set_organization_member_status(
  uuid,
  uuid,
  text
)
to authenticated;


grant execute
on function public.create_organization_commercial_term_version(
  uuid,
  uuid,
  timestamptz,
  integer,
  integer,
  integer,
  jsonb
)
to authenticated;


-- ============================================================================
-- Documentation
-- ============================================================================

comment on function public.create_organization(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Creates an organization for the authenticated user and atomically assigns that user as its first active owner. Commercial terms remain platform-controlled.';


comment on function public.add_organization_member(
  uuid,
  uuid,
  text
) is
  'Adds an existing user to an organization. Restricted to active organization owners and platform admins.';


comment on function public.set_organization_member_role(
  uuid,
  uuid,
  text
) is
  'Changes an organization membership role while preventing loss of the final active owner. Restricted to organization owners and platform admins.';


comment on function public.set_organization_member_status(
  uuid,
  uuid,
  text
) is
  'Suspends or reactivates an organization membership while preventing suspension of the final active owner. Restricted to organization owners and platform admins.';


comment on function public.create_organization_commercial_term_version(
  uuid,
  uuid,
  timestamptz,
  integer,
  integer,
  integer,
  jsonb
) is
  'Platform-admin-only append workflow for immutable organization commercial terms. Closes the current open version at the new version start and preserves booking-time history.';
