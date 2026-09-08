-- VV Production Database
-- Migration 0020: RLS - customer features
--
-- Covers:
--   user_favorite_venues
--   live_tour_slots
--   live_tour_appointments
--   event_plans
--   event_plan_tasks
--   event_notes
--
-- Introduces:
--   public.catalog_live_tour_slots
--
-- Principles:
--
--   * customers control only their own favorites
--   * only published venues may be favorited through browser access
--   * public users may see only open future live-tour slots
--   * host/internal slot notes are never public
--   * organization operators manage their own live-tour slots
--   * customers may see and cancel only their own appointments
--   * host staff controls completion/no-show lifecycle
--   * customer event plans/tasks/notes remain private to the customer
--   * platform-admin status does not automatically expose private planner notes


-- ===========================================================================
-- user_favorite_venues
-- ===========================================================================

revoke all on table public.user_favorite_venues
  from anon, authenticated;

grant select on table public.user_favorite_venues
  to authenticated;

grant insert (
  user_id,
  venue_id
)
on public.user_favorite_venues
to authenticated;

grant delete on table public.user_favorite_venues
  to authenticated;


create policy user_favorite_venues_select_own_public
on public.user_favorite_venues
for select
to authenticated
using (
  user_id = auth.uid()
  and private.is_public_venue(venue_id)
);


create policy user_favorite_venues_insert_own_public
on public.user_favorite_venues
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.is_public_venue(venue_id)
);


create policy user_favorite_venues_delete_own
on public.user_favorite_venues
for delete
to authenticated
using (
  user_id = auth.uid()
);


-- ===========================================================================
-- Safe public live-tour slot catalogue
-- ===========================================================================
--
-- Deliberately excludes:
--
--   assigned_host_user_id
--   host_notes
--   created_by_user_id
--   cancelled_at
--
-- Only OPEN, not-yet-ended slots belonging to published venues are exposed.

create view public.catalog_live_tour_slots
with (security_barrier = true)
as
select
  lts.id,
  lts.venue_id,
  lts.starts_at,
  lts.ends_at
from public.live_tour_slots as lts
join public.venues as v
  on v.id = lts.venue_id
where lts.status = 'open'
  and lts.ends_at > now()
  and v.status = 'published'
  and v.published_at is not null;


revoke all on table public.catalog_live_tour_slots
  from public, anon, authenticated;

grant select on table public.catalog_live_tour_slots
  to anon, authenticated;


-- ===========================================================================
-- live_tour_slots
-- ===========================================================================
--
-- Full slot records are operational data.
--
-- Organization operators may:
--   read their slots
--   create open slots
--   change assignment/time/notes
--   cancel slots
--
-- Existing integrity triggers continue to enforce:
--   assigned host belongs to organization
--   no overlapping open slots for the same host
--   venue identity cannot change
--   slot time cannot change around an active appointment
--   active appointments block slot cancellation

revoke all on table public.live_tour_slots
  from anon, authenticated;

grant select on table public.live_tour_slots
  to authenticated;

grant insert (
  venue_id,
  assigned_host_user_id,
  starts_at,
  ends_at,
  host_notes
)
on public.live_tour_slots
to authenticated;

grant update (
  assigned_host_user_id,
  starts_at,
  ends_at,
  status,
  host_notes,
  cancelled_at
)
on public.live_tour_slots
to authenticated;


create policy live_tour_slots_select_operator
on public.live_tour_slots
for select
to authenticated
using (
  private.can_operate_venue(venue_id)
);


create policy live_tour_slots_insert_operator
on public.live_tour_slots
for insert
to authenticated
with check (
  private.can_operate_venue(venue_id)
);


create policy live_tour_slots_update_operator
on public.live_tour_slots
for update
to authenticated
using (
  private.can_operate_venue(venue_id)
)
with check (
  private.can_operate_venue(venue_id)
);


-- ===========================================================================
-- live_tour_appointments
-- ===========================================================================
--
-- Customers may read their own appointments.
--
-- Venue operators may read appointments attached to their own slots.
--
-- Appointment creation remains server-side for now. A later trusted function
-- will:
--   establish customer identity
--   snapshot appropriate customer information
--   handle slot contention cleanly
--
-- Customers may update their own message and may transition a scheduled
-- appointment to cancelled.
--
-- Customers may NOT mark themselves completed or no-show.
--
-- Venue operators control operational lifecycle states such as completed and
-- no_show.
--
-- Existing lifecycle triggers remain authoritative.

revoke all on table public.live_tour_appointments
  from anon, authenticated;

grant select on table public.live_tour_appointments
  to authenticated;

grant update (
  appointment_status,
  customer_message,
  cancellation_reason,
  completed_at,
  cancelled_at,
  no_show_at
)
on public.live_tour_appointments
to authenticated;


create policy live_tour_appointments_select_customer
on public.live_tour_appointments
for select
to authenticated
using (
  customer_user_id = auth.uid()
);


create policy live_tour_appointments_select_operator
on public.live_tour_appointments
for select
to authenticated
using (
  private.can_operate_live_tour_slot(live_tour_slot_id)
);


create policy live_tour_appointments_update_customer
on public.live_tour_appointments
for update
to authenticated
using (
  customer_user_id = auth.uid()
)
with check (
  customer_user_id = auth.uid()
  and appointment_status in (
    'scheduled',
    'cancelled'
  )
);


create policy live_tour_appointments_update_operator
on public.live_tour_appointments
for update
to authenticated
using (
  private.can_operate_live_tour_slot(live_tour_slot_id)
)
with check (
  private.can_operate_live_tour_slot(live_tour_slot_id)
);


-- ===========================================================================
-- event_plans
-- ===========================================================================
--
-- Event planning data is customer-private.
--
-- Venue operators and platform admins do NOT receive blanket browser access
-- to customer notes/tasks merely because they can operate the booking.
--
-- A customer may create one plan for one of their own bookings.
-- The existing unique constraint enforces one plan per booking.
--
-- Plans are archived rather than directly deleted.

revoke all on table public.event_plans
  from anon, authenticated;

grant select on table public.event_plans
  to authenticated;

grant insert (
  booking_id,
  customer_user_id,
  title
)
on public.event_plans
to authenticated;

grant update (
  title,
  status,
  archived_at
)
on public.event_plans
to authenticated;


create policy event_plans_select_owner
on public.event_plans
for select
to authenticated
using (
  customer_user_id = auth.uid()
);


create policy event_plans_insert_owner
on public.event_plans
for insert
to authenticated
with check (
  customer_user_id = auth.uid()
  and private.is_booking_customer(booking_id)
);


create policy event_plans_update_owner
on public.event_plans
for update
to authenticated
using (
  customer_user_id = auth.uid()
)
with check (
  customer_user_id = auth.uid()
);


-- ===========================================================================
-- event_plan_tasks
-- ===========================================================================
--
-- Customer owns all tasks through ownership of the parent event plan.
--
-- event_plan_id itself is not browser-updatable.
-- Existing integrity trigger also protects plan identity and created_at.
--
-- completed_at remains trigger-controlled when status changes.

revoke all on table public.event_plan_tasks
  from anon, authenticated;

grant select on table public.event_plan_tasks
  to authenticated;

grant insert (
  event_plan_id,
  title,
  description,
  category,
  status,
  due_date,
  sort_order
)
on public.event_plan_tasks
to authenticated;

grant update (
  title,
  description,
  category,
  status,
  due_date,
  sort_order
)
on public.event_plan_tasks
to authenticated;

grant delete on table public.event_plan_tasks
  to authenticated;


create policy event_plan_tasks_select_owner
on public.event_plan_tasks
for select
to authenticated
using (
  private.is_event_plan_owner(event_plan_id)
);


create policy event_plan_tasks_insert_owner
on public.event_plan_tasks
for insert
to authenticated
with check (
  private.is_event_plan_owner(event_plan_id)
);


create policy event_plan_tasks_update_owner
on public.event_plan_tasks
for update
to authenticated
using (
  private.is_event_plan_owner(event_plan_id)
)
with check (
  private.is_event_plan_owner(event_plan_id)
);


create policy event_plan_tasks_delete_owner
on public.event_plan_tasks
for delete
to authenticated
using (
  private.is_event_plan_owner(event_plan_id)
);


-- ===========================================================================
-- event_notes
-- ===========================================================================
--
-- Notes are private customer content.
--
-- Venue staff and platform admins do not automatically receive access.
-- Customers may create, edit, pin/unpin and delete their own notes.

revoke all on table public.event_notes
  from anon, authenticated;

grant select on table public.event_notes
  to authenticated;

grant insert (
  event_plan_id,
  body,
  is_pinned
)
on public.event_notes
to authenticated;

grant update (
  body,
  is_pinned
)
on public.event_notes
to authenticated;

grant delete on table public.event_notes
  to authenticated;


create policy event_notes_select_owner
on public.event_notes
for select
to authenticated
using (
  private.is_event_plan_owner(event_plan_id)
);


create policy event_notes_insert_owner
on public.event_notes
for insert
to authenticated
with check (
  private.is_event_plan_owner(event_plan_id)
);


create policy event_notes_update_owner
on public.event_notes
for update
to authenticated
using (
  private.is_event_plan_owner(event_plan_id)
)
with check (
  private.is_event_plan_owner(event_plan_id)
);


create policy event_notes_delete_owner
on public.event_notes
for delete
to authenticated
using (
  private.is_event_plan_owner(event_plan_id)
);