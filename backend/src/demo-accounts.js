import bcrypt from 'bcryptjs';
import { pool } from './db.js';

export async function setupDemoAccounts(env = process.env) {
  const mode = (env.DEMO_ACCOUNTS || '').trim().toLowerCase();
  if (!mode) return;
  if (!['create', 'remove'].includes(mode)) throw new Error('DEMO_ACCOUNTS must be "create" or "remove".');
  const vendorEmail = (env.DEMO_VENDOR_EMAIL || '').trim().toLowerCase();
  const riderEmail = (env.DEMO_RIDER_EMAIL || '').trim().toLowerCase();
  if (!vendorEmail.includes('@') || !riderEmail.includes('@') || vendorEmail === riderEmail) throw new Error('Set DEMO_VENDOR_EMAIL and DEMO_RIDER_EMAIL to two different email addresses.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (mode === 'remove') {
      await client.query(`UPDATE stores SET is_open=false WHERE vendor_id IN (SELECT id FROM users WHERE email=$1 AND role='vendor')`, [vendorEmail]);
      const r = await client.query(`UPDATE users SET is_active=false WHERE (email=$1 AND role='vendor') OR (email=$2 AND role='courier')`, [vendorEmail, riderEmail]);
      await client.query('COMMIT');
      console.log(`Demo accounts: ${r.rowCount} account(s) deactivated and the demo store closed.`);
      return;
    }

    const password = env.DEMO_PASSWORD || '';
    if (password.length < 10) throw new Error('Set DEMO_PASSWORD to at least 10 characters.');
    const lat = Number(env.DEMO_LAT ?? 6.21), lng = Number(env.DEMO_LNG ?? 7.07);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('DEMO_LAT / DEMO_LNG must be numbers.');
    const hash = await bcrypt.hash(password, 10);

    async function ensureUser(email, name, phone, role, flag) {
      const found = (await client.query('SELECT id, role FROM users WHERE email=$1', [email])).rows[0];
      if (found && found.role !== role) throw new Error(`${email} already exists as a ${found.role}. Use a different email.`);
      if (found) {
        await client.query(`UPDATE users SET ${flag}=true, is_active=true, email_verified_at=COALESCE(email_verified_at, now()) WHERE id=$1`, [found.id]);
        return { id: found.id, existed: true };
      }
      const { rows } = await client.query(
        `INSERT INTO users (email,password_hash,name,phone,role,${flag},email_verified_at) VALUES ($1,$2,$3,$4,$5,true,now()) RETURNING id`,
        [email, hash, name, phone, role]);
      return { id: rows[0].id, existed: false };
    }

    const vendor = await ensureUser(vendorEmail, 'Demo Vendor', '08000000001', 'vendor', 'vendor_approved');
    await client.query(
      `INSERT INTO vendor_profiles (user_id,business_name,business_type,phone,address,government_id_status,food_safety_status,orientation_completed,orientation_completed_at)
       VALUES ($1,'Demo Kitchen','food','08000000001','1 Demo Street, Awka','approved','approved',true,now())
       ON CONFLICT (user_id) DO UPDATE SET government_id_status='approved', food_safety_status='approved', orientation_completed=true,
         orientation_completed_at=COALESCE(vendor_profiles.orientation_completed_at, now()), updated_at=now()`, [vendor.id]);
    let store = (await client.query('SELECT id FROM stores WHERE vendor_id=$1', [vendor.id])).rows[0];
    if (!store) {
      store = (await client.query(
        `INSERT INTO stores (name,category,categories,emoji,eta_minutes,delivery_fee,is_open,lat,lng,vendor_id)
         VALUES ('Demo Kitchen','food',ARRAY['food'],'🍛',25,500,true,$1,$2,$3) RETURNING id`, [lat, lng, vendor.id])).rows[0];
    }
    if (!(await client.query('SELECT 1 FROM products WHERE store_id=$1 LIMIT 1', [store.id])).rows[0]) {
      await client.query(
        `INSERT INTO products (store_id,name,price) VALUES ($1,'Jollof rice & chicken',3500),($1,'Fried rice & turkey',4000),($1,'Suya wrap',2500),($1,'Chapman',1500),($1,'Zobo drink',800)`, [store.id]);
    }

    const rider = await ensureUser(riderEmail, 'Demo Rider', '08000000002', 'courier', 'courier_approved');
    await client.query(
      `INSERT INTO courier_profiles (user_id,phone,address,vehicle_type,government_id_status,driving_license_status,vehicle_registration_status,orientation_completed,orientation_completed_at)
       VALUES ($1,'08000000002','2 Demo Street, Awka','motorcycle','approved','approved','approved',true,now())
       ON CONFLICT (user_id) DO UPDATE SET government_id_status='approved', driving_license_status='approved', vehicle_registration_status='approved',
         orientation_completed=true, orientation_completed_at=COALESCE(courier_profiles.orientation_completed_at, now()), updated_at=now()`, [rider.id]);

    await client.query('COMMIT');
    console.log(`Demo accounts: vendor ${vendorEmail} ${vendor.existed ? 'approved (existing, password unchanged)' : 'created'} with store "Demo Kitchen"; rider ${riderEmail} ${rider.existed ? 'approved (existing, password unchanged)' : 'created'}.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
