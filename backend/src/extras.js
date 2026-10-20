import { q } from './db.js';
import { requireAuth } from './auth.js';

let tablesReady;
const ensureTables = () =>
  (tablesReady ??= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS product_images (
      product_id INT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
      await q(`CREATE TABLE IF NOT EXISTS store_images (
      store_id INT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await q(`CREATE TABLE IF NOT EXISTS order_delivery_notes (
      order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  })().catch((e) => {
    tablesReady = undefined;
    throw e;
  }));

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function looksLikeImage(buf, mime) {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
  if (mime === 'image/webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export function registerExtras(app, { approvedCourier, approvedVendor }) {
  // ---- Product photos -------------------------------------------------------
  // Public: anyone browsing the menu can see a product photo.
  app.get('/products/:id/image', h(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'No photo' });
    await ensureTables();
    const row = (await q('SELECT mime_type, data FROM product_images WHERE product_id=$1', [id])).rows[0];
    if (!row) return res.status(404).json({ error: 'No photo' });
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', 'public, no-cache');
    res.type(row.mime_type).send(row.data);
  }));

  // Vendor: add or replace the photo of one of their own products.
  app.post('/vendor/products/:id/image', requireAuth('vendor'), approvedVendor, h(async (req, res) => {
    const id = Number(req.params.id);
    const { mime_type: mime, data_base64: b64 } = req.body ?? {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product.' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || typeof b64 !== 'string') {
      return res.status(400).json({ error: 'Upload a JPG, PNG or WebP photo.' });
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 100 || buf.length > 1_500_000) return res.status(400).json({ error: 'Photo must be under 1.5 MB.' });
    if (!looksLikeImage(buf, mime)) return res.status(400).json({ error: 'That file is not a valid image.' });
    const own = await q('SELECT 1 FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=$1 AND s.vendor_id=$2', [id, req.user.id]);
    if (!own.rows[0]) return res.status(404).json({ error: 'Product not found in your store.' });
    await ensureTables();
    await q(
      `INSERT INTO product_images (product_id, mime_type, data) VALUES ($1,$2,$3)
       ON CONFLICT (product_id) DO UPDATE SET mime_type=EXCLUDED.mime_type, data=EXCLUDED.data, updated_at=now()`,
      [id, mime, buf],
    );
    res.json({ ok: true });
  }));
  // ---- Store (business) photos ----------------------------------------------
  app.get('/stores/:id/image', h(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'No photo' });
    await ensureTables();
    const row = (await q('SELECT mime_type, data FROM store_images WHERE store_id=$1', [id])).rows[0];
    if (!row) return res.status(404).json({ error: 'No photo' });
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', 'public, no-cache');
    res.type(row.mime_type).send(row.data);
  }));

  app.post('/vendor/store/image', requireAuth('vendor'), approvedVendor, h(async (req, res) => {
    const { mime_type: mime, data_base64: b64 } = req.body ?? {};
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || typeof b64 !== 'string') {
      return res.status(400).json({ error: 'Upload a JPG, PNG or WebP photo.' });
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 100 || buf.length > 1_500_000) return res.status(400).json({ error: 'Photo must be under 1.5 MB.' });
    if (!looksLikeImage(buf, mime)) return res.status(400).json({ error: 'That file is not a valid image.' });
    const store = (await q('SELECT id FROM stores WHERE vendor_id=$1', [req.user.id])).rows[0];
    if (!store) return res.status(404).json({ error: 'Your store has not been created.' });
    await ensureTables();
    await q(
      `INSERT INTO store_images (store_id, mime_type, data) VALUES ($1,$2,$3)
       ON CONFLICT (store_id) DO UPDATE SET mime_type=EXCLUDED.mime_type, data=EXCLUDED.data, updated_at=now()`,
      [store.id, mime, buf],
    );
    res.json({ ok: true });
  }));

  // ---- Customer contact details for the rider ------------------------------
  app.get('/me/phone', requireAuth('customer'), h(async (req, res) => {
    const row = (await q('SELECT phone FROM users WHERE id=$1', [req.user.id])).rows[0];
    res.json({ phone: row?.phone ?? '' });
  }));

  app.post('/me/phone', requireAuth('customer'), h(async (req, res) => {
    const phone = String(req.body?.phone ?? '').trim();
    if (phone.replace(/\D/g, '').length < 7 || phone.length > 30) return res.status(400).json({ error: 'Enter a valid phone number.' });
    await q('UPDATE users SET phone=$2 WHERE id=$1', [req.user.id, phone]);
    res.json({ ok: true });
  }));

  app.post('/orders/:id/delivery-note', requireAuth('customer'), h(async (req, res) => {
    const note = String(req.body?.note ?? '').trim().slice(0, 300);
    if (!note) return res.status(400).json({ error: 'The note is empty.' });
    const o = (await q('SELECT status FROM orders WHERE id=$1 AND customer_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!o) return res.status(404).json({ error: 'Order not found' });
    if (['delivered', 'cancelled'].includes(o.status)) return res.status(400).json({ error: 'This order is already closed.' });
    await ensureTables();
    await q(
      'INSERT INTO order_delivery_notes (order_id, note) VALUES ($1,$2) ON CONFLICT (order_id) DO UPDATE SET note=EXCLUDED.note',
      [req.params.id, note],
    );
    res.json({ ok: true });
  }));

  // ---- Rider: full customer details for deliveries they have accepted -------
  // Registered before the original route, so this richer version answers first.
  app.get('/courier/active', requireAuth('courier'), approvedCourier, h(async (req, res) => {
    await ensureTables();
    res.json((await q(
      `SELECT o.id, o.status, o.total, s.name AS store_name,
              s.lat AS pickup_lat, s.lng AS pickup_lng, vp.address AS pickup_address,
              a.label, a.line1, a.city, a.lat AS dropoff_lat, a.lng AS dropoff_lng,
              u.name AS customer_name, u.phone AS customer_phone, n.note AS delivery_note
       FROM orders o JOIN stores s ON s.id=o.store_id JOIN addresses a ON a.id=o.address_id
       JOIN users u ON u.id=o.customer_id
       LEFT JOIN vendor_profiles vp ON vp.user_id=s.vendor_id
       LEFT JOIN order_delivery_notes n ON n.order_id=o.id
       WHERE o.courier_id=$1 AND o.status IN ('ready','picked_up')
       ORDER BY o.created_at`,
      [req.user.id],
    )).rows);
  }));
}
