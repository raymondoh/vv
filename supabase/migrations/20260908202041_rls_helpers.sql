-- VV Production Database
-- Migration 0015: RLS authorization helpers
--
-- These SECURITY DEFINER helpers provide a small, reusable authorization
-- vocabulary for later row-level security policies.
--
-- They deliberately derive the current user from auth.uid().
-- Browser callers do not provide a user_id argument.
--
-- No RLS policies are created in this migration.


-- ===========================================================================
-- Private-schema access for authenticated callers
-- ===========================================================================
--
-- USAGE permits authenticated sessions to resolve explicitly granted helper
-- functions in the private schema.
--
-- It does NOT grant access to private tables or to other private functions.

grant usage on schema private to authenticated;


-- ===========================================================================
-- Platform administrator
-- ===========================================================================

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_role_assignments as pra
    where pra.user_id = auth.uid()
      and pra.role = 'platform_admin'
      and pra.revoked_at is null
  );
$$;

comment on function private.is_platform_admin() is
  'Returns true when the current authenticated user has an active platform_admin assignment.';

revoke all on function private.is_platform_admin()
  from public, anon, authenticated;

grant execute on function private.is_platform_admin()
  to authenticated;


-- ===========================================================================
-- Organisation membership / role helpers
-- ===========================================================================

create or replace function private.has_organization_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = any(allowed_roles)
  );
$$;

comment on function private.has_organization_role(uuid, text[]) is
  'Returns true when the current user has an active membership in the organization with one of the supplied roles.';

revoke all on function private.has_organization_role(uuid, text[])
  from public, anon, authenticated;

grant execute on function private.has_organization_role(uuid, text[])
  to authenticated;


create or replace function private.is_active_organization_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

comment on function private.is_active_organization_member(uuid) is
  'Returns true only for an actual active membership; platform admins are not implicitly treated as organization members.';

revoke all on function private.is_active_organization_member(uuid)
  from public, anon, authenticated;

grant execute on function private.is_active_organization_member(uuid)
  to authenticated;


-- Operational access:
--   platform admin
--   owner
--   manager
--   staff

create or replace function private.can_operate_organization(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_platform_admin()
    or private.has_organization_role(
      target_organization_id,
      array['owner', 'manager', 'staff']::text[]
    );
$$;

comment on function private.can_operate_organization(uuid) is
  'Returns true for platform admins or active owner/manager/staff members of an organization.';

revoke all on function private.can_operate_organization(uuid)
  from public, anon, authenticated;

grant execute on function private.can_operate_organization(uuid)
  to authenticated;


-- Administrative organization access:
--   platform admin
--   owner
--   manager
--
-- Staff is deliberately excluded.

create or replace function private.can_administer_organization(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_platform_admin()
    or private.has_organization_role(
      target_organization_id,
      array['owner', 'manager']::text[]
    );
$$;

comment on function private.can_administer_organization(uuid) is
  'Returns true for platform admins or active owner/manager members of an organization.';

revoke all on function private.can_administer_organization(uuid)
  from public, anon, authenticated;

grant execute on function private.can_administer_organization(uuid)
  to authenticated;


-- ===========================================================================
-- Catalogue hierarchy helpers
-- ===========================================================================

create or replace function private.can_operate_venue(
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
      and private.can_operate_organization(v.organization_id)
  );
$$;

comment on function private.can_operate_venue(uuid) is
  'Returns true when the current user can operationally access the organization owning the venue.';

revoke all on function private.can_operate_venue(uuid)
  from public, anon, authenticated;

grant execute on function private.can_operate_venue(uuid)
  to authenticated;


create or replace function private.can_operate_space(
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
      and private.can_operate_organization(v.organization_id)
  );
$$;

comment on function private.can_operate_space(uuid) is
  'Returns true when the current user can operationally access the organization owning the space.';

revoke all on function private.can_operate_space(uuid)
  from public, anon, authenticated;

grant execute on function private.can_operate_space(uuid)
  to authenticated;


create or replace function private.can_operate_space_layout(
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
      and private.can_operate_organization(v.organization_id)
  );
$$;

comment on function private.can_operate_space_layout(uuid) is
  'Returns true when the current user can operationally access the organization owning the layout.';

revoke all on function private.can_operate_space_layout(uuid)
  from public, anon, authenticated;

grant execute on function private.can_operate_space_layout(uuid)
  to authenticated;


-- ===========================================================================
-- Booking helpers
-- ===========================================================================

create or replace function private.is_booking_customer(
  target_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings as b
    where b.id = target_booking_id
      and b.customer_user_id = auth.uid()
  );
$$;

comment on function private.is_booking_customer(uuid) is
  'Returns true when the current authenticated user is the customer linked to the booking.';

revoke all on function private.is_booking_customer(uuid)
  from public, anon, authenticated;

grant execute on function private.is_booking_customer(uuid)
  to authenticated;


create or replace function private.can_operate_booking(
  target_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings as b
    where b.id = target_booking_id
      and private.can_operate_organization(b.organization_id)
  );
$$;

comment on function private.can_operate_booking(uuid) is
  'Returns true for platform admins or active organization staff responsible for the booking.';

revoke all on function private.can_operate_booking(uuid)
  from public, anon, authenticated;

grant execute on function private.can_operate_booking(uuid)
  to authenticated;


-- ===========================================================================
-- Event planner ownership
-- ===========================================================================

create or replace function private.is_event_plan_owner(
  target_event_plan_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_plans as ep
    where ep.id = target_event_plan_id
      and ep.customer_user_id = auth.uid()
  );
$$;

comment on function private.is_event_plan_owner(uuid) is
  'Returns true when the current user owns the customer event plan.';

revoke all on function private.is_event_plan_owner(uuid)
  from public, anon, authenticated;

grant execute on function private.is_event_plan_owner(uuid)
  to authenticated;


-- ===========================================================================
-- Live walkthrough helpers
-- ===========================================================================

create or replace function private.can_operate_live_tour_slot(
  target_live_tour_slot_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.live_tour_slots as lts
    join public.venues as v
      on v.id = lts.venue_id
    where lts.id = target_live_tour_slot_id
      and private.can_operate_organization(v.organization_id)
  );
$$;

comment on function private.can_operate_live_tour_slot(uuid) is
  'Returns true for platform admins or active organization staff responsible for the live-tour slot.';

revoke all on function private.can_operate_live_tour_slot(uuid)
  from public, anon, authenticated;

grant execute on function private.can_operate_live_tour_slot(uuid)
  to authenticated;


create or replace function private.is_live_tour_appointment_customer(
  target_live_tour_appointment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.live_tour_appointments as lta
    where lta.id = target_live_tour_appointment_id
      and lta.customer_user_id = auth.uid()
  );
$$;

comment on function private.is_live_tour_appointment_customer(uuid) is
  'Returns true when the current user is the customer linked to the live-tour appointment.';

revoke all on function private.is_live_tour_appointment_customer(uuid)
  from public, anon, authenticated;

grant execute on function private.is_live_tour_appointment_customer(uuid)
  to authenticated;