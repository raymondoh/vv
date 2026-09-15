-- Historical identity only: no execution, binding assignment, activation or locks.
-- Missing binding and unsafe/ambiguous collection identity return zero rows.
create function public.get_ordinary_refund_verification_context(target_refund_id uuid)
returns table (
 refund_request_id uuid, payment_id uuid, booking_id uuid, provider_refund_id text,
 provider text, integration_environment text, provider_account_scope text,
 provider_payment_id text, provider_charge_id text, amount_minor bigint,
 currency_code text, request_status text
)
language sql stable security definer set search_path='' as $$
 select f.id,p.id,b.id,f.provider_refund_id,c.provider,c.integration_environment,c.provider_account_scope,
   c.provider_payment_id,c.provider_charge_id,f.amount_minor,f.currency_code,f.refund_status
 from public.payment_refunds f
 join public.booking_payments p on p.id=f.booking_payment_id and p.booking_id=f.booking_id
 join public.bookings b on b.id=f.booking_id
 cross join lateral (
   select r.*,count(*) over () as identity_count
   from private.payment_provider_receipts r
   where r.payment_id=p.id and r.booking_id=b.id and r.disposition='fulfilled'
     and row(r.provider,r.integration_environment,r.provider_payment_id,r.provider_charge_id,
       r.amount_minor,r.currency_code,r.provider_succeeded_at,r.destination_account_id)
     is not distinct from row(p.provider,p.integration_environment,p.provider_payment_id,p.provider_charge_id,
       p.amount_minor,p.currency_code,p.provider_success_at,p.provider_destination_account_id)
 ) c
 where f.id=target_refund_id and c.identity_count=1
   and f.provider=p.provider and f.currency_code=p.currency_code
   and f.provider_refund_id is not null and f.provider_refund_id ~ '^re_[A-Za-z0-9]+$';
$$;
alter function public.get_ordinary_refund_verification_context(uuid) owner to postgres;
revoke all on function public.get_ordinary_refund_verification_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_ordinary_refund_verification_context(uuid) to service_role;
comment on function public.get_ordinary_refund_verification_context(uuid) is
 'Read-only bound ordinary refund identity from exact historical settlement. Request amount is the expected refund amount. No current integration or lease authority; B4A independently rechecks application.';
