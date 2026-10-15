# Cönëct

A Glovo-style delivery platform based on the October 14, 2026 `Conect.zip` source.

- `backend/` Node.js + Express + PostgreSQL API, Paystack payments, dispatch, push, admin/support panel, schema and integration tests.
- `customer_app/` Flutter customer app with stores, cart, orders, tracking and support tickets.
- `courier_app/` Flutter courier app with approval-gated delivery work.
- `vendor_app/` Flutter vendor registration, onboarding profile, product management, store availability and order list.
- `PRELAUNCH-AUDIT.md` tracks changes, test limitations, and launch blockers.

Start with `backend/README.md` and `backend/DEPLOY.md`. Run each Flutter app's `flutter pub get` then `flutter run --dart-define=API_URL=https://YOUR-API-HOST`. Flutter platform folders are not included; generate them inside each app before building APK/iOS releases. Use a disposable PostgreSQL database for integration tests as documented in `backend/README.md`.

**This source is not yet production-ready.** See the audit for document upload, identity verification, delivery zones, payouts, production configuration, and required test gaps.


## Pre-deployment status

This source is an incremental pre-launch repair, not yet a release candidate. The latest pass adds database-backed authorization checks, customer account deactivation/anonymisation, admin-managed circular no-delivery zones and delivery pricing, order ratings, encrypted verification document uploads/review, GPS-gated nearby stores and checkout, vendor-controlled preparation stages, courier offer gating, refund reconciliation, and opt-in-only demo seeding. See `PRELAUNCH-AUDIT.md` for remaining blockers and validation limits.


## Vendor commission defaults
- Admin-configurable default: 10% of the food subtotal only (delivery fee excluded).
- Change it in Admin Panel → Settings → Vendor commission.
- Every order snapshots its commission rate, commission amount, and vendor net amount. Future rate changes do not alter existing order records.
- This does not implement automated vendor payouts; Paystack Transfers remain a separate pre-launch task.
