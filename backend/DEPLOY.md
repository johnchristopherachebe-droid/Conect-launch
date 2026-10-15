# Deploying Cönëct

## 1. Server and domain
- Rent a small Linux server (any VPS provider) in a region close to your customers, install Docker, and point a
  domain name (e.g. `api.yourdomain.com`) at the server's IP address.
- Open ports 80 and 443 only. Do not publish the database port.

## 2. Configure
    cp .env.production.example .env.production      # fill in every value
    openssl rand -hex 32                            # use the output as JWT_SECRET
- Put your Firebase service-account file next to `docker-compose.prod.yml` as `firebase-service-account.json`
  (or delete the `volumes` line in the compose file and the `FIREBASE_SERVICE_ACCOUNT` value to skip push).
- Use your Paystack **live** key only after Paystack has activated your account. Set the webhook to
  `https://api.yourdomain.com/webhooks/paystack`.

## 3. Start
    docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
    docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api node src/migrate.js
Caddy gets an HTTPS certificate on its own. Check `https://api.yourdomain.com/health` shows `{"ok":true}`.
Production starts with no stores: register an account, run
`docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api node src/make-admin.js you@email.com`,
then open `/panel` to add stores, menus and store map locations.

## 4. Point the apps at it
Build both Flutter apps with `--dart-define=API_URL=https://api.yourdomain.com`. For release builds, remove
`usesCleartextTraffic` from the Android manifest, and switch the map to a paid tile provider.

## 5. Keep it healthy
- Backups: `./deploy/backup.sh` daily via cron, and copy the files off the server.
- Add a free uptime monitor on `/health`.
- Update: pull the new code, then run the `up -d --build` command again (re-run migrate if the schema changed).
- Tests: `TEST_DATABASE_URL=postgres://conect:conect@localhost:5432/conect_test npm test` (use a throwaway database).

## Before you take real customers
- Register a business (CAC) and upgrade your Paystack account: Starter accounts cap at NGN 2,000,000 and cannot pay out.
- App stores require an in-app way to delete an account; Cönëct does not have this yet.
- Publish a privacy policy and terms, and get advice on Nigerian data-protection rules.
- Decide how you pay couriers and stores, and how you handle refund disputes.
