# Cönëct Phase 10 — Refund Consistency

## Scope
This phase consolidates the three backend entry points that can request an order refund:
- customer cancellation (`POST /orders/:id/cancel`)
- admin cancellation (`POST /admin/orders/:id/cancel`)
- admin support-ticket refund (`POST /admin/support/tickets/:id/refund`)

All now call the shared `requestOrderRefund` helper. It locks the order row, checks that payment was verified and a Paystack transaction reference exists, claims the refund by setting `processing` before calling Paystack, and updates linked support tickets consistently. If Paystack's response is uncertain, the refund remains `processing`; the code does not automatically submit another refund. Existing `failed` and `rejected` states also require manual reconciliation rather than automatic resubmission.

## Checks performed
- `node --check src/server.js` — passed.
- `node --check test/api.test.js` — passed.
- `npm test` — command completed, but the API suite was skipped because `TEST_DATABASE_URL` is not set. No database integration tests ran.
- ZIP integrity — checked after packaging.

## Important limitations
This is a source-level improvement, not a live payment certification. Before launch, configure a disposable PostgreSQL database and run the API tests, test Paystack in test mode, and confirm refund settlement behavior in the Paystack dashboard. Do not manually change an uncertain `processing` refund to `none` or retry it until the provider dashboard has been reconciled.
