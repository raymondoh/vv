-- VV Production Database
-- Migration 0003: identity and platform roles

-- ===========================================================================
-- user_profiles
-- ===========================================================================
--
-- Supabase Auth (auth.users) remains the identity provider.
-- public.user_profiles is VV's application-facing 1:1 profile record.
--
-- The profile deliberately does not duplicate authentication credentials,
-- verified email state, password information, OAuth identities, etc.

create table public.user_profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,

  display_name text null,
  phone_e164 text null,
  avatar_path text null,

  locale text not null default 'en-GB',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_profiles_display_name_check
    check (
      display_name is null
      or char_length(trim(display_name)) between 1 and 120
    ),

  constraint user_profiles_phone_e164_check
    check (
      phone_e164 is null
      or phone_e164 ~ '^\+[1-9][0-9]{1,14}$'
    ),

  constraint user_profiles_locale_check
    check (
      char_length(locale) between 2 and 35
    )
);

comment on table public.user_profiles is
  'VV application-facing 1:1 profile for a Supabase Auth user.';

comment on column public.user_profiles.id is
  'Exactly the corresponding auth.users.id; never independently generated.';

comment on column public.user_profiles.phone_e164 is
  'Optional phone number in E.164 form, for example +447700900000.';


-- PostgreSQL owns updated_at.

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function private.set_updated_at();


-- Enable RLS immediately.
-- Policies and browser-facing grants are intentionally added later.

alter table public.user_profiles enable row level security;


-- ===========================================================================
-- Automatic profile creation
-- ===========================================================================
--
-- Creating an Auth user must create the corresponding VV profile.
--
-- We deliberately insert only the immutable identity link here. Application
-- fields such as display_name are managed afterwards rather than trusting
-- arbitrary signup metadata as domain truth.

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id)
  values (new.id);

  return new;
end;
$$;

comment on function private.handle_new_auth_user() is
  'Creates the VV user_profiles row after creation of a Supabase Auth user.';

revoke all on function private.handle_new_auth_user()
  from public, anon, authenticated;

-- Supabase Auth is the only non-owner role that needs access to this
-- internal trigger function.

grant usage on schema private to supabase_auth_admin;

grant execute on function private.handle_new_auth_user()
  to supabase_auth_admin;


create trigger vv_on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_new_auth_user();


-- ===========================================================================
-- platform_role_assignments
-- ===========================================================================
--
-- Platform administration is separate from organisation membership.
--
-- A VV user can therefore simultaneously be:
--
--   customer
--   organisation member
--   platform administrator
--
-- without forcing those concepts into one global user role.

create table public.platform_role_assignments (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.user_profiles(id)
    on delete cascade,

  role text not null,

  assigned_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  assigned_at timestamptz not null default now(),
  revoked_at timestamptz null,

  constraint platform_role_assignments_role_check
    check (
      role in ('platform_admin')
    ),

  constraint platform_role_assignments_revocation_check
    check (
      revoked_at is null
      or revoked_at >= assigned_at
    )
);

comment on table public.platform_role_assignments is
  'Historical assignments of VV platform-level roles.';

comment on column public.platform_role_assignments.role is
  'Platform role only; organisation roles belong in organization_memberships.';


-- Prevent a user holding the same active platform role twice while retaining
-- historical revoked assignments.

create unique index platform_role_assignments_active_role_uidx
  on public.platform_role_assignments (user_id, role)
  where revoked_at is null;


-- Useful for retrieving both active and historical assignments for one user.

create index platform_role_assignments_user_id_idx
  on public.platform_role_assignments (user_id);


alter table public.platform_role_assignments enable row level security;