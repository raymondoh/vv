-- ============================================================================
-- VV typed commercial payment terms
-- ============================================================================
--
-- Core financial values belong in typed, validated columns rather than inside
-- flexible terms_jsonb.
--
-- Existing VV v1 commercial model:
--
--   commission_bps
--   deposit_bps
--   final_balance_due_days_before_event
--
-- Historical term versions are immutable once created, apart from the
-- deliberately supported effective_until change.
-- ============================================================================


-- ============================================================================
-- Add typed payment terms
-- ============================================================================
--
-- The temporary defaults safely backfill any pre-existing development rows.
-- They are removed immediately afterwards so every future commercial-term
-- version must specify its payment terms explicitly.
--
-- VV initial baseline:
--
--   deposit:       25%
--   final balance: 14 days before event
-- ============================================================================

alter table public.organization_commercial_term_versions
  add column deposit_bps integer not null default 2500,
  add column final_balance_due_days_before_event integer not null default 14;


alter table public.organization_commercial_term_versions
  alter column deposit_bps drop default,
  alter column final_balance_due_days_before_event drop default;


-- ============================================================================
-- Validation
-- ============================================================================
--
-- VV v1 deliberately requires both a positive deposit and a positive final
-- balance because the current payment lifecycle is deposit + final.
-- ============================================================================

alter table public.organization_commercial_term_versions
  add constraint organization_commercial_terms_deposit_bps_check
    check (
      deposit_bps between 1 and 9999
    ),
  add constraint organization_commercial_terms_final_due_days_check
    check (
      final_balance_due_days_before_event between 0 and 3650
    );


comment on column
  public.organization_commercial_term_versions.deposit_bps
is
  'Booking deposit percentage expressed in basis points; 2500 means 25 percent.';


comment on column
  public.organization_commercial_term_versions.final_balance_due_days_before_event
is
  'Whole calendar-day offset before the event start at which the final balance becomes due.';


-- ============================================================================
-- Commercial-term immutability
-- ============================================================================
--
-- The existing integrity trigger predates these columns, so recreate it with
-- the new typed financial terms included.
-- ============================================================================

drop trigger protect_commercial_term_identity
on public.organization_commercial_term_versions;


create trigger protect_commercial_term_identity
before update on public.organization_commercial_term_versions
for each row
execute function private.prevent_column_changes(
  'organization_id',
  'version_number',
  'commission_bps',
  'deposit_bps',
  'final_balance_due_days_before_event',
  'effective_from',
  'terms_jsonb',
  'created_at'
);


-- ============================================================================
-- Documentation
-- ============================================================================

comment on table public.organization_commercial_term_versions is
  'Versioned VV marketplace/commercial terms for an organisation. Core commission, deposit and final-balance rules are typed columns; additional wording/configuration remains in terms_jsonb.';
