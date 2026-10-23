import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

// Creates (or approves) one demo vendor with a small open store, and one demo rider.
//
//   DEMO_PASSWORD='a-long-password' node src/make-demo.js create vendor@example.com rider@example.com
//   node src/make-demo.js remove vendor@example.com rider@example.com     (closes the store, deactivates both)
//
// Use emails you control. The password comes from DEMO_PASSWORD and is never printed or stored in code.
// Optional: DEMO_LAT / DEMO_LNG place the store (default Awka). It must sit inside a delivery zone
// you added in the admin panel, or customers will be told it is outside coverage.
const [mode, vendorArg, riderArg] = process.argv.slice(2);
const vendorEmail = (vendorArg || '').trim().toLowerCase();
const riderEmail = (riderArg || '').trim().toLowerCase();
const usage = 'Usage: DEMO_PASSWORD=... node src/make-demo.js create <vendor-email> <rider-email>\n       node src/make-demo.js remove <vendor-email> <rider-email>';
if (!['create', 'remove'].includes(mode) || !vendorEmail.includes('@') || !riderEmail.includes('@') || vendorEmail === riderEmail) { console.error(usage); process.exit(1); }

const lat = Number(process.env.DEMO_LAT ?? 6.21), lng = Number(process.env.DEMO_LNG ?? 7.07);
const client = await pool.connect();
try {
  await client.query('BEGIN');

  if (mode === 'remove') {
    await client.query(`UPDATE stores SET is_open=false WHERE vendor_id IN (SELECT id FROM users WHERE email=$1 AND role='vendor')`, [vendorEmail]);
    const r = await client.query(`UPDATE users SET is_active=false WHERE (email=$1 AND role='vendor') OR (email=$2 AND role='courier')`, [vendorEmail, riderEmail]);
    await client.query('COMMIT');
    console.log(`${r.rowCount} demo account(s) deactivated and the demo store closed.`);
  } else {
    const password = process.env.DEMO_PASSWORD || '';
    if (password.length < 10) throw new Error('Set DEMO_PASSWORD to at least 10 characters.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('DEMO_LAT / DEMO_LNG must be numbers.');
    const hash = await bcrypt.hash(password, 10);

    // Never take over an existing account that has a different role; keep an existing password.
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
    console.log(`Demo vendor ${vendorEmail} (${vendor.existed ? 'existing account approved, password unchanged' : 'created'}) with store "Demo Kitchen".`);
    console.log(`Demo rider  ${riderEmail} (${rider.existed ? 'existing account approved, password unchanged' : 'created'}).`);
    console.log('Sign in with the password you set in DEMO_PASSWORD. Remove them later with the "remove" command.');
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
