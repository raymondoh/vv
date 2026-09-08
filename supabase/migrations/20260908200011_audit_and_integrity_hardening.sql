-- VV Production Database
-- Migration 0014: audit and integrity hardening
--
-- Introduces:
--   private.audit_events
--
-- Hardens cross-table invariants established by earlier migrations.
--
-- Important principle:
--
--   If a relationship represents historical or commercial identity,
--   normal UPDATE operations must not be able to re-parent that row and
--   invalidate relationships which were valid when originally created.


-- ===========================================================================
-- private.audit_events
-- ===========================================================================
--
-- Internal append-only operational/business audit ledger.
--
-- This deliberately lives in the private schema. It is not browser-facing
-- application data and will later be written by trusted transaction functions.
--
-- Actor/entity UUIDs deliberately do not use foreign keys. Audit history must
-- survive deletion/anonymisation of the corresponding application records.

create table private.audit_events (
  id bigint generated always as identity primary key,

  actor_type text not null default 'user',
  actor_user_id uuid null,

  organization_id uuid null,

  action text not null,

  entity_type text not null,
  entity_id uuid null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint audit_events_actor_type_check
    check (
      actor_type in (
        'user',
        'system',
        'provider'
      )
    ),

  constraint audit_events_actor_check
    check (
      (
        actor_type = 'user'
        and actor_user_id is not null
      )
      or
      (
        actor_type in ('system', 'provider')
      )
    ),

  constraint audit_events_action_check
    check (
      char_length(trim(action)) between 1 and 120
    ),

  constraint audit_events_entity_type_check
    check (
      char_length(trim(entity_type)) between 1 and 120
    ),

  constraint audit_events_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
    )
);

comment on table private.audit_events is
  'Private append-only audit ledger for trusted VV business and operational actions.';

comment on column private.audit_events.actor_user_id is
  'Historical UUID only; intentionally not a foreign key so audit history survives account deletion.';

comment on column private.audit_events.organization_id is
  'Historical organisation UUID only; intentionally not a foreign key.';


create index audit_events_entity_created_idx
  on private.audit_events (
    entity_type,
    entity_id,
    created_at desc
  );

create index audit_events_actor_created_idx
  on private.audit_events (
    actor_user_id,
    created_at desc
  )
  where actor_user_id is not null;

create index audit_events_organization_created_idx
  on private.audit_events (
    organization_id,
    created_at desc
  )
  where organization_id is not null;

create index audit_events_created_idx
  on private.audit_events (
    created_at desc
  );


-- Existing helper from booking_core:
-- private.prevent_append_only_mutation()

create trigger audit_events_append_only
before update or delete
on private.audit_events
for each row
execute function private.prevent_append_only_mutation();


-- ===========================================================================
-- Generic immutable-column protection
-- ===========================================================================
--
-- Used where a row itself remains editable but particular identity columns
-- must never be re-parented.
--
-- Trigger arguments are column names.

create or replace function private.prevent_column_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  column_name text;
begin
  foreach column_name in array tg_argv
  loop
    if (to_jsonb(new) -> column_name)
       is distinct from
       (to_jsonb(old) -> column_name)
    then
      raise exception
        'Column %.%.% is immutable',
        tg_table_schema,
        tg_table_name,
        column_name
        using errcode = '55000';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.prevent_column_changes()
  from public, anon, authenticated;


-- ===========================================================================
-- Organisation membership identity
-- ===========================================================================
--
-- Role/status may change.
-- The membership itself may not be moved to another user or organisation.

create trigger protect_organization_membership_identity
before update on public.organization_memberships
for each row
execute function private.prevent_column_changes(
  'organization_id',
  'user_id',
  'joined_at',
  'created_at'
);


-- ===========================================================================
-- Catalogue hierarchy identity
-- ===========================================================================
--
-- Moving a venue to another organisation, a space to another venue, or a
-- layout to another space would invalidate media ownership, bookings and
-- other previously validated relationships.
--
-- Such a business migration, if ever required, must be an explicit trusted
-- operation rather than an ordinary row UPDATE.

create trigger protect_venue_organization
before update on public.venues
for each row
execute function private.prevent_column_changes(
  'organization_id'
);


create trigger protect_space_venue
before update on public.spaces
for each row
execute function private.prevent_column_changes(
  'venue_id'
);


create trigger protect_space_layout_space
before update on public.space_layouts
for each row
execute function private.prevent_column_changes(
  'space_id'
);


-- ===========================================================================
-- Media tenant identity
-- ===========================================================================
--
-- The owning organisation of a stored media asset is immutable.
--
-- Combined with the immutable catalogue hierarchy, this means a valid media
-- attachment cannot later become cross-organisation merely because a parent
-- record was re-parented.

create trigger protect_media_asset_organization
before update on public.media_assets
for each row
execute function private.prevent_column_changes(
  'organization_id'
);


-- ===========================================================================
-- Commercial-term version hardening
-- ===========================================================================
--
-- A version's commercial content is historical truth and may not be rewritten.
--
-- effective_until is the one intentional exception because an initially
-- open-ended version may later be closed when the next version begins.
--
-- Example:
--
--   version 1: 2026-01-01 -> infinity
--
-- becomes:
--
--   version 1: 2026-01-01 -> 2026-07-01
--   version 2: 2026-07-01 -> infinity
--
-- Existing bookings referencing version 1 must still fall inside its revised
-- effective period.

create trigger protect_commercial_term_identity
before update on public.organization_commercial_term_versions
for each row
execute function private.prevent_column_changes(
  'organization_id',
  'version_number',
  'commission_bps',
  'effective_from',
  'terms_jsonb',
  'created_at'
);


create or replace function private.validate_commercial_term_period_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposed_effective_during tstzrange;
begin
  if new.effective_until is not distinct from old.effective_until then
    return new;
  end if;

  -- BEFORE trigger: calculate directly instead of relying on the generated
  -- effective_during column.
  proposed_effective_during :=
    tstzrange(
      new.effective_from,
      new.effective_until,
      '[)'
    );

  if exists (
    select 1
    from public.bookings as b
    where b.commercial_term_version_id = new.id
      and not (proposed_effective_during @> b.submitted_at)
  ) then
    raise exception
      'Commercial term period cannot exclude an existing booking'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_commercial_term_period_change()
  from public, anon, authenticated;


create trigger validate_commercial_term_period_change
before update of effective_until
on public.organization_commercial_term_versions
for each row
execute function private.validate_commercial_term_period_change();


-- ===========================================================================
-- Rate-plan hierarchy and validity hardening
-- ===========================================================================
--
-- A rate plan cannot move to another space.
--
-- Its validity dates may legitimately change for future pricing, but they may
-- not be shrunk so far that an already-created rate override falls outside the
-- parent plan.

create trigger protect_space_rate_plan_space
before update on public.space_rate_plans
for each row
execute function private.prevent_column_changes(
  'space_id'
);


create or replace function private.validate_rate_plan_period_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposed_valid_during daterange;
begin
  if new.valid_from is not distinct from old.valid_from
     and new.valid_until is not distinct from old.valid_until
  then
    return new;
  end if;

  -- BEFORE trigger: calculate directly rather than reading the generated
  -- valid_during column.
  proposed_valid_during :=
    daterange(
      new.valid_from,
      new.valid_until,
      '[)'
    );

  if exists (
    select 1
    from public.rate_overrides as ro
    where ro.rate_plan_id = new.id
      and not (ro.override_during <@ proposed_valid_during)
  ) then
    raise exception
      'Rate-plan validity cannot exclude an existing rate override'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_rate_plan_period_change()
  from public, anon, authenticated;


create trigger validate_rate_plan_period_change
before update of
  valid_from,
  valid_until
on public.space_rate_plans
for each row
execute function private.validate_rate_plan_period_change();


-- ===========================================================================
-- Booking commercial identity
-- ===========================================================================
--
-- Lifecycle state, payment state, event timing and financial aggregates may be
-- changed by later trusted workflow operations.
--
-- The booking's fundamental commercial identity and historical snapshots may
-- not be rewritten after creation.

create trigger protect_booking_commercial_identity
before update on public.bookings
for each row
execute function private.prevent_column_changes(
  'booking_reference',
  'organization_id',
  'venue_id',
  'currency_code',
  'commercial_term_version_id',
  'commission_bps',
  'customer_snapshot',
  'venue_snapshot',
  'commercial_terms_snapshot',
  'booking_request_snapshot',
  'submitted_at',
  'created_at'
);


-- ===========================================================================
-- Booking-item identity
-- ===========================================================================
--
-- Moving an existing booking item to another booking would invalidate price
-- lines and other relationships validated at creation time.
--
-- Space identity is also immutable. A changed selection should be handled by a
-- deliberate booking workflow rather than re-parenting the existing row.

create trigger protect_booking_item_core_identity
before update on public.booking_items
for each row
execute function private.prevent_column_changes(
  'booking_id',
  'space_id',
  'created_at'
);


-- ===========================================================================
-- Booking customer identity protection
-- ===========================================================================
--
-- A booking's linked user may legitimately:
--
--   NULL -> user UUID
--       when a previously guest/unlinked booking is associated with an account
--
--   user UUID -> NULL
--       when an account is deleted and the FK uses ON DELETE SET NULL
--
-- But one established customer account must not silently become a different
-- customer account.

create or replace function private.protect_booking_customer_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.customer_user_id is not null
     and new.customer_user_id is not null
     and new.customer_user_id is distinct from old.customer_user_id
  then
    raise exception
      'Booking customer cannot be reassigned to a different user'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_booking_customer_reassignment()
  from public, anon, authenticated;


create trigger protect_booking_customer_reassignment
before update of customer_user_id
on public.bookings
for each row
execute function private.protect_booking_customer_reassignment();


-- ===========================================================================
-- Organisation payment-account identity
-- ===========================================================================
--
-- Transfers already validate that the payout account belongs to the booking's
-- organisation. Therefore the account itself must not later be moved to a
-- different organisation/provider.
--
-- provider_account_id may transition from NULL -> provider ID during
-- onboarding, but once populated it cannot be replaced.

create trigger protect_organization_payment_account_identity
before update on public.organization_payment_accounts
for each row
execute function private.prevent_column_changes(
  'organization_id',
  'provider',
  'created_at'
);


create or replace function private.protect_provider_account_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.provider_account_id is not null
     and new.provider_account_id is distinct from old.provider_account_id
  then
    raise exception
      'Provider account ID cannot be replaced once assigned'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_provider_account_id()
  from public, anon, authenticated;


create trigger protect_provider_account_id
before update of provider_account_id
on public.organization_payment_accounts
for each row
execute function private.protect_provider_account_id();