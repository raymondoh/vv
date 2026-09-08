-- VV Production Database
-- Migration 0019: RLS - bookings and payments
--
-- Covers:
--   bookings
--   booking_items
--   booking_price_lines
--   booking_payment_schedule
--   booking_space_allocations
--   booking_status_history
--   booking_payments
--   payment_refunds
--   organization_payment_accounts
--   booking_transfers
--
-- Introduces safe customer-facing views:
--   my_bookings
--   my_booking_items
--   my_booking_price_lines
--   my_booking_payment_schedule
--   my_booking_payments
--   my_payment_refunds
--   my_booking_status_history
--
-- Introduces safe operator-facing payment views:
--   operator_booking_payments
--   operator_payment_refunds
--
-- Principles:
--
--   * customers see their own booking/customer-side commercial information
--   * venue operators see bookings for organizations they operate
--   * provider/payment infrastructure details remain restricted
--   * payout accounts and transfers are owner/manager/platform-admin data
--   * browser sessions receive no direct mutation privileges on transactional
--     booking/payment/reservation records
--   * later trusted transaction functions will own all lifecycle changes


-- ===========================================================================
-- Helper: administrative access to a booking
-- ===========================================================================

create or replace function private.can_administer_booking(
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
      and private.can_administer_organization(b.organization_id)
  );
$$;

comment on function private.can_administer_booking(uuid) is
  'Returns true for platform admins or active owner/manager members of the organization responsible for the booking.';

revoke all on function private.can_administer_booking(uuid)
  from public, anon, authenticated;

grant execute on function private.can_administer_booking(uuid)
  to authenticated;


-- ===========================================================================
-- Safe customer booking view
-- ===========================================================================
--
-- Deliberately excluded:
--
--   organization_id
--   commercial_term_version_id
--   commission_bps
--   marketplace_commission_minor
--   venue_net_before_fees_minor
--   customer_snapshot
--   venue_snapshot
--   commercial_terms_snapshot
--   booking_request_snapshot
--
-- These are either internal commercial data or raw snapshots which should not
-- automatically become browser-visible merely because the user owns a booking.

create view public.my_bookings
with (security_barrier = true)
as
select
  b.id,
  b.booking_reference,
  b.venue_id,
  b.booking_status,
  b.payment_status,
  b.event_starts_at,
  b.event_ends_at,
  b.event_type,
  b.guest_count,
  b.currency_code,
  b.customer_total_minor,
  b.hold_expires_at,
  b.submitted_at,
  b.approved_at,
  b.confirmed_at,
  b.declined_at,
  b.cancelled_at,
  b.completed_at,
  b.created_at,
  b.updated_at
from public.bookings as b
where b.customer_user_id = auth.uid();


revoke all on table public.my_bookings
  from public, anon, authenticated;

grant select on table public.my_bookings
  to authenticated;


-- ===========================================================================
-- Safe customer booking items
-- ===========================================================================

create view public.my_booking_items
with (security_barrier = true)
as
select
  bi.id,
  bi.booking_id,
  bi.space_id,
  bi.space_layout_id,
  bi.rate_plan_id,
  bi.item_starts_at,
  bi.item_ends_at,
  bi.sort_order,
  bi.created_at
from public.booking_items as bi
join public.bookings as b
  on b.id = bi.booking_id
where b.customer_user_id = auth.uid();


revoke all on table public.my_booking_items
  from public, anon, authenticated;

grant select on table public.my_booking_items
  to authenticated;


-- ===========================================================================
-- Safe customer price lines
-- ===========================================================================
--
-- Only customer-paid lines are exposed.
--
-- Venue-side commission or other venue-paid lines remain internal.

create view public.my_booking_price_lines
with (security_barrier = true)
as
select
  bpl.id,
  bpl.booking_id,
  bpl.booking_item_id,
  bpl.sequence,
  bpl.line_type,
  bpl.description,
  bpl.amount_minor,
  bpl.currency_code,
  bpl.created_at
from public.booking_price_lines as bpl
join public.bookings as b
  on b.id = bpl.booking_id
where b.customer_user_id = auth.uid()
  and bpl.payer = 'customer';


revoke all on table public.my_booking_price_lines
  from public, anon, authenticated;

grant select on table public.my_booking_price_lines
  to authenticated;


-- ===========================================================================
-- Safe customer payment schedule
-- ===========================================================================

create view public.my_booking_payment_schedule
with (security_barrier = true)
as
select
  bps.id,
  bps.booking_id,
  bps.sequence,
  bps.installment_type,
  bps.amount_minor,
  bps.currency_code,
  bps.due_at,
  bps.status,
  bps.paid_at,
  bps.created_at,
  bps.updated_at
from public.booking_payment_schedule as bps
join public.bookings as b
  on b.id = bps.booking_id
where b.customer_user_id = auth.uid();


revoke all on table public.my_booking_payment_schedule
  from public, anon, authenticated;

grant select on table public.my_booking_payment_schedule
  to authenticated;


-- ===========================================================================
-- Safe customer payments
-- ===========================================================================
--
-- Deliberately excluded:
--
--   provider_payment_id
--   provider_idempotency_key
--   provider_fee_minor
--   metadata
--   failure_code
--   failure_message

create view public.my_booking_payments
with (security_barrier = true)
as
select
  bp.id,
  bp.booking_id,
  bp.payment_schedule_id,
  bp.payment_kind,
  bp.provider,
  bp.payment_status,
  bp.amount_minor,
  bp.currency_code,
  bp.succeeded_at,
  bp.failed_at,
  bp.cancelled_at,
  bp.created_at,
  bp.updated_at
from public.booking_payments as bp
join public.bookings as b
  on b.id = bp.booking_id
where b.customer_user_id = auth.uid();


revoke all on table public.my_booking_payments
  from public, anon, authenticated;

grant select on table public.my_booking_payments
  to authenticated;


-- ===========================================================================
-- Safe customer refunds
-- ===========================================================================

create view public.my_payment_refunds
with (security_barrier = true)
as
select
  pr.id,
  pr.booking_id,
  pr.booking_payment_id,
  pr.refund_status,
  pr.amount_minor,
  pr.currency_code,
  pr.reason,
  pr.succeeded_at,
  pr.failed_at,
  pr.cancelled_at,
  pr.created_at,
  pr.updated_at
from public.payment_refunds as pr
join public.bookings as b
  on b.id = pr.booking_id
where b.customer_user_id = auth.uid();


revoke all on table public.my_payment_refunds
  from public, anon, authenticated;

grant select on table public.my_payment_refunds
  to authenticated;


-- ===========================================================================
-- Safe customer booking status history
-- ===========================================================================
--
-- Internal actor identity, reasons and metadata are deliberately excluded.

create view public.my_booking_status_history
with (security_barrier = true)
as
select
  bsh.id,
  bsh.booking_id,
  bsh.from_status,
  bsh.to_status,
  bsh.created_at
from public.booking_status_history as bsh
join public.bookings as b
  on b.id = bsh.booking_id
where b.customer_user_id = auth.uid();


revoke all on table public.my_booking_status_history
  from public, anon, authenticated;

grant select on table public.my_booking_status_history
  to authenticated;


-- ===========================================================================
-- Safe operational payment views
-- ===========================================================================
--
-- Staff needs payment state to operate a booking, but does not need provider
-- IDs, idempotency keys, provider metadata or raw provider failure payloads.

create view public.operator_booking_payments
with (security_barrier = true)
as
select
  bp.id,
  bp.booking_id,
  bp.payment_schedule_id,
  bp.payment_kind,
  bp.provider,
  bp.payment_status,
  bp.amount_minor,
  bp.currency_code,
  bp.succeeded_at,
  bp.failed_at,
  bp.cancelled_at,
  bp.created_at,
  bp.updated_at
from public.booking_payments as bp
where private.can_operate_booking(bp.booking_id);


revoke all on table public.operator_booking_payments
  from public, anon, authenticated;

grant select on table public.operator_booking_payments
  to authenticated;


create view public.operator_payment_refunds
with (security_barrier = true)
as
select
  pr.id,
  pr.booking_id,
  pr.booking_payment_id,
  pr.refund_status,
  pr.amount_minor,
  pr.currency_code,
  pr.reason,
  pr.succeeded_at,
  pr.failed_at,
  pr.cancelled_at,
  pr.created_at,
  pr.updated_at
from public.payment_refunds as pr
where private.can_operate_booking(pr.booking_id);


revoke all on table public.operator_payment_refunds
  from public, anon, authenticated;

grant select on table public.operator_payment_refunds
  to authenticated;


-- ===========================================================================
-- bookings
-- ===========================================================================
--
-- Full underlying booking rows are operational/internal data.
--
-- Customers use my_bookings.
-- Organization operators and platform admins may inspect the full record.
--
-- No authenticated browser INSERT/UPDATE/DELETE is granted.

revoke all on table public.bookings
  from anon, authenticated;

grant select on table public.bookings
  to authenticated;


create policy bookings_select_operator
on public.bookings
for select
to authenticated
using (
  private.can_operate_organization(organization_id)
);


-- ===========================================================================
-- booking_items
-- ===========================================================================

revoke all on table public.booking_items
  from anon, authenticated;

grant select on table public.booking_items
  to authenticated;


create policy booking_items_select_operator
on public.booking_items
for select
to authenticated
using (
  private.can_operate_booking(booking_id)
);


-- ===========================================================================
-- booking_price_lines
-- ===========================================================================

revoke all on table public.booking_price_lines
  from anon, authenticated;

grant select on table public.booking_price_lines
  to authenticated;


create policy booking_price_lines_select_operator
on public.booking_price_lines
for select
to authenticated
using (
  private.can_operate_booking(booking_id)
);


-- ===========================================================================
-- booking_payment_schedule
-- ===========================================================================

revoke all on table public.booking_payment_schedule
  from anon, authenticated;

grant select on table public.booking_payment_schedule
  to authenticated;


create policy booking_payment_schedule_select_operator
on public.booking_payment_schedule
for select
to authenticated
using (
  private.can_operate_booking(booking_id)
);


-- ===========================================================================
-- booking_space_allocations
-- ===========================================================================
--
-- Reservation/allocation data is operational data.
-- Customers already have their booking/item dates and hold expiry through the
-- safe customer views and do not require this internal inventory structure.

revoke all on table public.booking_space_allocations
  from anon, authenticated;

grant select on table public.booking_space_allocations
  to authenticated;


create policy booking_space_allocations_select_operator
on public.booking_space_allocations
for select
to authenticated
using (
  private.can_operate_booking(booking_id)
);


-- ===========================================================================
-- booking_status_history
-- ===========================================================================

revoke all on table public.booking_status_history
  from anon, authenticated;

grant select on table public.booking_status_history
  to authenticated;


create policy booking_status_history_select_operator
on public.booking_status_history
for select
to authenticated
using (
  private.can_operate_booking(booking_id)
);


-- ===========================================================================
-- booking_payments
-- ===========================================================================
--
-- Raw provider/payment records may contain identifiers and metadata not needed
-- by ordinary venue staff.
--
-- Full table visibility is therefore restricted to:
--
--   owner
--   manager
--   platform admin
--
-- Staff uses operator_booking_payments.
-- Customers use my_booking_payments.

revoke all on table public.booking_payments
  from anon, authenticated;

grant select on table public.booking_payments
  to authenticated;


create policy booking_payments_select_administrator
on public.booking_payments
for select
to authenticated
using (
  private.can_administer_booking(booking_id)
);


-- ===========================================================================
-- payment_refunds
-- ===========================================================================

revoke all on table public.payment_refunds
  from anon, authenticated;

grant select on table public.payment_refunds
  to authenticated;


create policy payment_refunds_select_administrator
on public.payment_refunds
for select
to authenticated
using (
  private.can_administer_booking(booking_id)
);


-- ===========================================================================
-- organization_payment_accounts
-- ===========================================================================
--
-- Provider-connected payout accounts are financially sensitive.
--
-- Visible only to:
--   owner
--   manager
--   platform admin
--
-- All mutation remains trusted/server-side.

revoke all on table public.organization_payment_accounts
  from anon, authenticated;

grant select on table public.organization_payment_accounts
  to authenticated;


create policy organization_payment_accounts_select_administrator
on public.organization_payment_accounts
for select
to authenticated
using (
  private.can_administer_organization(organization_id)
);


-- ===========================================================================
-- booking_transfers
-- ===========================================================================
--
-- These represent venue-side provider payouts and reversal state.
--
-- Customers must never receive these records.
-- Ordinary staff does not need provider transfer infrastructure.
--
-- Visible only to:
--   owner
--   manager
--   platform admin

revoke all on table public.booking_transfers
  from anon, authenticated;

grant select on table public.booking_transfers
  to authenticated;


create policy booking_transfers_select_administrator
on public.booking_transfers
for select
to authenticated
using (
  private.can_administer_booking(booking_id)
);