CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','courier','vendor','support','admin')),
  courier_approved BOOLEAN NOT NULL DEFAULT false,
  vendor_approved BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  email_verification_token_hash TEXT,
  email_verification_expires_at TIMESTAMPTZ,
  email_verification_sent_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe for existing databases created before role onboarding fields were added.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer','courier','vendor','support','admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS courier_approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token_hash) WHERE email_verification_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS addresses (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  line1    TEXT NOT NULL,
  city     TEXT NOT NULL,
  lat      DOUBLE PRECISION,
  lng      DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS stores (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('food','groceries','pharmacy','courier')),
  emoji        TEXT,
  eta_minutes  INT NOT NULL DEFAULT 30,
  delivery_fee NUMERIC(8,2) NOT NULL DEFAULT 1.99,
  is_open      BOOLEAN NOT NULL DEFAULT true,
  vendor_id    UUID REFERENCES users(id) ON DELETE SET NULL
);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS products (
  id        SERIAL PRIMARY KEY,
  store_id  INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  price     NUMERIC(8,2) NOT NULL CHECK (price >= 0),
  available BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES users(id),
  store_id     INT  NOT NULL REFERENCES stores(id),
  courier_id   UUID REFERENCES users(id),
  address_id   UUID NOT NULL REFERENCES addresses(id),
  status       TEXT NOT NULL DEFAULT 'placed'
               CHECK (status IN ('placed','preparing','ready','picked_up','delivered','cancelled')),
  subtotal     NUMERIC(8,2) NOT NULL,
  delivery_fee NUMERIC(8,2) NOT NULL,
  total        NUMERIC(8,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  name       TEXT NOT NULL,
  unit_price NUMERIC(8,2) NOT NULL,
  quantity   INT NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS courier_locations (
  courier_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_courier  ON orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_products_store  ON products(store_id);

-- Payments (Paystack)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none','requested','processing','completed','failed','rejected'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_updated_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_provider_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reconciled_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reconciled_at TIMESTAMPTZ;

-- Track each Paystack checkout attempt independently so repeated taps or a late
-- payment from an older checkout cannot silently overwrite the order's payment.
CREATE TABLE IF NOT EXISTS payment_attempts (
  reference TEXT PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  status TEXT NOT NULL DEFAULT 'initializing' CHECK (status IN ('initializing','initialized','failed','paid','refund_requested','refund_failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id, created_at DESC);
-- Commission is snapshotted per order so future rate changes do not alter existing orders.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_net_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
-- Backfill legacy pre-launch orders once; future commission changes never rewrite saved order values.
UPDATE orders SET commission_rate=10.00, commission_amount=ROUND(subtotal * 0.10, 2), vendor_net_amount=subtotal-ROUND(subtotal * 0.10, 2)
WHERE commission_amount=0 AND vendor_net_amount=0 AND subtotal>0;

-- Push notifications
CREATE TABLE IF NOT EXISTS device_tokens (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

-- Courier matching
ALTER TABLE stores ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatch_round INT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS order_offers (
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, courier_id)
);


-- Vendor onboarding, customer support, and refund escalation.
CREATE TABLE IF NOT EXISTS vendor_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'food',
  phone TEXT,
  address TEXT NOT NULL,
  registration_number TEXT,
  government_id_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (government_id_status IN ('not_submitted','submitted','approved','rejected')),
  food_safety_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (food_safety_status IN ('not_submitted','submitted','approved','rejected')),
  orientation_completed BOOLEAN NOT NULL DEFAULT false,
  orientation_completed_at TIMESTAMPTZ,
  orientation_completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  orientation_notes TEXT,
  review_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS orientation_completed_at TIMESTAMPTZ;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS orientation_completed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS orientation_notes TEXT;
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','escalated','resolved','closed')),
  admin_note TEXT,
  refund_status TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none','requested','processing','completed','failed','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer ON support_tickets(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id,created_at);


-- Configurable circular no-delivery zones managed by administrators.
CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  center_lat DOUBLE PRECISION NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
  center_lng DOUBLE PRECISION NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
  radius_km DOUBLE PRECISION NOT NULL CHECK (radius_km > 0 AND radius_km <= 500),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One customer rating per completed order; can be edited by that customer.
CREATE TABLE IF NOT EXISTS order_ratings (
  order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id INT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  courier_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_ratings_store ON order_ratings(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_ratings_courier ON order_ratings(courier_id, created_at DESC);


-- Courier onboarding profile; approval remains separate from profile completion.
CREATE TABLE IF NOT EXISTS courier_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('bicycle','motorcycle','car','other')),
  license_number TEXT,
  government_id_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (government_id_status IN ('not_submitted','submitted','approved','rejected')),
  driving_license_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (driving_license_status IN ('not_submitted','submitted','approved','rejected')),
  vehicle_registration_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (vehicle_registration_status IN ('not_submitted','submitted','approved','rejected')),
  orientation_completed BOOLEAN NOT NULL DEFAULT false,
  orientation_completed_at TIMESTAMPTZ,
  orientation_completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  orientation_notes TEXT,
  review_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS orientation_completed_at TIMESTAMPTZ;
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS orientation_completed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS orientation_notes TEXT;

ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS vehicle_registration_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (vehicle_registration_status IN ('not_submitted','submitted','approved','rejected'));

-- Private verification files are encrypted before being stored in PostgreSQL.
CREATE TABLE IF NOT EXISTS verification_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('government_id','food_safety','driving_license','vehicle_registration')),
  filename TEXT NOT NULL CHECK (length(filename) <= 180),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  encrypted_data BYTEA NOT NULL,
  encryption_iv BYTEA NOT NULL,
  encryption_tag BYTEA NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'submitted' CHECK (review_status IN ('submitted','approved','rejected')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_documents_user ON verification_documents(user_id,document_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_documents_review ON verification_documents(review_status,created_at DESC);


-- Runtime business settings editable by admins without redeploying the API.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_settings(key,value) VALUES
 ('delivery_base_fee','300'),('delivery_per_km','180'),('delivery_min_fee','300'),('vendor_commission_percent','10')
ON CONFLICT(key) DO NOTHING;
-- ---------- Wallets for vendors and couriers ----------
-- Append-only ledger. A user's balance is the SUM of their entries; entries are never edited or deleted.
-- Positive = money owed to the user (earnings, restored holds); negative = money leaving (withdrawals, refund reversals).
CREATE TABLE IF NOT EXISTS wallet_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  order_id UUID REFERENCES orders(id),
  withdrawal_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('order_earning','delivery_earning','refund_reversal','refund_reversal_undo','withdrawal','withdrawal_reversal','adjustment')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON wallet_entries(user_id, created_at DESC);
-- An order can only ever pay a user once, even if the delivery step is retried.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_order_earning ON wallet_entries(user_id, order_id, kind) WHERE kind IN ('order_earning','delivery_earning');
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_withdrawal_entry ON wallet_entries(withdrawal_id, kind) WHERE withdrawal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL CHECK (account_number ~ '^[0-9]{10}$'),
  account_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','rejected')),
  -- Bank details are copied at request time so a later edit cannot redirect an open payout.
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  payout_reference TEXT,
  admin_note TEXT,
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawal_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawal_requests(user_id, created_at DESC);
-- One open withdrawal per person keeps the admin queue simple and blocks double requests.
CREATE UNIQUE INDEX IF NOT EXISTS uq_withdrawal_one_open ON withdrawal_requests(user_id) WHERE status='requested';

-- Courier share of the delivery fee is snapshotted per order, like commission.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_share_percent NUMERIC(5,2) NOT NULL DEFAULT 100.00;
INSERT INTO app_settings(key,value) VALUES ('courier_share_percent','100'),('min_withdrawal','1000')
ON CONFLICT(key) DO NOTHING;
