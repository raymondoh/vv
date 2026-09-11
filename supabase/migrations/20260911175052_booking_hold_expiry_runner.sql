-- VV trusted booking-hold expiry runner.
-- Deploy in postgres as postgres so the named job has a fixed trusted identity.
-- This migration does not change approval duration or payment/lifecycle rules.

do $migration$
begin
  if current_user <> 'postgres' or pg_catalog.current_database() <> 'postgres' then
    raise exception 'Booking-hold expiry runner must be installed as postgres in database postgres';
  end if;
end;
$migration$;

create extension if not exists pg_cron;

-- Supabase owns pg_cron extension objects as its internal supabase_admin
-- role. Owner-issued PUBLIC table/function ACLs are platform-owned behavior;
-- postgres cannot revoke them. VV does not attempt to change that ownership.
-- The security boundary is schema isolation: application roles cannot enter
-- cron. A future migration must not grant them cron schema access or expose
-- cron through the Data API. Preserve the trusted scheduler owner's access.
do $hardening$
begin
  -- PUBLIC is an ACL grantee (OID 0), not a row in pg_roles.
  if exists (
    select 1
    from pg_catalog.pg_namespace as n,
      lateral pg_catalog.aclexplode(
        coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
      ) as a
    where n.nspname = 'cron'
      and a.grantee = 0
      and a.privilege_type in ('USAGE', 'CREATE')
  ) then
    raise exception 'PUBLIC must not have access to schema cron'
      using errcode = '42501';
  end if;

  -- Effective checks also catch privileges inherited through role membership.
  if pg_catalog.has_schema_privilege('anon', 'cron', 'USAGE,CREATE')
    or pg_catalog.has_schema_privilege('authenticated', 'cron', 'USAGE,CREATE')
    or pg_catalog.has_schema_privilege('service_role', 'cron', 'USAGE,CREATE')
  then
    raise exception 'Application roles must not have access to schema cron'
      using errcode = '42501';
  end if;

  if not pg_catalog.has_schema_privilege(current_user, 'cron', 'USAGE')
    or not pg_catalog.has_function_privilege(
      current_user, 'cron.schedule(text,text,text)', 'EXECUTE'
    )
  then
    raise exception 'Migration identity must be able to use cron and execute named scheduling'
      using errcode = '42501';
  end if;
end;
$hardening$;

-- The allocation expiry index cannot serve this booking-first candidate scan.
create index bookings_due_hold_expiry_idx
  on public.bookings (hold_expires_at, id)
  where booking_status = 'approved_hold' and hold_expires_at is not null;

create function private.expire_due_booking_holds(batch_limit integer default 100)
returns table (
  selected_count integer,
  expired_count integer,
  failed_count integer,
  reference_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reference_now timestamptz := pg_catalog.now();
  v_booking record;
  v_sqlstate text;
  v_error_message text;
begin
  if batch_limit is null or batch_limit < 1 or batch_limit > 500 then
    raise exception 'Expiry batch limit must be between 1 and 500'
      using errcode = '22023';
  end if;

  selected_count := 0;
  expired_count := 0;
  failed_count := 0;
  reference_now := v_reference_now;

  -- The transaction reference time matches expire_booking_hold's now().
  -- Booking locks are acquired first, as in deposit confirmation. SKIP LOCKED
  -- leaves work held by another lifecycle transaction for a later invocation.
  for v_booking in
    select b.id, b.organization_id
    from public.bookings as b
    where b.booking_status = 'approved_hold'
      and b.hold_expires_at is not null
      and b.hold_expires_at <= v_reference_now
    order by b.hold_expires_at asc, b.id asc
    limit batch_limit
    for update skip locked
  loop
    selected_count := selected_count + 1;
    begin
      -- The existing workflow alone owns expiry validation and mutations.
      perform public.expire_booking_hold(v_booking.id);
      expired_count := expired_count + 1;
    exception when others then
      -- Roll back this candidate's mutations, not previous successful ones.
      -- Cancellation/assertion failures are intentionally not caught by OTHERS.
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error_message = message_text;
      failed_count := failed_count + 1;

      begin
        insert into private.audit_events (
          actor_type, actor_user_id, organization_id,
          action, entity_type, entity_id, metadata
        ) values (
          'system', null, v_booking.organization_id,
          'booking_hold_expiry_failed', 'booking', v_booking.id,
          pg_catalog.jsonb_build_object(
            'sqlstate', v_sqlstate,
            'error_message', pg_catalog.left(v_error_message, 512)
          )
        );
      exception when others then
        -- Ledger failures must not undo other expiries or stop later rows.
        -- Keep the failed count and emit bounded diagnostics to the trusted
        -- caller/server log, without including raw exception text.
        raise warning 'Booking hold expiry audit failed for booking % (expiry SQLSTATE %, audit SQLSTATE %)',
          v_booking.id, v_sqlstate, sqlstate;
      end;
    end;
  end loop;

  return next;
end;
$function$;

alter function private.expire_due_booking_holds(integer) owner to postgres;
revoke all on function private.expire_due_booking_holds(integer)
  from public, anon, authenticated, service_role;

comment on function private.expire_due_booking_holds(integer) is
  'Postgres-only bounded due-hold expiry batch; skips locked bookings and records individual failures in the private operational ledger.';

-- Named scheduling replaces this postgres-owned deployment definition.
-- No HTTP call, application RPC, or service-role credential is involved.
select cron.schedule(
  'vv-expire-booking-holds',
  '* * * * *',
  'select private.expire_due_booking_holds(100);'
);
