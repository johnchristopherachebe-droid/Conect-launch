# Cönëct backend

Node.js + Express + PostgreSQL REST API for the Cönëct delivery app.

## Run
    docker compose up -d        # start Postgres
    cp .env.example .env        # then set JWT_SECRET
    npm install
    npm run migrate             # creates tables; no demo stores by default
    npm run dev                 # http://localhost:3000

## Endpoints
| Method | Path | Who |
|---|---|---|
| POST | /auth/register, /auth/login | anyone (email verification required before login) |
| POST | /auth/resend-verification | anyone (rate limited; generic response) |
| GET | /auth/verify-email?token=… | anyone with a valid one-time email link |
| GET | /stores?category=&search=, /stores/:id | anyone |
| GET/POST | /addresses | signed in / customer |
| POST | /orders | customer |
| GET | /orders, /orders/:id | customer (own) |
| POST | /orders/:id/cancel | customer |
| GET | /courier/available | approved courier |
| POST | /courier/orders/:id/accept, /advance | courier |
| GET | /courier/active | approved courier |
| PUT | /courier/location | approved courier |
| POST | /orders/:id/pay | customer (returns Paystack checkout URL) |
| GET | /payment/done | Paystack redirect target |
| POST | /webhooks/paystack | Paystack only (signature checked; charge.success verified server-side) |
| POST | /devices, /devices/remove | signed in (push token registration) |
| GET/PUT | /vendor/profile | vendor |
| POST | /vendor/store | vendor with completed profile |
| GET/POST/PATCH | /vendor/products | approved vendor; own store only |
| GET | /vendor/orders | approved vendor; own store only |
| PATCH | /vendor/store | approved vendor (open/close) |
| GET/POST | /support/tickets | customer/support/admin (create is customer-only) |
| GET/POST | /support/tickets/:id/messages | ticket owner and support/admin |
| GET | /admin/vendors, /admin/support/tickets | admin |
| PATCH | /admin/vendors/:id/approval | admin (requires reviewed ID, applicable food safety, orientation) |
| POST | /admin/support/users | admin (creates support-agent account) |
| POST | /admin/support/tickets/:id/refund | admin (Paystack refund request) |

Send `Authorization: Bearer <token>` on protected routes.
Order status flow: placed → preparing → ready → picked_up → delivered.


## Email verification (required before login)

1. Create a free Resend account and verify a sender domain/address that Resend permits for production sending.
2. Set `RESEND_API_KEY`, `EMAIL_FROM` (for example `Cönëct <verify@your-domain.com>`), and `PUBLIC_URL=https://api.your-domain.com` in the backend environment. `PUBLIC_URL` must be the public HTTPS API origin because verification links open `/auth/verify-email` on the API.
3. Apply the schema safely with `npm run migrate`. The migration adds verification timestamp, hashed token, expiry, delivery-zone, rating, and account-status fields without deleting existing users. Demo stores are only seeded when `SEED_DEMO_DATA=true` is explicitly set in a disposable database.
4. New customer, vendor, and courier accounts receive a single-use verification link that expires after 24 hours. They cannot log in until they open it. The app offers a resend action; requests are rate limited and the response does not reveal whether an email is registered.
5. Test provider delivery, expired/reused links, and login rejection before launch. If the email provider is not configured, registration returns an explicit error instead of silently claiming an email was sent.

Keep the Resend API key only in backend environment variables. Email verification proves control of the email inbox; it does not replace vendor/courier identity checks or admin approval.

## Payments (Paystack, NGN)
1. Create a Paystack account and copy the **test** secret key into `.env` as `PAYSTACK_SECRET_KEY`.
2. In the Paystack dashboard (Settings > API Keys & Webhooks) set the webhook URL to `<PUBLIC_URL>/webhooks/paystack`.
3. Orders start unpaid. Couriers only see an order after Paystack confirms the payment. Each checkout attempt is recorded server-side and verification must match its exact reference, order, NGN currency, and amount.
4. If a successful payment arrives after its order was cancelled, or a second attempt succeeds after the order was already paid through another reference, the backend requests a refund for that extra charge. Review refund settlement in the Paystack dashboard; a request is not proof that money has returned.
5. Cancelling a paid order that has not started triggers a Paystack refund request. Test card numbers are in Paystack's docs. Switch to the live key only after your account is activated.

Prices are in naira. If you already ran the old migration, reset the database
(`docker compose down -v`, then up and `npm run migrate`) to load the optional sample naira prices only if `SEED_DEMO_DATA=true` is set.

## Admin panel
1. Register an account (in the customer app or `POST /auth/register`), then promote it:
       npm run make-admin you@example.com
2. Open `http://localhost:3000/panel` and sign in.

The panel shows live orders, manages stores/menu items, approves/suspends couriers, reviews vendor applications, and handles support tickets/refund requests. Vendor accounts are not approved automatically. For food vendors, admin review must record government ID approval, food-safety approval, and completed in-person orientation before the vendor can be approved. Vendor document files are not uploaded by this version; verify them securely outside the app before recording review status. Courier sign-up alone does not grant delivery access.

## Push notifications (Firebase)
1. Create a Firebase project and download a service-account key (Project settings > Service accounts).
2. Save it as `firebase-service-account.json` next to `package.json` and set `FIREBASE_SERVICE_ACCOUNT` in `.env`.
3. Run `npm install` and `npm run migrate` again (new `device_tokens` table).

Sent automatically: customer gets payment received, courier assigned, preparing, ready, on the way, delivered,
and cancelled. All couriers get "new order available" when an order is paid.
Without the key, everything still works; no notifications are sent.

## Courier matching
When an order is paid, the server offers it to the 3 nearest free couriers by push notification, waits 45 seconds,
then offers it to the next 3, and so on. A courier is "free" if they are online (location shared in the last
2 minutes) and have no delivery in progress. After 3 waves with nobody left to offer it to, every courier gets
one alert. Couriers can always claim any unassigned paid order from their list too.

Set each store's map location in the admin panel (Stores > Set) so couriers are ranked by distance to the store.
Without it, couriers are offered orders in no particular order. Run `npm run migrate` again for the new columns and table.
Tuning values are at the top of `src/dispatch.js`.

## Production
See `DEPLOY.md`: Docker + automatic HTTPS (Caddy), backups, rate limiting, and a pre-launch checklist.
Tests: `TEST_DATABASE_URL=postgres://conect:conect@localhost:5432/conect_test npm test` (needs a throwaway database whose name contains "test").

## Delivery fees

When both the store and customer's saved address have latitude/longitude, the order API calculates the fee using `DELIVERY_BASE_FEE` (default 300 NGN) + `DELIVERY_PER_KM` (default 180 NGN/km), with `DELIVERY_MIN_FEE` (default 300 NGN). If either GPS location is missing, it falls back to the store's configured flat fee. This version does not enforce delivery-zone boundaries; do not treat distance pricing as a no-delivery-zone feature.

## Vendor app

`../vendor_app/` is a separate Flutter vendor client. It supports vendor signup/profile, product availability and store/order views. It does not yet upload verification document files. Generate Flutter platform folders and test the app on an Android device before using it with real vendors.


### Private verification documents

Vendor and courier uploads accept JPG, PNG, or PDF files up to 2 MB. The API checks the file signature and encrypts file bytes with AES-256-GCM before writing them to PostgreSQL. Set `DOCUMENT_ENCRYPTION_KEY` to a securely stored 32-byte key encoded as 64 hexadecimal characters (generate with `openssl rand -hex 32`). **Back up this key securely and do not rotate or lose it without a re-encryption plan**; otherwise existing documents cannot be decrypted. Only admins can download submitted files. Validate the full upload/review flow on test accounts before requesting real identity documents.

### Demo data

`npm run migrate` creates/updates the schema but does not insert fictional stores or menu items. To seed a disposable local database intentionally, set `SEED_DEMO_DATA=true` for that migration run. Never enable this flag for production.


### Vercel backend hosting

The backend exports its Express app for Vercel's Node.js runtime. In Vercel, set the project Root Directory to `Conect/backend`; do not use the repository root because the repository also contains Flutter source folders. Add the environment variables from `.env.production.example` in Vercel Project Settings. Set `DATABASE_URL` to a PostgreSQL connection string from a database provider connected through the Vercel Marketplace, `PUBLIC_URL` to the deployed HTTPS API URL, and `FIREBASE_SERVICE_ACCOUNT_JSON` (if enabling push) to the JSON secret rather than a local file path. Keep Paystack and document-encryption keys server-side only.

The admin panel is also copied to `public/panel/index.html` for Vercel's static asset serving; keep it in sync with `src/admin/index.html` when changing the panel. In serverless deployments the courier app's polling endpoint advances dispatch waves; do not rely on an in-memory `setInterval` to run background work.
