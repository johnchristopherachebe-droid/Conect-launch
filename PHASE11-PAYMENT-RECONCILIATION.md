# Cönëct Phase 11 — Payment refund reconciliation

## Defect found
The late/duplicate successful-payment handler previously retried a refund automatically when the prior attempt was recorded as `refund_failed`. A failed HTTP response does not prove Paystack did not process the request; retrying can therefore risk a duplicate refund.

## Change made
- Late/duplicate payment callbacks now submit a refund only on the first claimed attempt.
- If Paystack's response is uncertain, the attempt is recorded as `refund_failed` and subsequent callbacks do not automatically submit another refund.
- The code logs that the provider dashboard must be reconciled before a manual retry.
- Added an integration test intended to simulate an uncertain refund response and assert that a later callback does not issue a second request.

## Verification
- `node --check src/server.js` — passed.
- `node --check test/api.test.js` — passed.
- `npm test` — test suite is skipped because `TEST_DATABASE_URL` is not configured. The new integration test has **not** executed.
- Flutter/Dart and PostgreSQL CLI/server are not installed in this environment, so Flutter builds and database-backed end-to-end tests remain blocked.

## Remaining release blockers
1. Run the integration suite against a disposable PostgreSQL database whose name/URL contains `test`.
2. Confirm actual Paystack test-mode refund responses, including timeout and rejection handling.
3. Build and smoke-test customer, vendor, and courier Flutter apps.
4. Review the admin refund-status endpoint so only documented provider reconciliation can mark a refund completed.
