import { q } from './db.js';
import { notifyUser, notifyCouriers } from './push.js';

// Offer each paid order to the nearest free couriers in small waves.
const BATCH = 3;          // couriers offered per wave
const WAIT_SECONDS = 45;  // wait this long for someone to accept before the next wave
const FRESH_SECONDS = 120; // a courier counts as online if their location is newer than this
const MAX_ROUNDS = 3;     // after this many empty waves, alert every courier once

// How many deliveries one courier can carry at the same time (override with MAX_ACTIVE_ORDERS).
export const MAX_ACTIVE_ORDERS = Math.max(1, Number(process.env.MAX_ACTIVE_ORDERS) || 5);

let running = false;


function km(lat1, lng1, lat2, lng2) {
  const r = (x) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

export async function dispatchTick() {
  if (running) return;
  running = true;
  try {
    const { rows } = await q(
      `SELECT id FROM orders
       WHERE paid AND courier_id IS NULL AND status = 'ready' AND dispatch_round < 99
         AND (dispatched_at IS NULL OR dispatched_at < now() - make_interval(secs => $1))
       ORDER BY created_at LIMIT 20`, [WAIT_SECONDS]);
    for (const o of rows) await dispatchOrder(o.id).catch((e) => console.error('Dispatch failed:', e.message));
  } finally {
    running = false;
  }
}

async function dispatchOrder(id) {
  // Claiming the wave in the database keeps two server instances from offering the same wave twice.
  const claim = await q(
    `UPDATE orders SET dispatched_at = now(), dispatch_round = dispatch_round + 1
     WHERE id = $1 AND paid AND courier_id IS NULL AND status = 'ready' AND dispatch_round < 99
       AND (dispatched_at IS NULL OR dispatched_at < now() - make_interval(secs => $2))
     RETURNING dispatch_round`, [id, WAIT_SECONDS]);
  if (!claim.rows[0]) return;
  const round = claim.rows[0].dispatch_round;

  const store = (await q(
    'SELECT s.name, s.lat, s.lng FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.id = $1', [id])).rows[0];

  // Online, not already delivering, and not offered this order before.
  const { rows: candidates } = await q(
    `SELECT u.id, l.lat, l.lng FROM users u JOIN courier_locations l ON l.courier_id = u.id
     WHERE u.role = 'courier' AND u.courier_approved = true AND l.updated_at > now() - make_interval(secs => $2)
              AND (SELECT count(*) FROM orders a WHERE a.courier_id = u.id
            AND a.status IN ('ready','picked_up')) < $3
       AND NOT EXISTS (SELECT 1 FROM order_offers f WHERE f.order_id = $1 AND f.courier_id = u.id)`,
    [id, FRESH_SECONDS, MAX_ACTIVE_ORDERS]);

  if (!candidates.length) {
    if (round >= MAX_ROUNDS) {
      await q('UPDATE orders SET dispatch_round = 99 WHERE id = $1', [id]);
      const { rows: fallback } = await q(
        `SELECT u.id FROM users u WHERE u.role='courier' AND u.courier_approved=true
        AND (SELECT count(*) FROM orders a WHERE a.courier_id=u.id AND a.status IN ('ready','picked_up')) < $2
         AND NOT EXISTS (SELECT 1 FROM order_offers f WHERE f.order_id=$1 AND f.courier_id=u.id)`, [id, MAX_ACTIVE_ORDERS]);
      for (const courier of fallback) await q('INSERT INTO order_offers (order_id,courier_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[id,courier.id]);
      await notifyCouriers('Order waiting for a courier', 'Nearby offers were not accepted. Open Cönëct Courier to check the waiting order.', { orderId: id });
    }
    return;
  }

  const located = store.lat != null && store.lng != null;
  const ranked = candidates
    .map((c) => ({ ...c, km: located ? km(Number(store.lat), Number(store.lng), c.lat, c.lng) : null }))
    .sort((a, b) => (located ? a.km - b.km : 0))
    .slice(0, BATCH);

  for (const c of ranked) {
    await q('INSERT INTO order_offers (order_id, courier_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, c.id]);
    const where = c.km != null ? ` · ${c.km.toFixed(1)} km away` : '';
    notifyUser(c.id, 'New delivery nearby', `${store.name}${where}. Open the app to accept.`, { orderId: id });
  }
}

export function startDispatch() {
  setInterval(() => dispatchTick().catch((e) => console.error(e.message)), 15000);
}
