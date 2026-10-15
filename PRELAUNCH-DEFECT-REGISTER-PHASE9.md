# Cönëct pre-launch defect register — Phase 9

**Date:** 15 October 2026  
**Reviewed source:** Phase 8 Admin & Support ZIP (derived from the October 14 `Conect.zip`).  
**Purpose:** Static code review and release-blocker register. This is not a production certification.

## Validation performed in this pass

- `node --check` was run for all backend `.js` files in the package: passed.
- `npm test` was run: the test suite skipped because `TEST_DATABASE_URL` is not set. **Zero integration tests executed.**
- ZIP integrity was checked when preparing this package.
- Flutter/Dart builds, database integration, real Paystack calls, push notifications, and physical-device workflows were not run in this environment.

## Critical/high-priority defects and launch blockers

### P0 — Refund safety is inconsistent across entry points

The support-ticket refund endpoint claims the refund in a transaction and marks it `processing` before calling Paystack. In contrast, both `POST /orders/:id/cancel` and `POST /admin/orders/:id/cancel` send a Paystack refund directly and only update the database afterward. Concurrent cancellation requests or a network timeout after Paystack accepted the request could lead to duplicate or ambiguous refund requests. The customer cancellation endpoint also does not update a linked support ticket in the same transaction.

**Required before launch:** Route every refund initiation through one shared idempotent refund service; claim the refund in PostgreSQL with row locks before provider calls; preserve `processing` on uncertain provider outcomes; reconcile using the Paystack dashboard/API; test concurrent requests and timeout-after-acceptance cases.

### P1 — Database-backed tests have not run

The integration suite covers authentication/email verification, orders, pricing, zones, ratings, vendor order transitions, courier handoff, and payment edge cases, but none of those database assertions ran in this environment.

**Required:** Create a disposable PostgreSQL database whose URL includes `test`, run migrations/schema and `npm test`, capture the actual results, and fix failures. Do not point the test suite at production; the suite truncates tables.

### P1 — Mobile builds and platform setup are unverified

Customer, courier, and vendor Flutter sources are present, but Flutter/Dart tooling was unavailable during this pass. Android/iOS platform folders, runtime permissions, push notification setup, file-picker behaviour, deep links, and release configuration need validation.

**Required:** Generate/verify platform folders, run `flutter pub get`, `flutter analyze`, and Android release builds for each app; test installation and key flows on a real Android device. iOS requires its own Xcode/macOS build path.

### P1 — Real payment and webhook behaviour is unverified

Payment verification validates the server-created reference, order metadata, amount, currency, and order state. However, no Paystack test-mode transaction, webhook signature delivery, refund request, or settlement reconciliation was performed. The general cancellation endpoints are the specific inconsistency described in P0.

**Required:** Use Paystack test mode to test successful, failed, abandoned, duplicate, late-after-cancel, and amount-mismatch cases. Verify webhook signatures and idempotency. Confirm refunds in the provider dashboard before marking them completed.

### P1 — Identity-document handling must not be used with real users yet

The code encrypts uploaded verification documents before database storage, but key backup/recovery, file picker and MIME validation, access-control checks, download handling, database backup exposure, and key rotation have not been operationally tested.

**Required:** Test upload/review/download with test documents only, confirm non-admin access is denied, configure and securely back up the encryption key, and establish retention/deletion procedures before collecting identity documents.

### P1 — Production setup is incomplete

Email verification requires a verified Resend sender and production environment values. Database backups/restore, monitoring, HTTPS, secret management, CORS for any browser client, Firebase/push setup, and API URL configuration require deployment-specific verification.

**Required:** Complete the production environment checklist in `backend/DEPLOY.md` and `backend/README.md`; never put Paystack secret keys in Flutter or client-side code.

## Other operational gaps

- Phone OTP (SMS/WhatsApp) is not implemented; email verification is the current flow.
- Support is ticket/thread based, not live real-time chat.
- Vendor/courier automated payouts via Paystack Transfers are not implemented.
- Delivery no-go zones must be configured by an admin and tested against actual GPS coordinates.
- Vendor/courier in-person orientation needs a documented checklist and trained reviewer process.
- Privacy policy, terms, refund policy, cancellation policy, and retention policy need publication and review.
- The customer, vendor, courier, admin, and support UI controls still need a full manual button-to-API walkthrough on device; source inspection alone cannot prove every button works.

## Release decision

**NO-GO for public launch or live payments at this stage.** The most actionable next code fix is to unify customer/admin cancellation refunds with the transactional refund flow already used for support tickets. Then run database integration tests, build the Flutter apps, and execute the Paystack test-mode and device acceptance checklist.
