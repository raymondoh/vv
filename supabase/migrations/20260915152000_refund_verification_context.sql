-- Read-only historical verification, NOT authorization to execute a refund.
-- Does not require current integration activation or a worker claim.
create function public.get_payment_refund_verification_context(target_obligation_id uuid)
returns table (
 obligation_id uuid, provider text, integration_environment text,
 provider_account_scope text, provider_refund_id text, provider_payment_id text,
 provider_charge_id text, amount_minor bigint, currency_code text,
 booking_id uuid, payment_id uuid, correlation_status text, candidate_count bigint
)
language sql stable security definer set search_path='' as $$
 select o.id,o.provider,o.integration_environment,o.provider_account_scope,
   o.provider_refund_id,o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code,
   o.booking_id,o.payment_id,
   case when o.booking_id is null and o.payment_id is null then 'uncorrelated'
     when p.id is not null and b.id is not null and p.booking_id=o.booking_id
       and row(p.provider,p.integration_environment,p.provider_payment_id,p.provider_charge_id,p.amount_minor,p.currency_code)
         is not distinct from row(o.provider,o.integration_environment,o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code)
       then 'matched' else 'mismatch' end,
   (select count(*) from private.payment_refund_obligations x
     where row(x.provider,x.integration_environment,x.provider_account_scope,x.provider_payment_id,x.provider_charge_id,x.amount_minor,x.currency_code)
       = row(o.provider,o.integration_environment,o.provider_account_scope,o.provider_payment_id,o.provider_charge_id,o.amount_minor,o.currency_code))
 from private.payment_refund_obligations o
 left join public.booking_payments p on p.id=o.payment_id
 left join public.bookings b on b.id=o.booking_id
 where o.id=target_obligation_id;
$$;
alter function public.get_payment_refund_verification_context(uuid) owner to postgres;
revoke all on function public.get_payment_refund_verification_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_payment_refund_verification_context(uuid) to service_role;
comment on function public.get_payment_refund_verification_context(uuid) is
 'Trusted read-only refund verification facts. No lease, activation, provider credentials, or refund execution authority. Reconciliation rechecks current identity under locks.';
