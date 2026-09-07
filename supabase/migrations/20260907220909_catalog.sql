-- VV Production Database
-- Migration 0005: venue catalogue hierarchy

-- ===========================================================================
-- venues
-- ===========================================================================
--
-- A venue always belongs to exactly one business organisation.
--
-- Venue slugs are unique within an organisation, not globally. Different
-- organisations may legitimately use the same venue slug.

create table public.venues (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  name text not null,
  slug text not null,

  description text null,

  timezone text not null,
  default_currency_code text not null,

  contact_email text null,
  contact_phone text null,

  status text not null default 'draft',
  published_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint venues_name_check
    check (
      char_length(trim(name)) between 1 and 200
    ),

  constraint venues_slug_check
    check (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 120
    ),

  constraint venues_timezone_check
    check (
      char_length(trim(timezone)) between 1 and 100
    ),

  constraint venues_currency_code_check
    check (
      default_currency_code ~ '^[A-Z]{3}$'
    ),

  constraint venues_status_check
    check (
      status in (
        'draft',
        'published',
        'archived'
      )
    ),

  constraint venues_published_at_check
    check (
      status <> 'published'
      or published_at is not null
    ),

  constraint venues_org_slug_unique
    unique (
      organization_id,
      slug
    )
);

comment on table public.venues is
  'Physical or commercial venues listed by an organisation on VV.';

comment on column public.venues.timezone is
  'IANA timezone used for venue-local scheduling and pricing, e.g. Europe/London.';

comment on column public.venues.default_currency_code is
  'Default ISO 4217 currency code for venue pricing, stored uppercase.';

comment on column public.venues.status is
  'Catalogue lifecycle: draft, published or archived.';


create index venues_organization_status_idx
  on public.venues (
    organization_id,
    status
  );

create index venues_publication_idx
  on public.venues (
    status,
    published_at desc
  )
  where status = 'published';


create trigger set_venues_updated_at
before update on public.venues
for each row
execute function private.set_updated_at();


alter table public.venues enable row level security;


-- ===========================================================================
-- venue_addresses
-- ===========================================================================
--
-- VV v1 models one canonical physical address per venue.
--
-- If we later need separate billing, correspondence or entrance addresses,
-- those should be modelled explicitly rather than overloading this record.

create table public.venue_addresses (
  venue_id uuid primary key
    references public.venues(id)
    on delete cascade,

  address_line_1 text not null,
  address_line_2 text null,

  city text not null,
  region text null,
  postal_code text null,

  country_code text not null,

  latitude numeric(9,6) null,
  longitude numeric(9,6) null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint venue_addresses_line_1_check
    check (
      char_length(trim(address_line_1)) between 1 and 200
    ),

  constraint venue_addresses_city_check
    check (
      char_length(trim(city)) between 1 and 120
    ),

  constraint venue_addresses_country_code_check
    check (
      country_code ~ '^[A-Z]{2}$'
    ),

  constraint venue_addresses_latitude_check
    check (
      latitude is null
      or latitude between -90 and 90
    ),

  constraint venue_addresses_longitude_check
    check (
      longitude is null
      or longitude between -180 and 180
    ),

  -- Coordinates must either both exist or both be absent.
  constraint venue_addresses_coordinate_pair_check
    check (
      (latitude is null and longitude is null)
      or
      (latitude is not null and longitude is not null)
    )
);

comment on table public.venue_addresses is
  'Canonical physical address for a VV venue.';

comment on column public.venue_addresses.country_code is
  'ISO 3166-1 alpha-2 country code, stored uppercase.';


create index venue_addresses_country_city_idx
  on public.venue_addresses (
    country_code,
    city
  );


create trigger set_venue_addresses_updated_at
before update on public.venue_addresses
for each row
execute function private.set_updated_at();


alter table public.venue_addresses enable row level security;


-- ===========================================================================
-- spaces
-- ===========================================================================
--
-- A space is the reservable physical inventory unit.
--
-- Booking inventory will later be enforced against spaces through
-- booking_space_allocations.

create table public.spaces (
  id uuid primary key default gen_random_uuid(),

  venue_id uuid not null
    references public.venues(id)
    on delete cascade,

  name text not null,
  slug text not null,

  description text null,

  square_meters numeric(10,2) null,

  seated_capacity integer null,
  standing_capacity integer null,
  theatre_capacity integer null,

  status text not null default 'active',

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spaces_name_check
    check (
      char_length(trim(name)) between 1 and 200
    ),

  constraint spaces_slug_check
    check (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 120
    ),

  constraint spaces_square_meters_check
    check (
      square_meters is null
      or square_meters > 0
    ),

  constraint spaces_seated_capacity_check
    check (
      seated_capacity is null
      or seated_capacity >= 0
    ),

  constraint spaces_standing_capacity_check
    check (
      standing_capacity is null
      or standing_capacity >= 0
    ),

  constraint spaces_theatre_capacity_check
    check (
      theatre_capacity is null
      or theatre_capacity >= 0
    ),

  constraint spaces_status_check
    check (
      status in (
        'active',
        'archived'
      )
    ),

  constraint spaces_sort_order_check
    check (
      sort_order >= 0
    ),

  constraint spaces_venue_slug_unique
    unique (
      venue_id,
      slug
    )
);

comment on table public.spaces is
  'Reservable physical spaces belonging to a VV venue.';

comment on column public.spaces.square_meters is
  'Canonical area value; imperial display values should be derived rather than separately stored.';

comment on column public.spaces.status is
  'Spaces with commercial history should normally be archived rather than deleted.';


create index spaces_venue_status_sort_idx
  on public.spaces (
    venue_id,
    status,
    sort_order
  );


create trigger set_spaces_updated_at
before update on public.spaces
for each row
execute function private.set_updated_at();


alter table public.spaces enable row level security;


-- ===========================================================================
-- space_layouts
-- ===========================================================================
--
-- Layouts describe supported configurations of a particular space.
--
-- A selected layout will later be snapshotted into the booking while the
-- booking item retains its relational FK to the original layout.

create table public.space_layouts (
  id uuid primary key default gen_random_uuid(),

  space_id uuid not null
    references public.spaces(id)
    on delete cascade,

  name text not null,

  layout_type text not null,

  description text null,

  capacity integer null,

  status text not null default 'active',

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint space_layouts_name_check
    check (
      char_length(trim(name)) between 1 and 120
    ),

  constraint space_layouts_type_check
    check (
      layout_type in (
        'theatre',
        'banquet',
        'boardroom',
        'classroom',
        'cabaret',
        'reception',
        'standing',
        'custom'
      )
    ),

  constraint space_layouts_capacity_check
    check (
      capacity is null
      or capacity >= 0
    ),

  constraint space_layouts_status_check
    check (
      status in (
        'active',
        'archived'
      )
    ),

  constraint space_layouts_sort_order_check
    check (
      sort_order >= 0
    )
);

comment on table public.space_layouts is
  'Supported event configurations for a specific venue space.';

comment on column public.space_layouts.layout_type is
  'Broad canonical layout category; name provides the venue-specific presentation.';


-- Prevent names differing only by case inside one space, e.g.
-- "Banquet" and "banquet".

create unique index space_layouts_space_name_uidx
  on public.space_layouts (
    space_id,
    lower(name)
  );


create index space_layouts_space_status_sort_idx
  on public.space_layouts (
    space_id,
    status,
    sort_order
  );


create trigger set_space_layouts_updated_at
before update on public.space_layouts
for each row
execute function private.set_updated_at();


alter table public.space_layouts enable row level security;