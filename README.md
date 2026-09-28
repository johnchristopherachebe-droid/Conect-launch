# cönëct

Full-stack marketplace app: React + Vite frontend, Express + Postgres backend. Built to run
as **one deployed service** — the backend serves the built frontend itself, so there's a
single app + a single Postgres database, both on one platform (e.g. one Railway project).

## Structure
- `/src` — customer, vendor, rider, admin, and support frontend (single-page app)
- `/backend` — Express API server (own `package.json`, own build step, but runs as part of
  the same deployed service — it serves the frontend's built files for every non-`/api` route)

## Local development

Run these in two terminals (frontend on Vite's dev server with hot reload, calling the
backend directly):

**Backend:**
```
cd backend
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, PAYSTACK_SECRET_KEY, SMTP_*, TERMII_*
npm install
npm run dev             # runs on PORT (default 3000)
```

**Frontend:**
```
cp .env.example .env    # set VITE_API_URL=http://localhost:3000 for local dev
npm install
npm run dev
```

## Deploying for free (one platform: frontend + backend + database)

**Railway** is the pick for a real 30-day free run: every new account gets a one-time **$5 in
usage credit that lasts 30 days**, no credit card needed to start, and none of the cold-starts
or file-storage quirks of always-free tiers (see the Render alternative below if you want to
stay on a free plan indefinitely instead, at the cost of those quirks).

### Steps (Railway)
1. Push this repo to GitHub.
2. On [railway.com](https://railway.com), sign up → **New Project** → **Deploy from GitHub repo**
   → select this repo. Railway reads the included `railway.json` for the build (`npm run build`)
   and start (`npm start`) commands, so it doesn't have to guess in this two-`package.json` layout.
3. In the same project: **+ New** → **Database** → **Add PostgreSQL**.
4. Open your web service → **Variables** tab → add `DATABASE_URL` with value
   `${{Postgres.DATABASE_URL}}` (Railway's reference syntax — it autocompletes as you type).
   Add the rest: `JWT_SECRET`, `PAYSTACK_SECRET_KEY`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
   `SMTP_PASS`/`SMTP_FROM`, `TERMII_API_KEY`/`TERMII_SENDER_ID`, `VAPID_PUBLIC_KEY`/
   `VAPID_PRIVATE_KEY` (see `backend/.env.example`).
5. Under the web service's **Settings → Networking**, click **Generate Domain** to get your
   `https://xxxx.up.railway.app` URL, then set `PUBLIC_API_URL` and `PUBLIC_APP_URL` (in
   Variables) to that exact URL and redeploy.

**After the 30 days:** the trial credit runs out and deployments pause until you add a payment
method (Hobby plan is $5/mo, and that $5 becomes a monthly usage credit rather than a one-time
grant — so ongoing cost is often $0-a-few-dollars for a small app, just no longer guaranteed
free). If you'd rather not put in a card at all when the trial ends, migrate to the Render
option below at that point — nothing about the app needs to change, just where it's hosted.

### Alternative: Render (free indefinitely, with trade-offs)
Render's free web service + free Postgres don't expire or need a card, but the web service
cold-starts after 15 minutes idle (~30-60s to wake up), the free database expires after 30 days
(needs recreating), and uploaded files aren't persisted on the free plan. This repo also
includes a `render.yaml` Blueprint for this path: **New +** → **Blueprint** → connect the repo
→ **Apply**, then set `PUBLIC_API_URL`/`PUBLIC_APP_URL` to the assigned `*.onrender.com` URL
and fill in the same secret env vars as above.

(`vercel.json` is left over from an earlier split frontend/backend setup — it's unused by
either path above and can be ignored or deleted.)

## Email + phone verification (mandatory)
Every account must verify both its email and phone number before it can use anything else in
the app. This is enforced on the backend itself (not just hidden in the UI): any authenticated
request from an unverified account is rejected with `403 { verificationRequired: true }`,
except the handful of routes needed to sign up, check status, and complete verification. The
frontend shows a dedicated verify screen right after signup and blocks entry into the app
until both checks pass; it's also reachable later from Settings → "Verify Email & Phone" (in
case someone closes the app mid-verification).

**Heads up for your own admin account:** this applies to every account, including the owner
admin (set via the `ADMIN_EMAILS` env var — see `backend/.env.example`). If you get locked out
during testing, you can mark yourself verified directly in the database:
```sql
UPDATE app_users SET email_verified = true, phone_verified = true WHERE email = 'you@example.com';
```

## Staff roles: Support and Dispatch
Besides the four self-serve roles (customer, vendor, rider) and the auto-bootstrapped admin,
there are two staff-only roles that can't be self-requested — an existing admin has to invite
them, from **Admin → Settings → Support Staff** or **→ Dispatch Staff**:
- **Support** handles tickets, refunds, and review moderation.
- **Dispatch** manages the live delivery queue — manually assigning or reassigning a rider to
  an order, and monitoring which riders are online — for when you don't want deliveries
  purely self-served by nearest-rider claim.

To onboard someone: invite them by email from the relevant admin screen, then have them sign up
normally, **picking "Customer" during signup**. The first time they log in, the app detects the
pending invite and promotes their account automatically — no separate registration form. (If
they instead pick "vendor" or "rider" at signup by mistake, an admin can still fix it with
**Admin → Users → Set Role**.)

## Delivery location (map pin, like Glovo/Uber Eats)
Customers set their delivery point by dropping a pin on a map — not just typing an address —
via `src/LocationPicker.tsx` (Leaflet + free OpenStreetMap tiles, no API key/billing needed).
It's used for the home screen's "Deliver to" location, the address book in Settings, and
checkout's "+ Set a new delivery location on map" step. Vendors get the same picker for their
business location (onboarding and Settings → Business Settings). Placing an order now requires
exact coordinates, not just address text — enforced by `POST /api/orders` on the backend,
matching the "GPS location is required" / "Vendor GPS is unavailable" checks that already existed.

Search-as-you-type and turning a dropped pin into a readable address both go through
**Nominatim**, OpenStreetMap's free geocoder, proxied via `GET /api/geocode/search` and
`GET /api/geocode/reverse` (kept server-side so a proper identifying `User-Agent` header can be
set, per Nominatim's usage policy). **Before launch, set `GEOCODE_CONTACT_EMAIL`** in your env
vars to an email you actually monitor — Nominatim's policy asks for a real contact so they
can reach out if there's ever an issue. Nominatim's policy also caps free usage at roughly 1
request/second — fine for a small app (the rate limits in `server.ts` already keep it well
under that), but if you outgrow it, self-hosting Nominatim or switching to a paid geocoder
(Google, Mapbox, LocationIQ) is a drop-in replacement for just those two routes.

## Legal
Draft `TERMS_OF_SERVICE.md` and `PRIVACY_POLICY.md` are in `/legal`, written to match what this
app actually does (verification, map-based location, Paystack payments, vendor/rider documents,
Termii SMS, chat). Fill in every `[BRACKETED]` placeholder (company name, address, jurisdiction,
support email) before publishing them, and have a lawyer review them — this is a starting draft,
not legal advice, and these terms have not been reviewed by an attorney.

## Payments (Paystack)
- Checkout initializes a transaction and redirects the customer to Paystack's hosted checkout.
  When they return, the frontend calls `/api/payment/verify` to confirm the charge.
- **Webhook (required for reliability):** in your Paystack dashboard → Settings → API Keys & Webhooks,
  set the webhook URL to `https://<your-railway-backend-url>/api/payment/webhook`. This is the
  authoritative confirmation path — it fires even if the customer never gets redirected back to the
  app (closed tab, lost connection, switched apps mid-payment), so orders don't get stuck as
  "processing" after a real charge succeeded. The endpoint verifies Paystack's signature
  (`x-paystack-signature`) against `PAYSTACK_SECRET_KEY` before trusting any event.
- Re-initializing payment for an order that's already `PAID` is blocked; re-initializing one that's
  `PROCESSING` first re-checks the existing Paystack reference and marks it paid if it already
  succeeded, instead of starting a second charge.
- Refunds go through Paystack's `/refund` API and require admin approval of a refund request first.

## What's new in this build
- Backend fully decoupled from the old AppDeploy runtime — runs standalone against Postgres.
- Live rider GPS: location now streams continuously (`watchPosition`, ~8s throttle) while a
  rider is online, instead of a single one-time ping. Customers poll `/api/rider/location/:orderId`
  every 10s to show a live map.
- Coupons: admin can create percent/fixed-amount coupons (Admin → Coupons & Gifts). Customers
  apply a code in the cart; the backend validates and computes the discount server-side.
- Gifts / wallet credit: admin can award a customer wallet credit directly. Customers can opt to
  spend it at checkout. Orders fully covered by coupon + wallet skip Paystack and are marked paid
  immediately.
- Admin can now directly set any non-protected user's role (Admin → Users → Set Role), in addition
  to existing suspend/restore/remove/refund/order/review controls.
- Vendor and rider verification: real business-profile and document upload forms (previously the UI
  had no way to submit them even though the backend supported it), vehicle info for riders, and
  admin can now see submitted documents when approving.
- Vendor order pipeline fixed: vendors were fetching the wrong orders entirely and their
  accept/preparing/ready actions were calling an endpoint they didn't have permission to use.
- Cancel Order, Notifications (with real notification creation wired into order/payment/refund/role
  events — previously nothing wrote to the notifications table), Favorites, "become a vendor/rider"
  from an existing account, support ticket attachments, saved payment method labels, and admin
  no-delivery-zone management — all previously backend-only, now have working UI.
- Paystack webhook added as the authoritative payment-confirmation path, plus a guard against
  double-charging an order that's already paid or mid-payment.
- Fixed a duplicated "Settings" panel rendering twice in the Admin dashboard.
- Fixed a `React.FormEvent` reference in the login form that had no corresponding `React` import
  (would have broken the production build).

## Role-branded sign-in
Admin, Support, Vendor, and Rider each get their own sign-in screen (hero, title, subtitle) by
visiting the app with a `?portal=` query param, e.g. `https://your-app.vercel.app/?portal=admin`.
Valid values: `admin`, `support`, `vendor`, `rider`. No param shows the default customer screen.
Admin and Support hide the "Create an Account" option since those are internal-only roles.

## Push notifications
Real web push, not a stub — uses the open VAPID standard, no third-party account (Firebase, etc.)
required. `backend/.env.example` already has a working key pair generated for you; treat
`VAPID_PRIVATE_KEY` as a secret. Tapping the bell icon in the app requests browser notification
permission and subscribes the device; the backend sends a real push through `web-push` on the same
events that already create in-app notifications (order status, payment, gifts, refunds, role
decisions). If you'd rather generate your own key pair: `npx web-push generate-vapid-keys`.
