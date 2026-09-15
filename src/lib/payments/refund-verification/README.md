# Trusted refund verification foundation

No route, Server Action, scheduler, refund creator, or webhook is deployed here.
`verifyHistoricalRefund` requires an explicit ordinary or compensation target and is callable only by trusted server code. It uses native
fetch with Stripe API `2025-02-24.acacia`; every provider call is GET. Tests inject
HTTP responses and never call Stripe.

The credential route is explicitly configured test-platform-only. `/v1/account`
must prove the configured account before any refund lookup. Refund and Charge
use the same credentials. Charge.livemode proves the expected mode. No NULL
scope, connected-account fallback, metadata matching, or provider search exists.
A future connected-account route requires separate approval and tests.

Future authenticated webhook triggers must use the same mandatory re-fetch.
This stage records provenance as `api_retrieval`, never a caller-asserted webhook.
No signature verifier or durable webhook inbox is implied.

Database context read, provider HTTP, evidence recording, and reconciliation are
separate operations. No row locks span HTTP. If recording commits and subsequent
reconciliation fails, the returned receipt ID remains retryable; rerunning the
same verification is idempotent. Unknown provider truth may remain unresolved.
Known-target mismatches return manual review without forcing an association or
persisting the mismatched observation automatically. The separate
`recordHistoricalRefundEvidence` entry records evidence only and never calls either
financial application RPC. Missing targets cannot select compensation.

The context RPC does not consult integration activation or worker leases and
cannot authorize execution. Immutable identity and current state are rechecked
by B3B2 during reconciliation. A stale worker claim is consumed by verified
success; later worker operations must obey the existing rejection contract.

`rpc.ts` uses an explicit narrow type overlay for the not-yet-applied RPCs. The
generated public database types are unchanged. Replace the overlay only after
authorized migration application and type regeneration.

Run focused tests:

    node --conditions=react-server --import tsx --test src/lib/payments/refund-verification/*.test.ts

The react-server condition permits importing server-only modules in Node tests;
it does not remove production client-import protection.

B4A retires legacy ordinary confirmation. B4B verifies only already-bound ordinary
requests and applies canonical evidence through B4A. A future creator still needs durable ambiguous-dispatch and
bounded idempotency recovery; CreationRecovery defines vocabulary, not permission
to retry indefinitely. No payment execution is activated by this foundation.


## Explicit application boundary

`VerificationRequest.target` is exactly `{ kind: 'ordinary', refundRequestId }` or
`{ kind: 'compensation', obligationId }`. An observed refund ID is a trigger, not
permission to assign a binding. Ordinary context must return the existing binding;
missing context stops before provider HTTP, conflicting binding stops without any
fallback. The read-only context RPC derives account/mode/charge/PaymentIntent from
one exact historical fulfilled collection. Expected refund amount comes from the
ordinary request, so partial refunds do not pretend to refund the full charge.

`recordVerified` shares the mandatory authenticated retrieval, pure verification
and committed canonical recording. Only then does the explicit target select
`apply_ordinary_refund_success` or `reconcile_payment_refund_success`. PostgreSQL
remains the financial authority. No provider HTTP spans a financial transaction.
B4A application requires its initially deferred constraint contract; one RPC runs
its full transaction before the client receives success.

Results distinguish `stage: provider`, `stage: evidence`, and `stage: application`.
Application results retain receipt/target identity on failures. `APPLIED` and
`ALREADY_APPLIED` are distinct; ordinary statuses/totals are historical application
snapshots and may differ from current aggregates after later refunds. Every replay
still re-fetches provider truth. The result does not expose raw financial evidence,
provider payloads, secrets, or database messages.

Compensation `ordinary_applied` is a non-retryable `CROSS_WORKFLOW_CONFLICT`, with
both SQL shapes supported. Ordinary `EVIDENCE_CONSUMED` is a terminal target conflict:
the RPC does not identify the other consumer, so the adapter does not invent its
workflow. Missing/unattributable compensation success never counts as success for
the requested obligation. Evidence-only observations have no financial retry loop.
Retry dispositions are hints for a future bounded coordinator, not an implemented
worker or automatic retry loop. Provider pending/not-found/transient errors may be
retried; unsupported/failed/authentication/mismatch states require review. Malformed
application results fail closed and retain the known receipt for recovery.

B4B adds no refund creator, binding writer, webhook, scheduler, activation, or UI.
Normal ordinary execution remains blocked until an approved durable execution and
binding stage exists. The fixed Stripe reader and environment variables are unchanged.

Additional rollback test (requires local Docker; never applies migration history):

    python3 supabase/tests/run_ordinary_refund_verification_context.py

Its fixtures use the existing B4A rollback setup and restore deliberately damaged
historical test relationships/guards by savepoint rollback. No real Stripe calls.
