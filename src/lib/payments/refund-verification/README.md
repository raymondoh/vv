# Trusted refund verification foundation

No route, Server Action, scheduler, refund creator, or webhook is deployed here.
`verifyHistoricalRefund` is callable only by trusted server code. It uses native
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
persisting the mismatched observation automatically.

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

Ordinary refund verification/confirm_payment_refund hardening remains a separate
pre-activation gate. A future creator also needs durable ambiguous-dispatch and
bounded idempotency recovery; CreationRecovery defines vocabulary, not permission
to retry indefinitely. No payment execution is activated by this foundation.
