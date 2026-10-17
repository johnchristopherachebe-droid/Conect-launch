import crypto from 'node:crypto';
import { q } from './db.js';
import { requireAuth } from './auth.js';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

let tableReady;
const ensureTable = () =>
  (tableReady ??= q(`CREATE TABLE IF NOT EXISTS order_delivery_pins (
    order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    pin TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ
  )`).catch((e) => {
    tableReady = undefined;
    throw e;
  }));

const newPin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

// Returns the PIN record for an order, creating the PIN the first time it is needed.
async function pinFor(orderId) {
  await ensureTable();
  await q('INSERT INTO order_delivery_pins (order_id, pin) VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING', [orderId, newPin()]);
  return (await q('SELECT pin, attempts, locked_until FROM order_delivery_pins WHERE order_id=$1', [orderId])).rows[0];
}

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function registerDeliveryPin(app, { approvedCourier }) {
  // Customer: see the PIN for their own active order.
  app.get('/orders/:id/pin', requireAuth('customer'), h(async (req, res) => {
    const o = (await q('SELECT status, paid FROM orders WHERE id=$1 AND customer_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!o) return res.status(404).json({ error: 'Order not found' });
    if (!o.paid || ['delivered', 'cancelled'].includes(o.status)) return res.json({ pin: null });
    res.json({ pin: (await pinFor(req.params.id)).pin });
  }));

  // Courier: marking an order delivered requires the customer's PIN.
  // Registered before the original advance route, so it runs first and calls next() when the PIN is right.
  app.post('/courier/orders/:id/advance', requireAuth('courier'), approvedCourier, h(async (req, res, next) => {
    const cur = (await q('SELECT status FROM orders WHERE id=$1 AND courier_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!cur || cur.status !== 'picked_up') return next(); // pickup step and invalid cases are handled by the original route

    const rec = await pinFor(req.params.id);
    if (rec.locked_until && new Date(rec.locked_until) > new Date()) {
      return res.status(429).json({ error: `Too many incorrect PIN attempts. Try again in ${LOCK_MINUTES} minutes or contact Cönëct support.` });
    }
    const given = String(req.body?.pin ?? '').trim();
    const ok = /^\d{4}$/.test(given) && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(rec.pin));
    if (!ok) {
      const lock = rec.attempts + 1 >= MAX_ATTEMPTS;
      await q(
        `UPDATE order_delivery_pins
         SET attempts = CASE WHEN $2::boolean THEN 0 ELSE attempts + 1 END,
             locked_until = CASE WHEN $2::boolean THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END
         WHERE order_id=$1`,
        [req.params.id, lock],
      );
      return res.status(400).json({
        error: lock
          ? `Too many incorrect PIN attempts. Delivery confirmation is locked for ${LOCK_MINUTES} minutes.`
          : 'Incorrect delivery PIN. Ask the customer to check it in their Cönëct app.',
      });
    }
    await q('UPDATE order_delivery_pins SET attempts=0, locked_until=NULL WHERE order_id=$1', [req.params.id]);
    next();
  }));
}
