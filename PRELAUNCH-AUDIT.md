# Cönëct pre-launch audit — October 14 source

**Source of truth:** uploaded `Conect.zip` from October 14, 2026. The older `Conect-fixed.zip` was not used as the source. This ZIP is an incremental repair, not a claim that the app is launch-ready.

## Changes applied

### Vendor verification reliability pass (October 15)
- Made admin document review atomic: the document review decision and the corresponding vendor/courier profile status now commit or roll back together. This prevents a partial database failure from leaving the document marked approved while the application profile remains in a different state.
- Made vendor approval atomic: the vendor record is locked while approval requirements are checked; orientation completion, timestamp, confirming admin, notes, and the approval flag are persisted in one transaction. A failed check or database update cannot leave the vendor approved without the orientation record.
- Kept the existing policy aligned with the current no-CAC launch constraint: government ID, applicable food-safety approval for food vendors, and recorded in-person orientation are required; the business registration number remains optional rather than falsely treating CAC registration as mandatory.
- Extended the vendor integration test to assert that the orientation record and admin attribution are persisted, and that admin suspension clears the vendor approval flag.
- Validation: backend and test JavaScript syntax checks pass. `npm test` was invoked but skipped the database-backed suite because `TEST_DATABASE_URL` is not configured; this is not an integration-test pass.

### Additional completion pass (October 15)
- Authentication now reloads the user's current role and active state from PostgreSQL on protected requests, so changing a role or deactivating an account invalidates stale tokens.
- Added a customer account-deletion endpoint that blocks deletion while orders are active, deactivates the account, anonymises core profile fields, and removes push tokens. Added a customer privacy screen to request deletion.
- Added configurable circular no-delivery zones with admin create/edit/enable/delete controls. Both delivery quotes and final order placement reject addresses inside enabled zones; when zones exist, checkout requires saved GPS coordinates.
- Added one-per-order customer ratings (1–5 stars plus optional comment), allowed only for the customer’s own paid, delivered order, with a rating action on the tracking screen.
- Fixed admin middleware initialization order and corrected vendor approval to actually check the vendor business type when applying the food-safety requirement.
- Added integration tests for delivery-zone enforcement, rating ownership/eligibility, and role/account invalidation. These tests are written but require `TEST_DATABASE_URL` to execute.
- Changed database migration behaviour so fictional demo stores/products are no longer loaded automatically; set `SEED_DEMO_DATA=true` only for a disposable test database.
- Added vendor and courier profile forms plus private document-upload screens for government ID, food-safety certificate, driving licence, and vehicle registration (where applicable). Files are size/type checked, encrypted with AES-256-GCM before PostgreSQL storage, and downloadable only by admin accounts.
- Added an admin Documents review screen. Reviewing the actual file updates the application status; vendor/courier approval now requires the latest required documents to be approved and the orientation flag to be completed. Orientation confirmations record the reviewing admin, timestamp, and notes.
- Added a courier onboarding screen so unapproved couriers can complete their profile and upload documents instead of being trapped on a 403 jobs screen.
- Added GPS capture for vendor store registration and nearby-store filtering (15 km default) in the customer home screen. Checkout now requires GPS for both the store and delivery address and always calculates distance-based delivery fees; stores without a GPS location cannot be checked out from.
- Corrected order handoff: vendors move paid orders from placed → preparing → ready, and couriers are offered only paid, ready orders. Courier status buttons now cover pickup and delivery rather than food preparation.
- Added persistent order refund status and admin reconciliation controls, preventing duplicate refund requests while a refund is requested/processing/completed. Customer support tickets can now be linked to an order from the support screen.

### Security, orders, and payments
- Added a courier approval flag and migration path; unapproved couriers cannot list, accept, advance, or share delivery jobs/location.
- Excluded unapproved couriers from automatic dispatch and courier notifications.
- Added admin courier approve/suspend control.
- Hardened Paystack callback messaging so it does not claim payment succeeded without verification.
- Prevented payment verification from marking a cancelled order paid.
- Improved checkout address-load error handling with a retry action.
- Fixed push-notification listener cleanup across sign-out/sign-in.
- Added a customer-role guard in the customer app.
- Added distance-based delivery pricing requiring both store and saved-address GPS coordinates. Defaults are base ₦300 + ₦180/km, minimum ₦300; admins can update these values in the admin Settings screen. Checkout is blocked if either location is missing.

### Vendor onboarding and operations
- Added vendor as a backend role, with a vendor-approval gate.
- Added vendor business profile endpoint and vendor store creation.
- Added vendor product create/update/availability endpoints scoped to the vendor's own store.
- Added vendor order listing and store open/close control.
- Added admin vendor list and review endpoint.
- Vendor approval is blocked unless a profile exists, government ID status is approved, required food-safety status is approved for food vendors, and orientation is recorded as completed.
- Added a separate Flutter `vendor_app` for vendor registration/login, profile completion, product management, store availability, and order viewing.

### Payment reliability pass (October 15)
- Added a `payment_attempts` table to record each server-created Paystack checkout reference and expected kobo amount.
- Checkout references now use cryptographically generated unique IDs and are recorded before calling Paystack. Invalid initialization responses are rejected.
- Payment verification now requires Paystack's returned reference to match the requested reference, a recorded checkout attempt to exist, the attempt's order ID to match Paystack metadata, and the verified amount/currency to match the recorded NGN amount.
- Order row locking prevents two successful payment attempts from both being applied as the order's primary payment. If an older/duplicate attempt succeeds after cancellation or another attempt has paid the order, the backend requests a refund for that extra charge and records the attempt's refund state separately.
- Added integration coverage for amount mismatch and a successful charge arriving after order cancellation. The tests are written but were not executed because no `TEST_DATABASE_URL` was configured.

### Courier handoff details (October 15)
- Courier available-order cards now include the vendor pickup address when available, rather than showing only the customer destination.
- Once a courier accepts an order, the active-job API returns the pickup address/GPS and customer phone number for that assigned courier only; the courier screen displays these details.
- Added an integration assertion for assigned-courier phone and pickup GPS visibility. It is written but still requires `TEST_DATABASE_URL` to execute.

### Support and refund escalation
- Added customer support tickets, ticket replies/messages, support-agent role, and admin-only support-agent creation.
- Added support-agent ticket status updates; support agents cannot issue refunds.
- Added an admin support queue, ticket review/status updates, and a Paystack refund-request action for tickets linked to a verified paid order.
- Refund status is tracked as requested/failed/etc.; Paystack settlement still needs confirmation in the Paystack dashboard.
- Added a customer support screen and ticket-thread UI in the customer Flutter app.

### Branding
- Added the approved cönëct green/orange palette and cream splash/loading treatment to the existing customer and courier Flutter apps, with “Order. Track. Receive.”

## Validation performed

- `node --check` passed for backend JavaScript and integration test files after the payment reliability pass. `npm test` was invoked, but the API suite was skipped because `TEST_DATABASE_URL` is not configured; this is not a passing integration-test result. The admin panel inline JavaScript check was performed in the previous pass.
- Integration tests (including an email verification flow test) require `TEST_DATABASE_URL`; they are skipped when no disposable test database is configured. No database-backed test result is claimed.
- Flutter/Dart tooling is not installed in this environment; the customer, courier, and new vendor Flutter apps have **not** been compiled or analyzed here.
- No production Paystack transaction, webhook delivery, push notification, GPS device test, or live deployment test was performed.

## Remaining launch blockers

1. **Document upload needs real device and database validation.** The source now supports private encrypted file storage and admin review, but file-picker behaviour, encryption-key configuration/backup, upload limits, download permissions, and recovery must be tested on actual iOS/Android devices and a disposable PostgreSQL database before collecting real identity documents.
2. **Phone OTP is intentionally deferred. Email verification is now implemented.** Production registration sends a single-use, 24-hour email link through Resend; login is blocked until verification, and resend is rate-limited. Before launch, configure a verified Resend sender, `RESEND_API_KEY`, `EMAIL_FROM`, and HTTPS `PUBLIC_URL`, then test real delivery and expired/reused links. Phone/SMS/WhatsApp verification is not included in this launch scope.
3. **Delivery zones need database-backed testing and configuration.** The zone schema and admin screen are now present, but no-delivery areas must be entered by an admin and the integration tests must pass against a disposable database. GPS permissions and device location behaviour also need testing.
4. **Courier orientation still needs operational validation.** The admin review now records the confirming admin, timestamp, and notes, but the in-person training checklist/process must be defined and tested before launch.
5. **Vendor/courier earnings ledger and automated payouts are absent.** No Paystack Transfers workflow exists. Do not promise automatic payouts yet; define commission, courier pay, and payout rules before implementing this financial workflow.
6. **Support is ticket-based, not a real-time chat.** Refund requests can be sent to Paystack by admin, but refund settlement must be verified and reconciled manually in the Paystack dashboard.
7. **Customer ratings and account deletion are implemented in source but not yet integration-tested.** Publish the privacy policy, terms, retention policy, and support/refund policy; review account-deletion retention rules before production.
8. **Flutter platform/build setup is incomplete.** The ZIP contains Dart source and pubspec files but no generated Android/iOS platform directories, Firebase app configuration, or release build artifacts. Generate platform folders, configure permissions/Firebase, and use a production HTTPS `API_URL` before building.
9. **Production configuration remains operator work.** Set a strong `JWT_SECRET`, production PostgreSQL URL, Paystack secret/webhook configuration, HTTPS `PUBLIC_URL`, `DOCUMENT_ENCRYPTION_KEY` (generate once with `openssl rand -hex 32` and back it up securely), CORS if a browser client needs it, backups, and monitoring. Never put Paystack secret keys in Flutter code or this ZIP.
10. **Database migration and end-to-end tests remain outstanding.** The new `payment_attempts` table must be applied to the disposable test database and validated before production. Verify Paystack refund requests and settlement using provider test mode; the code cannot confirm that a refund has settled just because Paystack accepted the request. Apply schema changes to a disposable test database first, run the integration suite, and test role boundaries, checkout, refunds, zones, ratings, GPS, document encryption, vendor order preparation, and mobile screens before production.
11. **Vendor app build/UX verification remains outstanding.** Its source is included, but no Flutter build could be run here. Confirm the app compiles and test vendor registration/profile/product/order flows on Android before using it.

## Release recommendation

**Not ready for public launch yet.** This repair adds meaningful vendor and support flows while preserving the original customer/courier structure, but the remaining blockers and unrun integration/mobile tests must be resolved before inviting real customers or processing real payments.


## Vendor commission (pre-deployment update)
- Default vendor commission is configurable and seeded at 10%.
- Commission is calculated on the food subtotal only; delivery fee is excluded.
- Each new order snapshots commission rate, commission amount, and vendor net amount. Changing the admin setting does not rewrite existing orders.
- Admin panel exposes the commission percentage under Settings (0–50%).
- This records the commission calculation only; automated Paystack Transfers/payouts are still not implemented and must not be described as complete.

## Phase 8 — Admin/support refund safety (2026-10-15)
- Updated the admin support-ticket refund endpoint to claim an order/ticket refund as `processing` inside a PostgreSQL transaction with row locks before calling Paystack.
- Concurrent admin clicks should not submit the same refund twice while the first request is processing.
- If Paystack returns an error or the network result is uncertain, the endpoint deliberately leaves the refund in `processing` and instructs an admin to reconcile in Paystack before retrying. This avoids an unsafe automatic retry after a possibly successful provider request.
- On a confirmed provider response, the order and support-ticket statuses are updated in a database transaction.
- Verification in this environment: JavaScript syntax and archive integrity only. This does not replace running integration tests against a disposable PostgreSQL database or testing against Paystack test mode.


## Phase 13 — Paystack webhook processing (October 15)
- Fixed a concrete defect: the prior webhook endpoint verified the signature but returned success without waiting for processing; it launched `confirmPayment` in the background and could acknowledge the event before payment state was committed.
- The handler now verifies the HMAC with a timing-safe comparison and awaits the existing server-side verification flow. Unknown signed events are acknowledged without changing payment state; transient processing failures return HTTP 500 for provider retry.
- Extended the integration test to check payment status and duplicate event delivery. The test is written but has not run because no disposable PostgreSQL test database is configured.
