-- Stage 7B2B1: verified provider evidence only, never booking fulfillment.
-- Account scope is the actual provider account ID under which the adapter
-- verified the event (Stripe platform acct_* for destination charges), NOT
-- a destination account, customer-supplied scope, or the literal "platform".
-- This migration neither enables integration nor changes existing payments.

do $preflight$
begin
  if exists (select 1 from private.payment_provider_events
    where processing_status not in ('processed', 'ignored')) then
    raise exception 'Unresolved legacy provider events require explicit identity reconciliation before migration';
  end if;
end;
$preflight$;

alter table private.payment_provider_events
  add column integration_environment text null,
  add column provider_account_scope text null,
  add column claim_token uuid null,
  add column lease_expires_at timestamptz null,
  add column next_attempt_at timestamptz null,
  add column last_error_code text null,
  drop constraint payment_provider_events_provider_event_unique,
  drop constraint payment_provider_events_status_check,
  drop constraint payment_provider_events_processing_state_check,
  add constraint payment_provider_events_scoped_identity_unique
    unique (provider, integration_environment, provider_account_scope, provider_event_id),
  add constraint payment_provider_events_status_check check (processing_status in
    ('received', 'processing', 'receipt_recorded', 'processed', 'failed', 'ignored', 'manual_review')),
  -- Retain terminal historical evidence without inventing its account/mode.
  -- The insert trigger requires explicit context on EVERY new event.
  add constraint payment_provider_events_context_check check (
    (integration_environment is null and provider_account_scope is null
      and processing_status in ('processed', 'ignored'))
    or (integration_environment is not null and integration_environment in ('test', 'live')
      and provider_account_scope is not null
      and provider_account_scope ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,254}$'
      and (provider <> 'stripe' or provider_account_scope ~ '^acct_[A-Za-z0-9]+$'))),
  add constraint payment_provider_events_attempt_bound check (
    integration_environment is null or attempt_count between 0 and 20);

create table private.payment_provider_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid null references public.booking_payments(id) on delete restrict,
  booking_id uuid null references public.bookings(id) on delete restrict,
  source_event_id bigint not null references private.payment_provider_events(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{0,30}$'),
  integration_environment text not null check (integration_environment in ('test', 'live')),
  provider_account_scope text not null check (provider_account_scope ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,254}$'),
  provider_payment_id text not null check (provider_payment_id ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,254}$'),
  provider_charge_id text not null check (provider_charge_id ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,254}$'),
  destination_account_id text null check (destination_account_id ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,254}$'),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  provider_succeeded_at timestamptz not null check (isfinite(provider_succeeded_at)),
  recorded_at timestamptz not null default clock_timestamp(),
  disposition text not null default 'unresolved'
    check (disposition in ('unresolved', 'fulfilled', 'compensation_required', 'manual_review')),
  check ((payment_id is null) = (booking_id is null)),
  constraint payment_provider_receipts_charge_unique
    unique (provider, integration_environment, provider_account_scope, provider_charge_id)
);
alter table private.payment_provider_receipts owner to postgres;
revoke all on private.payment_provider_receipts from public, anon, authenticated, service_role;
alter table private.payment_provider_events owner to postgres;
revoke all on private.payment_provider_events from public, anon, authenticated, service_role;
revoke all on sequence private.payment_provider_events_id_seq from public, anon, authenticated, service_role;

alter table private.payment_provider_events
  add column receipt_id uuid null references private.payment_provider_receipts(id) on delete restrict,
  add constraint payment_provider_events_processing_state_check check (
    (processing_status = 'processing' and claim_token is not null and lease_expires_at is not null
      and next_attempt_at = lease_expires_at and next_attempt_at is not null and processed_at is null)
    or (processing_status in ('received', 'failed', 'receipt_recorded') and claim_token is null
      and lease_expires_at is null and next_attempt_at is not null and processed_at is null
      and (processing_status <> 'failed' or last_error_code is not null))
    or (processing_status in ('processed', 'ignored') and claim_token is null and lease_expires_at is null
      and next_attempt_at is null and processed_at is not null)
    or (processing_status = 'manual_review' and claim_token is null and lease_expires_at is null
      and next_attempt_at is null and processed_at is null and last_error_code is not null)),
  add constraint payment_provider_events_receipt_state_check check (
    processing_status <> 'receipt_recorded' or receipt_id is not null),
  add constraint payment_provider_events_safe_error_check check (
    integration_environment is null or
      ((last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$')
        and (processing_error is null or (last_error_code is not null and processing_error = last_error_code))));

create index payment_provider_events_claim_due_idx
  on private.payment_provider_events (next_attempt_at, received_at, id)
  where processing_status in ('received', 'failed', 'processing', 'receipt_recorded');
create index payment_provider_receipts_payment_idx on private.payment_provider_receipts(payment_id)
  where payment_id is not null;

-- Fixed flat schema, bounded scalar values, no arbitrary metadata object.
-- Optional financial fields may be absent at ingestion, but a receipt requires
-- all of them. Provider success time is integer epoch seconds, never invented
-- subsecond precision. Occurrence/receipt time stay separate in the event row.
create function private.validate_normalized_payment_event(normalized_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  k text;
  n numeric;
begin
  if normalized_payload is null or jsonb_typeof(normalized_payload) <> 'object'
    or octet_length(normalized_payload::text) > 16384
    or normalized_payload -> 'schema_version' is distinct from '1'::jsonb
    or exists (select 1 from jsonb_object_keys(normalized_payload) as keys(key)
      where key not in ('schema_version', 'payment_id', 'provider_payment_id', 'provider_charge_id',
        'destination_account_id', 'amount_minor', 'currency_code', 'provider_succeeded_at'))
  then raise exception 'Invalid normalized event' using errcode = '22023'; end if;
  foreach k in array array['provider_payment_id', 'provider_charge_id', 'destination_account_id'] loop
    if normalized_payload ? k and (jsonb_typeof(normalized_payload -> k) <> 'string'
      or (normalized_payload ->> k) !~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,254}$') then
      raise exception 'Invalid normalized identifier' using errcode = '22023';
    end if;
  end loop;
  if normalized_payload ? 'payment_id' and (jsonb_typeof(normalized_payload -> 'payment_id') <> 'string'
    or (normalized_payload ->> 'payment_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Invalid payment correlation' using errcode = '22023';
  end if;
  if normalized_payload ? 'currency_code' and (jsonb_typeof(normalized_payload -> 'currency_code') <> 'string'
    or (normalized_payload ->> 'currency_code') !~ '^[A-Z]{3}$') then
    raise exception 'Invalid normalized currency' using errcode = '22023';
  end if;
  foreach k in array array['amount_minor', 'provider_succeeded_at'] loop
    if normalized_payload ? k then
      if jsonb_typeof(normalized_payload -> k) <> 'number' then
        raise exception 'Invalid normalized number' using errcode = '22023';
      end if;
      n := (normalized_payload ->> k)::numeric;
      if n <> trunc(n) or n < 0
        or (k = 'amount_minor' and (n = 0 or n > 9223372036854775807::numeric))
        or (k = 'provider_succeeded_at' and n > 253402300799::numeric) then
        raise exception 'Invalid normalized number' using errcode = '22023';
      end if;
    end if;
  end loop;
end;
$function$;

create function private.validate_payment_provider_event_insert()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.integration_environment is null or new.integration_environment not in ('test', 'live')
    or new.provider_account_scope is null
    or new.provider_account_scope !~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,254}$'
    or (new.provider = 'stripe' and new.provider_account_scope !~ '^acct_[A-Za-z0-9]+$')
    or new.provider_event_id !~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,254}$'
    or new.event_type !~ '^[a-z][a-z0-9_.]{0,127}$'
    or new.occurred_at is null or not isfinite(new.occurred_at)
    or (new.provider = 'stripe' and new.occurred_at <> date_trunc('second', new.occurred_at))
    or new.processing_status <> 'received' or new.attempt_count <> 0
    or new.receipt_id is not null or new.last_error_code is not null or new.processing_error is not null
  then raise exception 'Invalid provider event' using errcode = '22023'; end if;
  perform private.validate_normalized_payment_event(new.payload);
  return new;
end;
$function$;
create trigger validate_payment_provider_event_insert before insert on private.payment_provider_events
  for each row execute function private.validate_payment_provider_event_insert();

create or replace function private.validate_payment_provider_event_update()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  reference_now timestamptz := clock_timestamp();
begin
  if row(new.id, new.provider, new.provider_event_id, new.event_type, new.occurred_at,
    new.received_at, new.payload, new.created_at, new.integration_environment, new.provider_account_scope)
    is distinct from row(old.id, old.provider, old.provider_event_id, old.event_type, old.occurred_at,
    old.received_at, old.payload, old.created_at, old.integration_environment, old.provider_account_scope)
    or (old.receipt_id is not null and new.receipt_id is distinct from old.receipt_id) then
    raise exception 'Provider event evidence is immutable' using errcode = '55000';
  end if;
  if old.processing_status in ('processed', 'ignored', 'manual_review') then
    raise exception 'Provider event is terminal' using errcode = '55000';
  end if;
  if new.processing_status = 'processing' then
    if old.processing_status not in ('received', 'failed', 'receipt_recorded', 'processing')
      or old.next_attempt_at > reference_now
      or (old.processing_status = 'processing' and old.lease_expires_at > reference_now)
      or old.attempt_count >= 20 or new.attempt_count <> old.attempt_count + 1
      or new.claim_token is null or new.claim_token is not distinct from old.claim_token
      or new.lease_expires_at is null or new.lease_expires_at <= reference_now
      or new.lease_expires_at > reference_now + interval '125 seconds' then
      raise exception 'Invalid provider event claim' using errcode = '55000';
    end if;
  elsif new.processing_status = 'manual_review' and old.attempt_count = 20
    and old.next_attempt_at <= reference_now then
    -- Exhausted crashed/failed workers still become visible manual-review work.
    if new.attempt_count <> old.attempt_count then
      raise exception 'Invalid provider event count' using errcode = '55000';
    end if;
  elsif old.processing_status = 'processing' and new.processing_status in
    ('failed', 'manual_review', 'receipt_recorded', 'processed', 'ignored') then
    if old.lease_expires_at <= reference_now or new.attempt_count <> old.attempt_count then
      raise exception 'Event claim unavailable' using errcode = '55000';
    end if;
    if new.processing_status = 'ignored' and (old.event_type = 'payment_intent.succeeded' or old.receipt_id is not null) then
      raise exception 'Financial evidence cannot be ignored' using errcode = '55000';
    end if;
    if new.processing_status = 'processed' and new.receipt_id is not null and exists (
      select 1 from private.payment_provider_receipts r where r.id = new.receipt_id and r.disposition = 'unresolved') then
      raise exception 'Financial reconciliation is incomplete' using errcode = '55000';
    end if;
  else
    raise exception 'Invalid provider event transition' using errcode = '55000';
  end if;
  return new;
end;
$function$;
create trigger payment_provider_events_no_delete before delete on private.payment_provider_events
  for each row execute function private.prevent_append_only_mutation();

create function private.protect_payment_provider_receipt()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  -- 7B2B2 must add a separately reviewed disposition transition. No edits to
  -- financial evidence (including correlation) are allowed by this stage.
  if tg_op <> 'INSERT' then
    raise exception 'Provider receipt is immutable' using errcode = '55000';
  end if;
  if new.disposition <> 'unresolved' then
    raise exception 'Receipt must remain unresolved' using errcode = '23514';
  end if;
  return new;
end;
$function$;
create trigger protect_payment_provider_receipt before insert or update or delete on private.payment_provider_receipts
  for each row execute function private.protect_payment_provider_receipt();

create function public.ingest_payment_provider_event(provider_value text, environment_value text,
  account_scope_value text, event_id_value text, event_type_value text,
  occurred_at_value timestamptz, normalized_payload jsonb)
returns table (event_id bigint, ingestion_result text)
language plpgsql security definer set search_path = '' as $function$
declare
  e private.payment_provider_events%rowtype;
  inserted_id bigint;
  reference_now timestamptz := clock_timestamp();
begin
  -- Legacy terminal evidence has no safe account/mode identity. Never create
  -- a scoped duplicate or guess/backfill context when that event is redelivered.
  if exists (select 1 from private.payment_provider_events x
    where x.provider = provider_value and x.provider_event_id = event_id_value
      and x.integration_environment is null and x.provider_account_scope is null) then
    raise exception 'Legacy provider event requires identity reconciliation' using errcode = '23514';
  end if;
  -- INSERT validation also runs for ON CONFLICT. Never accept malformed replay.
  insert into private.payment_provider_events(provider, integration_environment, provider_account_scope,
    provider_event_id, event_type, occurred_at, received_at, created_at, updated_at, payload, next_attempt_at)
  values (provider_value, environment_value, account_scope_value, event_id_value, event_type_value,
    occurred_at_value, reference_now, reference_now, reference_now, normalized_payload, reference_now)
  on conflict on constraint payment_provider_events_scoped_identity_unique do nothing
  returning id into inserted_id;
  if inserted_id is not null then
    return query select inserted_id, 'received'::text;
    return;
  end if;
  select * into e from private.payment_provider_events x where x.provider = provider_value
    and x.integration_environment = environment_value and x.provider_account_scope = account_scope_value
    and x.provider_event_id = event_id_value;
  if e.id is null or e.event_type is distinct from event_type_value
    or e.occurred_at is distinct from occurred_at_value or e.payload is distinct from normalized_payload then
    raise exception 'Conflicting provider event evidence' using errcode = '23514';
  end if;
  return query select e.id, 'existing'::text;
end;
$function$;

create function public.claim_payment_provider_events(batch_limit integer default 20)
returns table (event_id bigint, provider text, integration_environment text, provider_account_scope text,
  provider_event_id text, event_type text, occurred_at timestamptz, normalized_payload jsonb,
  claim_token uuid, lease_expires_at timestamptz, attempt_count integer, receipt_id uuid)
language plpgsql security definer set search_path = '' as $function$
declare
  e private.payment_provider_events%rowtype;
  reference_now timestamptz;
begin
  if batch_limit is null or batch_limit not between 1 and 100 then
    raise exception 'Batch limit must be between 1 and 100' using errcode = '22023';
  end if;
  for e in select x.* from private.payment_provider_events x
    where x.processing_status in ('received', 'failed', 'processing', 'receipt_recorded')
      and x.next_attempt_at <= clock_timestamp()
    order by x.next_attempt_at, x.received_at, x.id limit batch_limit for update skip locked
  loop
    reference_now := clock_timestamp();
    if e.attempt_count >= 20 then
      update private.payment_provider_events x set processing_status = 'manual_review',
        claim_token = null, lease_expires_at = null, next_attempt_at = null,
        last_error_code = 'ATTEMPTS_EXHAUSTED', processing_error = 'ATTEMPTS_EXHAUSTED'
        where x.id = e.id;
      continue;
    end if;
    return query update private.payment_provider_events x set processing_status = 'processing',
      claim_token = gen_random_uuid(), lease_expires_at = reference_now + interval '120 seconds',
      next_attempt_at = reference_now + interval '120 seconds', attempt_count = x.attempt_count + 1,
      last_error_code = null, processing_error = null
      where x.id = e.id returning x.id, x.provider, x.integration_environment, x.provider_account_scope,
        x.provider_event_id, x.event_type, x.occurred_at, x.payload, x.claim_token, x.lease_expires_at,
        x.attempt_count, x.receipt_id;
  end loop;
end;
$function$;

create function private.lock_payment_provider_event_claim(target_event_id bigint, target_claim_token uuid)
returns private.payment_provider_events
language plpgsql security definer set search_path = '' as $function$
declare e private.payment_provider_events%rowtype;
begin
  select * into e from private.payment_provider_events x where x.id = target_event_id for update;
  if e.id is null or target_claim_token is null or e.processing_status <> 'processing'
    or e.claim_token is distinct from target_claim_token or e.lease_expires_at <= clock_timestamp() then
    raise exception 'Event claim unavailable' using errcode = '55000';
  end if;
  return e;
end;
$function$;

create function public.fail_payment_provider_event(event_id bigint, claim_token uuid, error_code text)
returns table (processing_state text, next_attempt_at timestamptz)
language plpgsql security definer set search_path = '' as $function$
declare e private.payment_provider_events%rowtype; retry_at timestamptz;
begin
  if error_code is null or error_code not in
    ('PROVIDER_UNAVAILABLE', 'NETWORK_ERROR', 'RATE_LIMITED', 'DATABASE_RETRY', 'RECONCILIATION_RETRY') then
    raise exception 'Invalid safe error code' using errcode = '22023';
  end if;
  e := private.lock_payment_provider_event_claim(event_id, claim_token);
  if e.attempt_count < 20 then
    retry_at := clock_timestamp() + make_interval(secs => least(3600, 30 * (2 ^ (e.attempt_count - 1)))::double precision);
  end if;
  return query update private.payment_provider_events x set
    processing_status = case when e.attempt_count >= 20 then 'manual_review' else 'failed' end,
    claim_token = null, lease_expires_at = null, next_attempt_at = retry_at,
    last_error_code = error_code, processing_error = error_code
    where x.id = e.id returning x.processing_status, x.next_attempt_at;
end;
$function$;

create function public.review_payment_provider_event(event_id bigint, claim_token uuid, reason_code text)
returns text language plpgsql security definer set search_path = '' as $function$
declare e private.payment_provider_events%rowtype;
begin
  if reason_code is null or reason_code not in ('INVALID_PROVIDER_CONTEXT', 'CONFLICTING_EVIDENCE',
    'UNSUPPORTED_EVENT', 'CORRELATION_MISMATCH', 'MANUAL_REVIEW_REQUIRED') then
    raise exception 'Invalid safe review code' using errcode = '22023';
  end if;
  e := private.lock_payment_provider_event_claim(event_id, claim_token);
  update private.payment_provider_events x set processing_status = 'manual_review',
    claim_token = null, lease_expires_at = null, next_attempt_at = null,
    last_error_code = reason_code, processing_error = reason_code where x.id = e.id;
  return 'manual_review';
end;
$function$;

create function public.record_payment_provider_receipt(event_id bigint, claim_token uuid)
returns table (receipt_id uuid, recording_result text, processing_state text)
language plpgsql security definer set search_path = '' as $function$
declare
  e private.payment_provider_events%rowtype;
  p public.booking_payments%rowtype;
  r private.payment_provider_receipts%rowtype;
  inserted_id uuid;
  payment_correlation uuid;
  booking_correlation uuid;
  amount_value bigint;
  success_at timestamptz;
begin
  -- Establish provider evidence before attempting optional VV correlation.
  select * into e from private.payment_provider_events x where x.id = event_id;
  perform private.validate_normalized_payment_event(e.payload);
  -- This is the initial Stripe adapter contract, not a provider-neutral guess
  -- that any event with an amount is evidence of successful collection.
  if e.provider <> 'stripe' or e.event_type <> 'payment_intent.succeeded'
    or not (e.payload ?& array['provider_payment_id', 'provider_charge_id', 'amount_minor', 'currency_code', 'provider_succeeded_at'])
    or (e.payload ->> 'provider_payment_id') !~ '^pi_[A-Za-z0-9]+$'
    or (e.payload ->> 'provider_charge_id') !~ '^ch_[A-Za-z0-9]+$'
    or (e.payload ? 'destination_account_id' and (e.payload ->> 'destination_account_id') !~ '^acct_[A-Za-z0-9]+$') then
    raise exception 'Verified success evidence required' using errcode = '23514';
  end if;
  amount_value := (e.payload ->> 'amount_minor')::bigint;
  success_at := to_timestamp((e.payload ->> 'provider_succeeded_at')::double precision);
  if e.payload ? 'payment_id' then
    payment_correlation := (e.payload ->> 'payment_id')::uuid;
    select * into p from public.booking_payments where id = payment_correlation;
    if p.id is not null then
      -- Foreign keys lock rows too: retain booking -> payment -> event order.
      perform b.id from public.bookings b where b.id = p.booking_id for key share;
      select * into p from public.booking_payments bp where bp.id = payment_correlation for share;
    end if;
    if p.id is not null and p.provider = e.provider
      and p.integration_environment is not distinct from e.integration_environment
      and p.organization_payment_account_id is not null
      and (p.provider_payment_id is null or p.provider_payment_id = e.payload ->> 'provider_payment_id')
      and p.provider_destination_account_id is not distinct from (e.payload ->> 'destination_account_id')
      and p.amount_minor = amount_value and p.currency_code = e.payload ->> 'currency_code' then
      booking_correlation := p.booking_id;
    else
      -- Unsafe correlation must not erase genuine collected-money evidence.
      -- Both IDs remain unknown; later reconciliation decides disposition.
      payment_correlation := null;
      booking_correlation := null;
    end if;
  end if;
  -- Identity/payload are immutable; recheck the active lease after taking locks.
  e := private.lock_payment_provider_event_claim(event_id, claim_token);
  insert into private.payment_provider_receipts(payment_id, booking_id, source_event_id, provider,
    integration_environment, provider_account_scope, provider_payment_id, provider_charge_id,
    destination_account_id, amount_minor, currency_code, provider_succeeded_at)
  values (payment_correlation, booking_correlation, e.id, e.provider, e.integration_environment,
    e.provider_account_scope, e.payload ->> 'provider_payment_id', e.payload ->> 'provider_charge_id',
    e.payload ->> 'destination_account_id', amount_value, e.payload ->> 'currency_code', success_at)
  on conflict on constraint payment_provider_receipts_charge_unique do nothing returning id into inserted_id;
  select * into r from private.payment_provider_receipts x where x.provider = e.provider
    and x.integration_environment = e.integration_environment and x.provider_account_scope = e.provider_account_scope
    and x.provider_charge_id = e.payload ->> 'provider_charge_id';
  if r.id is null or row(r.provider_payment_id, r.destination_account_id,
    r.amount_minor, r.currency_code, r.provider_succeeded_at)
    is distinct from row(e.payload ->> 'provider_payment_id',
    e.payload ->> 'destination_account_id', amount_value, e.payload ->> 'currency_code', success_at) then
    raise exception 'Conflicting provider receipt evidence' using errcode = '23514';
  end if;
  -- Evidence exists, but financial reconciliation is NOT complete. Clear the
  -- consumed claim and return this event to the queue for a future reconciler.
  update private.payment_provider_events x set receipt_id = r.id, processing_status = 'receipt_recorded',
    claim_token = null, lease_expires_at = null, next_attempt_at = clock_timestamp(),
    last_error_code = null, processing_error = null where x.id = e.id;
  return query select r.id, case when inserted_id is null then 'existing' else 'recorded' end, 'receipt_recorded'::text;
end;
$function$;

-- Explicit ownership and ACLs: private helpers/tables are not direct APIs.
alter function private.validate_normalized_payment_event(jsonb) owner to postgres;
alter function private.validate_payment_provider_event_insert() owner to postgres;
alter function private.validate_payment_provider_event_update() owner to postgres;
alter function private.protect_payment_provider_receipt() owner to postgres;
alter function private.lock_payment_provider_event_claim(bigint, uuid) owner to postgres;
revoke all on function private.validate_normalized_payment_event(jsonb),
  private.validate_payment_provider_event_insert(), private.validate_payment_provider_event_update(),
  private.protect_payment_provider_receipt(), private.lock_payment_provider_event_claim(bigint, uuid)
  from public, anon, authenticated, service_role;

alter function public.ingest_payment_provider_event(text, text, text, text, text, timestamptz, jsonb) owner to postgres;
alter function public.claim_payment_provider_events(integer) owner to postgres;
alter function public.fail_payment_provider_event(bigint, uuid, text) owner to postgres;
alter function public.review_payment_provider_event(bigint, uuid, text) owner to postgres;
alter function public.record_payment_provider_receipt(bigint, uuid) owner to postgres;
revoke all on function public.ingest_payment_provider_event(text, text, text, text, text, timestamptz, jsonb),
  public.claim_payment_provider_events(integer), public.fail_payment_provider_event(bigint, uuid, text),
  public.review_payment_provider_event(bigint, uuid, text), public.record_payment_provider_receipt(bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_payment_provider_event(text, text, text, text, text, timestamptz, jsonb),
  public.claim_payment_provider_events(integer), public.fail_payment_provider_event(bigint, uuid, text),
  public.review_payment_provider_event(bigint, uuid, text), public.record_payment_provider_receipt(bigint, uuid)
  to service_role;

comment on table private.payment_provider_receipts is
  'Append-only verified collection evidence. Unresolved does not mean booked, paid installment, or refund arranged.';
comment on column private.payment_provider_events.provider_account_scope is
  'Verified source account context; Stripe platform acct_* for destination-charge events, distinct from destination account.';
comment on function public.claim_payment_provider_events(integer) is
  'Bounded leased queue claim. Commit before provider I/O. receipt_id signals evidence awaiting future financial reconciliation.';
