-- VV Production Database
-- Migration 0001: extensions and internal schemas

-- Required later for GiST exclusion constraints that combine UUID equality
-- with PostgreSQL range overlap operators.
create extension if not exists btree_gist
with schema extensions;

-- Internal database objects that must never form part of VV's public API.
create schema if not exists private;

-- Do not grant general database users access to the private schema.
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;