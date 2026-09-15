# Ordinary refund execution foundation

Internal server-only entry: `runOrdinaryRefundExecution(refundRequestId)`.
No route, UI, Server Action, scheduler, webhook or activation calls it. No Stripe
SDK is added. Tests inject HTTP; never run this entry against provider credentials
as part of validation. The existing test-platform credential resolver is reused.
Its previously documented read key may lack refund-write permissions: provider
write configuration and activation require separate approval.

## Durable contract

One private execution row belongs to one authorized ordinary request. The request
remains the authoritative provider refund binding. Exact historical fulfilled
collection evidence supplies account, environment, charge and PaymentIntent;
the ordinary request supplies the partial refund amount. No current pricing or
caller financial parameters participate. Private helpers/RPCs use postgres
ownership, SECURITY DEFINER and empty search paths; only service_role can execute
the four public RPCs. No role other than postgres gets direct execution storage.

`vv:<environment>:ordinary-refund:<request-uuid>:v1` and the complete create
contract are immutable. The 23-hour window begins at first possible dispatch
authorization, even if HTTP never starts. The window is a conservative VV policy,
not a provider guarantee. Attempts stop at 20; retry delays start at 30 seconds
and cap at one hour. Manual review never rotates a key or releases capacity.
Known IDs never create again: exhausted known-ID work may require manual review,
but cannot fall back to create. Both public failed/cancelled transitions are
blocked once execution exists; untouched requests keep their previous policy.

## Transactions and external work

Claim: booking -> payment -> ordered compensation obligations -> request ->
execution, with settings after financial locks. Claim commit precedes HTTP.
An active 120-second lease excludes other claims. A fresh token is required for
reclaim. A small DB freshness check runs after authenticated account preflight,
immediately before POST; the local deadline is checked again. Leases do not
promise exactly-once HTTP: a paused process can race expiry. The unchanged provider
idempotency key supplies external duplicate protection within the recovery window.
No database transaction spans HTTP. Integration deactivation blocks fresh create
authorization/checks; it cannot recall an in-flight request.

POST uses the pinned API version and only charge, amount, reverse_transfer=true,
refund_application_fee=true. No currency conversion, currency parameter, metadata,
free-text reason, connected-account fallback or provider search. Account identity
is verified before POST with the same explicit platform credential route.

A malformed response/timeout is uncertain, never evidence of no refund. Same-key
recovery is bounded by both attempt count and the fixed deadline. A late response
whose token expired cannot bind: return safe retry and retain the durable contract
for controlled same-key recovery. Past the horizon this needs manual provider
reconciliation; there is no automated search/binding or replacement-key path.

Attachment requires a valid token and immutable context, permits same-ID replay
under a fresh claim, rejects conflicts, clears the claim and schedules retrieval.
It may preserve a known response after deactivation. Existing provider+refund-ID
uniqueness is retained; scoped compensation binding is checked. No financial state
is changed by attachment. B4B re-fetch is mandatory even for a succeeded create
response. After attachment the immediate B4B handoff has no active create claim;
if it fails, the durable ready row allows the next retrieve claim to retry or
record terminal review. A retrieve worker reports its outcome under its own token.
No invocation loops or performs more than one POST.

B4A canonical application alone completes execution and clears outstanding claims.
Its existing deferred evidence/application constraints remain authoritative. No
worker mark-success RPC exists. Failed/canceled provider refunds remain reserved
in public processing/private review until a separately approved release policy.

## Validation and remaining work

Run:

    node --conditions=react-server --import tsx --test src/lib/payments/refund-execution/*.test.ts
    python3 supabase/tests/run_ordinary_refund_execution.py

The SQL harness installs missing prerequisites and this migration in rollback-only
transactions. It compares history, object existence, counts, guards, integration
and the genuine booking before/after. Temporary fixture time/guard changes never
commit. Generated database types are unchanged; an exact RPC overlay covers the
unapplied migration.

Real two-session claim/compensation/attachment/reclaim/application races and
provider test-mode execution remain deferred until separately authorized. A
visible-app checkpoint follows independent acceptance; live-money readiness is
not implied. No success, failure or concurrency result from mocked HTTP is
represented as a real provider test.

## Review corrections

Recognized attachment contradictions (23514/23505) are reported as the existing
safe IDENTITY_CONFLICT outcome under the current token before returning review.
This persists manual_review, clears ownership and retains public processing.
If reporting loses the lease or fails, the service returns retry, not a false
claim that review was persisted. Controlled same-key recovery must encounter and
recheck the unresolved binding conflict again; no stale-token override exists.

The freshness RPC rereads execution and checks database time after the settings
lock, independently of the application clock. The exact two-session settings-lock
race remains deferred while migrations are unapplied. Its rollback test injects
lease expiry at the post-lock boundary without replacing the authorization logic.
The normal pre-POST local check and paused-process limitation remain unchanged.

Provider-binding collision protection is directional: ordinary attachment rejects
an existing compensation binding. The older compensation path does not perform
the reciprocal ordinary check. This is not globally symmetric binding uniqueness;
canonical application exclusivity remains separate. No B3B1 redesign is included.
The rollback harness now compares each relevant trigger's exact enabled mode.
