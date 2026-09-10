-- Append generic discovery capacity while preserving the public catalog boundary.
-- Expand the three declared capacities into rows; MAX ignores NULL values and
-- returns NULL for no active spaces or for entirely unknown capacities.
create or replace view public.catalog_venues
with (security_barrier = true)
as
select
  v.id,
  v.name,
  v.slug,
  v.description,
  v.timezone,
  v.default_currency_code,
  v.published_at,

  va.address_line_1,
  va.address_line_2,
  va.city,
  va.region,
  va.postal_code,
  va.country_code,
  va.latitude,
  va.longitude,

  (
    select max(capacity.value)
    from public.spaces as s
    cross join lateral (
      values
        (s.seated_capacity),
        (s.standing_capacity),
        (s.theatre_capacity)
    ) as capacity(value)
    where s.venue_id = v.id
      and s.status = 'active'
  ) as maximum_capacity

from public.venues as v
left join public.venue_addresses as va
  on va.venue_id = v.id

where v.status = 'published'
  and v.published_at is not null;

-- Reassert the existing public-facing privileges without widening access.
revoke all on table public.catalog_venues
  from public, anon, authenticated;

grant select on table public.catalog_venues
  to anon, authenticated;
