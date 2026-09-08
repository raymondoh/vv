-- VV Production Database
-- Migration 0016: RLS - identity and organizations
--
-- First browser-facing row-level security policies.
--
-- Covers:
--   user_profiles
--   platform_role_assignments
--   organizations
--   organization_memberships
--   organization_commercial_term_versions
--
-- Principles:
--
--   * anon receives no access to these sensitive tables
--   * authenticated users receive only the minimum required privileges
--   * RLS determines which rows an authenticated session may access
--   * sensitive relationship/commercial mutations remain server-side
--   * column-level grants prevent ordinary organization profile editing from
--     modifying lifecycle/identity columns


-- ===========================================================================
-- user_profiles
-- ===========================================================================
--
-- A user may:
--   read their own profile
--   update ordinary editable fields on their own profile
--
-- A platform admin may read profiles for administrative purposes.
--
-- Profile creation remains owned by the auth.users -> user_profiles trigger.
-- Browser sessions cannot INSERT or DELETE profiles.

revoke all on table public.user_profiles
  from anon, authenticated;

grant select on table public.user_profiles
  to authenticated;

grant update (
  display_name,
  phone_e164,
  avatar_path,
  locale
)
on public.user_profiles
to authenticated;


create policy user_profiles_select_self_or_platform_admin
on public.user_profiles
for select
to authenticated
using (
  id = auth.uid()
  or private.is_platform_admin()
);


create policy user_profiles_update_self
on public.user_profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);


-- ===========================================================================
-- platform_role_assignments
-- ===========================================================================
--
-- Platform role assignments are sensitive authorization data.
--
-- Only platform admins may read them directly.
-- Creation/revocation will later occur through trusted server operations.

revoke all on table public.platform_role_assignments
  from anon, authenticated;

grant select on table public.platform_role_assignments
  to authenticated;


create policy platform_role_assignments_select_platform_admin
on public.platform_role_assignments
for select
to authenticated
using (
  private.is_platform_admin()
);


-- ===========================================================================
-- organizations
-- ===========================================================================
--
-- Active organization members may read their organization's business record.
-- Platform admins may read all organizations.
--
-- Ordinary profile fields may be edited by:
--   owner
--   manager
--   platform admin
--
-- Staff cannot administer the organization.
--
-- Sensitive lifecycle/identity fields such as:
--   id
--   status
--   created_by_user_id
--   created_at
--   updated_at
--
-- are not directly writable from authenticated browser sessions.

revoke all on table public.organizations
  from anon, authenticated;

grant select on table public.organizations
  to authenticated;

grant update (
  legal_name,
  display_name,
  slug,
  company_number,
  tax_registration_number,
  country_code,
  contact_email,
  contact_phone
)
on public.organizations
to authenticated;


create policy organizations_select_member_or_platform_admin
on public.organizations
for select
to authenticated
using (
  private.is_platform_admin()
  or private.is_active_organization_member(id)
);


create policy organizations_update_administrator
on public.organizations
for update
to authenticated
using (
  private.can_administer_organization(id)
)
with check (
  private.can_administer_organization(id)
);


-- ===========================================================================
-- organization_memberships
-- ===========================================================================
--
-- An active member can see the membership roster of their organization.
--
-- A suspended user may still read their own membership row so the application
-- can truthfully explain their current access state.
--
-- Platform admins may inspect all memberships.
--
-- Membership creation, role changes, suspension and removal remain trusted
-- server-side operations. Direct browser mutation is intentionally denied.

revoke all on table public.organization_memberships
  from anon, authenticated;

grant select on table public.organization_memberships
  to authenticated;


create policy organization_memberships_select_allowed
on public.organization_memberships
for select
to authenticated
using (
  private.is_platform_admin()
  or user_id = auth.uid()
  or private.is_active_organization_member(organization_id)
);


-- ===========================================================================
-- organization_commercial_term_versions
-- ===========================================================================
--
-- Commission terms are commercially sensitive.
--
-- Visible to:
--   owner
--   manager
--   platform admin
--
-- Staff does not receive the raw organization commercial-term configuration.
--
-- Creating/closing/versioning terms is a trusted commercial operation and is
-- therefore not directly writable by browser sessions.

revoke all on table public.organization_commercial_term_versions
  from anon, authenticated;

grant select on table public.organization_commercial_term_versions
  to authenticated;


create policy organization_commercial_terms_select_administrator
on public.organization_commercial_term_versions
for select
to authenticated
using (
  private.can_administer_organization(organization_id)
);