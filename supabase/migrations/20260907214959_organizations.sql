-- VV Production Database
-- Migration 0004: organizations, memberships and commercial terms

-- ===========================================================================
-- organizations
-- ===========================================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),

  legal_name text not null,
  display_name text not null,
  slug text not null,

  company_number text null,
  tax_registration_number text null,

  country_code text not null,

  contact_email text null,
  contact_phone text null,

  status text not null default 'active',

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_legal_name_check
    check (char_length(trim(legal_name)) between 1 and 200),

  constraint organizations_display_name_check
    check (char_length(trim(display_name)) between 1 and 200),

  constraint organizations_slug_check
    check (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 120
    ),

  constraint organizations_country_code_check
    check (country_code ~ '^[A-Z]{2}$'),

  constraint organizations_status_check
    check (
      status in (
        'active',
        'suspended',
        'closed'
      )
    )
);

comment on table public.organizations is
  'Business organisations operating one or more venues on VV.';

comment on column public.organizations.slug is
  'Lowercase URL-safe organisation identifier.';

comment on column public.organizations.country_code is
  'ISO 3166-1 alpha-2 country code, stored uppercase.';


create unique index organizations_slug_uidx
  on public.organizations (slug);

create index organizations_created_by_user_id_idx
  on public.organizations (created_by_user_id)
  where created_by_user_id is not null;

create index organizations_status_idx
  on public.organizations (status);


create trigger set_organizations_updated_at
before update on public.organizations
for each row
execute function private.set_updated_at();


alter table public.organizations enable row level security;


-- ===========================================================================
-- organization_memberships
-- ===========================================================================
--
-- Membership roles are organisation-specific and intentionally independent
-- from platform_role_assignments.
--
-- A user may belong to multiple organisations.

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  user_id uuid not null
    references public.user_profiles(id)
    on delete cascade,

  role text not null,
  status text not null default 'active',

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  joined_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organization_memberships_role_check
    check (
      role in (
        'owner',
        'manager',
        'staff'
      )
    ),

  constraint organization_memberships_status_check
    check (
      status in (
        'active',
        'suspended'
      )
    )
);

comment on table public.organization_memberships is
  'Connects VV users to organisations with organisation-scoped roles.';

comment on column public.organization_memberships.role is
  'Organisation role only: owner, manager or staff.';


-- One current membership relationship per user per organisation.

create unique index organization_memberships_org_user_uidx
  on public.organization_memberships (
    organization_id,
    user_id
  );


-- Supports: "which organisations does this user belong to?"

create index organization_memberships_user_id_idx
  on public.organization_memberships (
    user_id
  );


-- Supports organisation dashboard/member queries.

create index organization_memberships_org_status_idx
  on public.organization_memberships (
    organization_id,
    status
  );


create trigger set_organization_memberships_updated_at
before update on public.organization_memberships
for each row
execute function private.set_updated_at();


alter table public.organization_memberships enable row level security;


-- ===========================================================================
-- organization_commercial_term_versions
-- ===========================================================================
--
-- VV commission and other organisation-specific marketplace terms are
-- versioned rather than overwritten.
--
-- A booking will later reference the exact term version that governed the
-- booking and will additionally snapshot the commercially relevant values.

create table public.organization_commercial_term_versions (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  version_number integer not null,

  commission_bps integer not null,

  effective_from timestamptz not null,
  effective_until timestamptz null,

  -- [start, end)
  --
  -- The generated PostgreSQL range gives us readable start/end columns for
  -- normal application use while also allowing the database to enforce that
  -- two commercial term versions never overlap.
  effective_during tstzrange
    generated always as (
      tstzrange(
        effective_from,
        effective_until,
        '[)'
      )
    ) stored,

  terms_jsonb jsonb not null default '{}'::jsonb,

  created_by_user_id uuid null
    references public.user_profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),

  constraint organization_commercial_terms_version_number_check
    check (version_number > 0),

  constraint organization_commercial_terms_commission_bps_check
    check (
      commission_bps between 0 and 10000
    ),

  constraint organization_commercial_terms_effective_dates_check
    check (
      effective_until is null
      or effective_until > effective_from
    ),

  constraint organization_commercial_terms_json_object_check
    check (
      jsonb_typeof(terms_jsonb) = 'object'
    ),

  constraint organization_commercial_terms_org_version_unique
    unique (
      organization_id,
      version_number
    ),

  constraint organization_commercial_terms_no_overlap
    exclude using gist (
      organization_id with =,
      effective_during with &&
    )
);

comment on table public.organization_commercial_term_versions is
  'Versioned VV marketplace/commercial terms for an organisation.';

comment on column public.organization_commercial_term_versions.commission_bps is
  'VV commission expressed in basis points; 1200 means 12 percent.';

comment on column public.organization_commercial_term_versions.effective_during is
  'Generated half-open validity range [effective_from, effective_until).';

comment on column public.organization_commercial_term_versions.terms_jsonb is
  'Additional versioned commercial wording/configuration; core financial values remain typed columns.';


-- Makes retrieval of the currently open-ended term version cheap and also
-- guarantees that at most one version has no end date.

create unique index organization_commercial_terms_open_ended_uidx
  on public.organization_commercial_term_versions (
    organization_id
  )
  where effective_until is null;


create index organization_commercial_terms_org_effective_from_idx
  on public.organization_commercial_term_versions (
    organization_id,
    effective_from desc
  );


alter table public.organization_commercial_term_versions
  enable row level security;