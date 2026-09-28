# cönëct backend

Express + Postgres API. In production it also serves the built frontend (see the root
`README.md` for the single-service deploy flow) — build and start it from the **repo root**
(`npm run build` / `npm start`), not from inside this folder, unless you're deploying the
backend on its own.

## Required environment variables
- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — long random secret
- `PAYSTACK_SECRET_KEY` — Paystack secret key (test or live)
- `PUBLIC_API_URL` / `PUBLIC_APP_URL` — for a single-service deploy, both are the one public
  URL your platform gives this service
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` — mailbox used to send
  email verification links
- `TERMII_API_KEY` / `TERMII_SENDER_ID` — used to send phone verification codes by SMS
- `STORAGE_DIR` — optional local storage path (default `./storage`)
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — web push notification key pair (see root
  `.env.example` for a generated pair, or run `npx web-push generate-vapid-keys` for your own)

## Run standalone (backend only, no bundled frontend)
```
npm install
npm run build
npm start
```
