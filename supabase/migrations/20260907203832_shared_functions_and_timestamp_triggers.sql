-- VV Production Database
-- Migration 0002: shared functions and timestamp infrastructure

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
--
-- Mutable VV tables use:
--
--   created_at timestamptz not null default now()
--   updated_at timestamptz not null default now()
--
-- PostgreSQL, rather than application code, is responsible for refreshing
-- updated_at whenever a row changes.
--
-- Keeping this helper in the private schema prevents it becoming part of the
-- public application API.

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'VV internal trigger function that refreshes updated_at on mutable rows.';

revoke all on function private.set_updated_at() from public;
revoke all on function private.set_updated_at() from anon;
revoke all on function private.set_updated_at() from authenticated;
