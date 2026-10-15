# Phase 13 — Paystack webhook processing

## Change
The previous webhook handler verified the HMAC signature and returned HTTP 200, but did not process `charge.success`. If a customer paid and never returned through the browser redirect, the order could remain unpaid until another code path verified it.

The handler now validates the signature using a timing-safe comparison, parses the raw JSON body, handles only `charge.success`, extracts the transaction reference, and calls the existing server-side Paystack verification path. That path still checks the provider response against a server-created checkout attempt, order metadata, amount, and NGN currency. Transient verification/database errors return HTTP 500 so the provider can retry; repeated deliveries are intended to be idempotent.

## Validation
- `node --check src/server.js` passed.
- `node --check test/api.test.js` passed.
- `npm test` was invoked, but the suite was skipped because `TEST_DATABASE_URL` is not configured. The webhook integration test therefore has **not** executed.
- No live or Paystack test-mode webhook was sent.

## Required next checks
Run the API integration suite against a disposable PostgreSQL database; test a valid signature, invalid signature, duplicate delivery, unknown event, verification mismatch, and temporary Paystack/database failure. Configure the exact HTTPS webhook URL in Paystack before launch. This change does not make the app launch-ready by itself.
