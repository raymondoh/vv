-- VV Production Database
-- Migration 0018: RLS - pricing and availability
--
-- Covers:
--   space_rate_plans
--   rate_overrides
--   space_booking_rules
--   venue_blackouts
--   space_blackouts
--
-- Introduces safe public catalogue views:
--   catalog_space_rate_plans
--   catalog_rate_overrides
--   catalog_space_booking_rules
--   catalog_venue_blackouts
--   catalog_space_blackouts
--
-- Principles:
--
--   * customers can see pricing needed to browse/book
--   * customers can see unavailable periods
--   * internal blackout reasons and creator identities stay private
--   * operators can manage pricing configuration for their organization
--   * pricing rows are not hard-deleted through ordinary browser access
--   * blackout mutation remains server-side because it participates in
--     reservation/inventory correctness


-- ===========================================================================
-- Authorization helper: rate-plan ownership
-- ===========================================================================

create or replace function private.can_operate_rate_plan(
  target_rate_plan_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.space_rate_plans as srp
    join public.spaces as s
      on s.id = srp.space_id
    join public.venues as v
      on v.id = s.venue_id
    where srp.id = target_rate_plan_id
      and private.can_operate_organization(v.organization_id)
  );
$$;

comment on function private.can_operate_rate_plan(uuid) is
  'Returns true when the current user may operate the organization owning the rate plan.';

revoke all on function private.can_operate_rate_plan(uuid)
  from public, anon, authenticated;

grant execute on function private.can_operate_rate_plan(uuid)
  to authenticated;


-- ===========================================================================
-- Safe public pricing views
-- ===========================================================================

create view public.catalog_space_rate_plans
with (security_barrier = true)
as
select
  srp.id,
  srp.space_id,
  srp.name,
  srp.pricing_model,
  srp.unit_amount_minor,
  srp.currency_code,
  srp.weekdays,
  srp.valid_from,
  srp.valid_until,
  srp.priority
from public.space_rate_plans as srp
join public.spaces as s
  on s.id = srp.space_id
join public.venues as v
  on v.id = s.venue_id
where srp.is_active = true
  and s.status = 'active'
  and v.status = 'published'
  and v.published_at is not null;


revoke all on table public.catalog_space_rate_plans
  from public, anon, authenticated;

grant select on table public.catalog_space_rate_plans
  to anon, authenticated;


create view public.catalog_rate_overrides
with (security_barrier = true)
as
select
  ro.id,
  ro.rate_plan_id,
  ro.override_from,
  ro.override_until,
  ro.unit_amount_minor
from public.rate_overrides as ro
join public.space_rate_plans as srp
  on srp.id = ro.rate_plan_id
join public.spaces as s
  on s.id = srp.space_id
join public.venues as v
  on v.id = s.venue_id
where srp.is_active = true
  and s.status = 'active'
  and v.status = 'published'
  and v.published_at is not null;


revoke all on table public.catalog_rate_overrides
  from public, anon, authenticated;

grant select on table public.catalog_rate_overrides
  to anon, authenticated;


create view public.catalog_space_booking_rules
with (security_barrier = true)
as
select
  sbr.space_id,
  sbr.minimum_duration_minutes,
  sbr.maximum_duration_minutes,
  sbr.minimum_notice_minutes,
  sbr.maximum_advance_days,
  sbr.buffer_before_minutes,
  sbr.buffer_after_minutes,
  sbr.requires_host_approval
from public.space_booking_rules as sbr
join public.spaces as s
  on s.id = sbr.space_id
join public.venues as v
  on v.id = s.venue_id
where s.status = 'active'
  and v.status = 'published'
  and v.published_at is not null;


revoke all on table public.catalog_space_booking_rules
  from public, anon, authenticated;

grant select on table public.catalog_space_booking_rules
  to anon, authenticated;


-- ===========================================================================
-- Safe public availability views
-- ===========================================================================
--
-- Internal fields deliberately excluded:
--   reason
--   created_by_user_id
--   cancelled_at
--
-- Only active blackouts are exposed.

create view public.catalog_venue_blackouts
with (security_barrier = true)
as
select
  vb.id,
  vb.venue_id,
  vb.blocked_from,
  vb.blocked_until
from public.venue_blackouts as vb
join public.venues as v
  on v.id = vb.venue_id
where vb.cancelled_at is null
  and v.status = 'published'
  and v.published_at is not null;


revoke all on table public.catalog_venue_blackouts
  from public, anon, authenticated;

grant select on table public.catalog_venue_blackouts
  to anon, authenticated;


create view public.catalog_space_blackouts
with (security_barrier = true)
as
select
  sb.id,
  sb.space_id,
  sb.blocked_from,
  sb.blocked_until
from public.space_blackouts as sb
join public.spaces as s
  on s.id = sb.space_id
join public.venues as v
  on v.id = s.venue_id
where sb.cancelled_at is null
  and s.status = 'active'
  and v.status = 'published'
  and v.published_at is not null;


revoke all on table public.catalog_space_blackouts
  from public, anon, authenticated;

grant select on table public.catalog_space_blackouts
  to anon, authenticated;


-- ===========================================================================
-- space_rate_plans
-- ===========================================================================
--
-- Customers use catalog_space_rate_plans.
--
-- Organization operators may inspect and maintain their actual rate-plan
-- records.
--
-- No browser DELETE is granted. Plans can be deactivated with is_active=false,
-- preserving their identity/history for references and auditability.

revoke all on table public.space_rate_plans
  from anon, authenticated;

grant select on table public.space_rate_plans
  to authenticated;

grant insert (
  space_id,
  name,
  pricing_model,
  unit_amount_minor,
  currency_code,
  weekdays,
  valid_from,
  valid_until,
  priority,
  is_active
)
on public.space_rate_plans
to authenticated;

grant update (
  name,
  pricing_model,
  unit_amount_minor,
  currency_code,
  weekdays,
  valid_from,
  valid_until,
  priority,
  is_active
)
on public.space_rate_plans
to authenticated;


create policy space_rate_plans_select_operator
on public.space_rate_plans
for select
to authenticated
using (
  private.can_operate_space(space_id)
);


create policy space_rate_plans_insert_operator
on public.space_rate_plans
for insert
to authenticated
with check (
  private.can_operate_space(space_id)
);


create policy space_rate_plans_update_operator
on public.space_rate_plans
for update
to authenticated
using (
  private.can_operate_space(space_id)
)
with check (
  private.can_operate_space(space_id)
);


-- ===========================================================================
-- rate_overrides
-- ===========================================================================
--
-- Customers receive safe override information through catalog_rate_overrides.
--
-- The internal "reason" field is visible to venue operators but is deliberately
-- not exposed through the public catalogue view.
--
-- Ordinary browser DELETE is not granted.

revoke all on table public.rate_overrides
  from anon, authenticated;

grant select on table public.rate_overrides
  to authenticated;

grant insert (
  rate_plan_id,
  override_from,
  override_until,
  unit_amount_minor,
  reason
)
on public.rate_overrides
to authenticated;

grant update (
  override_from,
  override_until,
  unit_amount_minor,
  reason
)
on public.rate_overrides
to authenticated;


create policy rate_overrides_select_operator
on public.rate_overrides
for select
to authenticated
using (
  private.can_operate_rate_plan(rate_plan_id)
);


create policy rate_overrides_insert_operator
on public.rate_overrides
for insert
to authenticated
with check (
  private.can_operate_rate_plan(rate_plan_id)
);


create policy rate_overrides_update_operator
on public.rate_overrides
for update
to authenticated
using (
  private.can_operate_rate_plan(rate_plan_id)
)
with check (
  private.can_operate_rate_plan(rate_plan_id)
);


-- ===========================================================================
-- space_booking_rules
-- ===========================================================================
--
-- Public customers need these constraints so the UI can truthfully explain:
--
--   minimum booking duration
--   maximum booking duration
--   minimum notice
--   maximum advance window
--   operational buffers
--   whether host approval is required
--
-- The database/server remains authoritative when a booking is actually made.

revoke all on table public.space_booking_rules
  from anon, authenticated;

grant select on table public.space_booking_rules
  to authenticated;

grant insert (
  space_id,
  minimum_duration_minutes,
  maximum_duration_minutes,
  minimum_notice_minutes,
  maximum_advance_days,
  buffer_before_minutes,
  buffer_after_minutes,
  requires_host_approval
)
on public.space_booking_rules
to authenticated;

grant update (
  minimum_duration_minutes,
  maximum_duration_minutes,
  minimum_notice_minutes,
  maximum_advance_days,
  buffer_before_minutes,
  buffer_after_minutes,
  requires_host_approval
)
on public.space_booking_rules
to authenticated;


create policy space_booking_rules_select_operator
on public.space_booking_rules
for select
to authenticated
using (
  private.can_operate_space(space_id)
);


create policy space_booking_rules_insert_operator
on public.space_booking_rules
for insert
to authenticated
with check (
  private.can_operate_space(space_id)
);


create policy space_booking_rules_update_operator
on public.space_booking_rules
for update
to authenticated
using (
  private.can_operate_space(space_id)
)
with check (
  private.can_operate_space(space_id)
);


-- ===========================================================================
-- venue_blackouts
-- ===========================================================================
--
-- Public customers use catalog_venue_blackouts.
--
-- Venue operators can inspect the full internal record, including reason and
-- creator.
--
-- INSERT / UPDATE / DELETE are intentionally not granted directly to browser
-- sessions.
--
-- Blackout creation/cancellation will later use trusted server functions so
-- that reservation approval and availability changes can share appropriate
-- locking and cannot race each other.

revoke all on table public.venue_blackouts
  from anon, authenticated;

grant select on table public.venue_blackouts
  to authenticated;


create policy venue_blackouts_select_operator
on public.venue_blackouts
for select
to authenticated
using (
  private.can_operate_venue(venue_id)
);


-- ===========================================================================
-- space_blackouts
-- ===========================================================================

revoke all on table public.space_blackouts
  from anon, authenticated;

grant select on table public.space_blackouts
  to authenticated;


create policy space_blackouts_select_operator
on public.space_blackouts
for select
to authenticated
using (
  private.can_operate_space(space_id)
);