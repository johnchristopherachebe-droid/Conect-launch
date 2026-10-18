// Integration tests. They need a throwaway Postgres database:
//   TEST_DATABASE_URL=postgres://conect:conect@localhost:5432/conect_test npm test
// The database name must contain "test": the suite wipes its tables.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const url = process.env.TEST_DATABASE_URL;

describe('Cönëct API', { skip: url ? false : 'set TEST_DATABASE_URL to run these tests' }, () => {
  const realFetch = globalThis.fetch;
  let server, base, pool, paystackReply = () => ({ status: true, data: {} });

  const call = async (method, path, body, token) => {
    const r = await realFetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => ({})) };
  };
  let n = 0;
  const register = async (role = 'customer') => {
    const email = `${role}${++n}@test.dev`;
    const r = await call('POST', '/auth/register', { email, password: 'password123', name: role, role });
    assert.equal(r.status, 201);
    return { email, token: r.body.token };
  };
  // A customer with an address and one unpaid order for 2 x the first menu item of store 1.
  const newOrder = async () => {
    const { token } = await register();
    const addr = (await call('POST', '/addresses', { label: 'Home', line1: '1 Test St', city: 'Lagos', lat: 6.5244, lng: 3.3792 }, token)).body;
    const store = (await call('GET', '/stores/1')).body;
    const o = await call('POST', '/orders', {
      storeId: 1, addressId: addr.id, items: [{ productId: store.products[0].id, quantity: 2 }],
    }, token);
    return { token, addr, store, order: o.body, status: o.status };
  };

  before(async () => {
    assert.match(url, /test/, 'refusing to run against a database without "test" in its URL');
    Object.assign(process.env, {
      DATABASE_URL: url, JWT_SECRET: 'x'.repeat(40), PAYSTACK_SECRET_KEY: 'sk_test_unit', DOCUMENT_ENCRYPTION_KEY: 'a'.repeat(64),
      PUBLIC_URL: 'http://localhost', NODE_ENV: 'test',
    });
    ({ pool } = await import('../src/db.js'));
    await pool.query(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
    await pool.query('TRUNCATE users, stores RESTART IDENTITY CASCADE');
    await pool.query(readFileSync(new URL('../src/seed.sql', import.meta.url), 'utf8'));
    const { app } = await import('../src/server.js');
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
    // Pretend to be Paystack; every other request goes through untouched.
    globalThis.fetch = (u, opts) => String(u).startsWith('https://api.paystack.co')
      ? Promise.resolve(new Response(JSON.stringify(paystackReply(String(u), opts)), { status: 200, headers: { 'content-type': 'application/json' } }))
      : realFetch(u, opts);
  });

  after(async () => {
    globalThis.fetch = realFetch;
    server?.close();
    await pool?.end();
  });

  it('requires email verification in production mode and accepts a one-time link', async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldResendKey = process.env.RESEND_API_KEY;
    const oldEmailFrom = process.env.EMAIL_FROM;
    const oldPublicUrl = process.env.PUBLIC_URL;
    let verificationMessage = '';
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Cönëct Test <verify@example.test>';
    process.env.PUBLIC_URL = 'https://api.example.test';
    globalThis.fetch = (u, opts) => {
      if (String(u) === 'https://api.resend.com/emails') {
        verificationMessage = JSON.parse(opts.body).text;
        return Promise.resolve(new Response(JSON.stringify({ id: 'email_test' }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (String(u).startsWith('https://api.paystack.co')) return Promise.resolve(new Response(JSON.stringify(paystackReply(String(u), opts)), { status: 200, headers: { 'content-type': 'application/json' } }));
      return realFetch(u, opts);
    };
    try {
      const email = 'verify-flow@test.dev';
      const created = await call('POST', '/auth/register', { email, password: 'password123', name: 'Verify Flow' });
      assert.equal(created.status, 201);
      assert.equal(created.body.needsVerification, true);
      assert.equal((await call('POST', '/auth/login', { email, password: 'password123' })).status, 403);
      const match = verificationMessage.match(/https:\/\/api\.example\.test\/auth\/verify-email\?token=([^\s]+)/);
      assert.ok(match, 'verification email includes a link');
      const token = decodeURIComponent(match[1]);
      assert.equal((await call('GET', `/auth/verify-email?token=${encodeURIComponent(token)}`)).status, 200);
      assert.equal((await call('POST', '/auth/login', { email, password: 'password123' })).status, 200);
      assert.equal((await call('GET', `/auth/verify-email?token=${encodeURIComponent(token)}`)).status, 400, 'verification token is one-time use');
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldResendKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldResendKey;
      if (oldEmailFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = oldEmailFrom;
      if (oldPublicUrl === undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL = oldPublicUrl;
      globalThis.fetch = (u, opts) => String(u).startsWith('https://api.paystack.co')
        ? Promise.resolve(new Response(JSON.stringify(paystackReply(String(u), opts)), { status: 200, headers: { 'content-type': 'application/json' } }))
        : realFetch(u, opts);
    }
  });

  it('registers, rejects a duplicate email, and checks passwords', async () => {
    const { email } = await register();
    assert.equal((await call('POST', '/auth/register', { email, password: 'password123', name: 'Dup' })).status, 409);
    assert.equal((await call('POST', '/auth/login', { email, password: 'wrong-password' })).status, 401);
    assert.equal((await call('POST', '/auth/login', { email, password: 'password123' })).status, 200);
  });

  it('filters nearby stores by GPS and uses admin-managed delivery pricing', async () => {
    const nearby=await call('GET','/stores?lat=6.5244&lng=3.3792&radiusKm=2');
    assert.equal(nearby.status,200); assert.ok(nearby.body.some(s=>s.name==='Casa Pepa'&&Number(s.distance_km)===0));
    const admin=await register(); await pool.query("UPDATE users SET role='admin' WHERE email=$1",[admin.email]);
    const customer=await register();
    const addr=(await call('POST','/addresses',{label:'Home',line1:'1 Test St',city:'Lagos',lat:6.5244,lng:3.3792},customer.token)).body;
    const changed=await call('PATCH','/admin/settings/delivery-fees',{base_fee:500,per_km:0,min_fee:300},admin.token);
    assert.equal(changed.status,200);
    assert.equal((await call('GET',`/delivery/quote?storeId=1&addressId=${addr.id}`,null,customer.token)).body.deliveryFee,500);
    await call('PATCH','/admin/settings/delivery-fees',{base_fee:300,per_km:180,min_fee:300},admin.token);
  });

  it('deactivates and anonymises a customer account after confirmation', async () => {
    const user=await register();
    await call('POST','/addresses',{label:'Home',line1:'1 Test Street',city:'Awka',lat:6.2,lng:7.1},user.token);
    const deleted=await call('DELETE','/account',null,user.token);
    assert.equal(deleted.status,200);
    assert.equal((await call('GET','/addresses',null,user.token)).status,401);
    const row=(await pool.query('SELECT is_active,email,name FROM users WHERE email LIKE $1',['deleted+%@deleted.conect.invalid'])).rows[0];
    assert.equal(row.is_active,false); assert.equal(row.name,'Deleted customer');
  });

  it('computes the order total from database prices', async () => {
    const { store, order, status } = await newOrder();
    assert.equal(status, 201);
    const expected = Number(store.products[0].price) * 2 + 300; // same GPS point: minimum distance fee
    assert.equal(Number(order.total), expected);
    assert.equal(order.paid, false);
  });

  it('refuses an address that belongs to someone else', async () => {
    const { addr, store } = await newOrder();
    const other = await register();
    const r = await call('POST', '/orders', {
      storeId: 1, addressId: addr.id, items: [{ productId: store.products[0].id, quantity: 1 }],
    }, other.token);
    assert.equal(r.status, 400);
  });

  it('lets only the owning approved vendor advance paid orders through preparation', async () => {
    const vendor=await register('vendor');
    const store=(await call('GET','/stores/1')).body;
    await pool.query('UPDATE users SET vendor_approved=true WHERE email=$1',[vendor.email]);
    await pool.query('UPDATE stores SET vendor_id=(SELECT id FROM users WHERE email=$1) WHERE id=1',[vendor.email]);
    const {order}=await newOrder();
    await pool.query('UPDATE orders SET paid=true WHERE id=$1',[order.id]);
    assert.equal((await call('PATCH',`/vendor/orders/${order.id}/status`,{status:'preparing'},vendor.token)).status,200);
    assert.equal((await call('PATCH',`/vendor/orders/${order.id}/status`,{status:'ready'},vendor.token)).status,200);
    assert.equal((await call('PATCH',`/vendor/orders/${order.id}/status`,{status:'preparing'},vendor.token)).status,409);
    assert.ok(store);
  });

  it('blocks configured no-delivery zones at quote and checkout', async () => {
    const { token } = await register();
    const addr = (await call('POST', '/addresses', { label: 'Home', line1: '1 Test St', city: 'Lagos', lat: 6.5244, lng: 3.3792 }, token)).body;
    await pool.query('INSERT INTO delivery_zones (name,center_lat,center_lng,radius_km) VALUES ($1,$2,$3,$4)', ['Test exclusion zone',6.5244,3.3792,2]);
    try {
      assert.equal((await call('GET', `/delivery/quote?storeId=1&addressId=${addr.id}`, null, token)).status, 400);
      const store = (await call('GET', '/stores/1')).body;
      assert.equal((await call('POST','/orders',{storeId:1,addressId:addr.id,items:[{productId:store.products[0].id,quantity:1}]},token)).status,400);
    } finally { await pool.query("DELETE FROM delivery_zones WHERE name='Test exclusion zone'"); }
  });

  it("allows ratings only for a customer’s delivered and paid order", async () => {
    const { token, order } = await newOrder();
    await pool.query("UPDATE orders SET paid=true,status='delivered' WHERE id=$1",[order.id]);
    const saved = await call('POST',`/orders/${order.id}/rating`,{stars:5,comment:'Great service'},token);
    assert.equal(saved.status,201); assert.equal(saved.body.stars,5);
    assert.equal((await call('GET',`/orders/${order.id}/rating`,null,token)).body.comment,'Great service');
    const other = await register();
    assert.equal((await call('GET',`/orders/${order.id}/rating`,null,other.token)).status,404);
  });

  it('encrypts uploaded verification documents and requires review before courier approval', async () => {
    const courier = await register('courier');
    await call('PUT','/courier/profile',{phone:'+2348012345678',address:'1 Test Road, Awka',vehicle_type:'motorcycle',license_number:'LIC-TEST-1'},courier.token);
    const pdf = Buffer.from('%PDF-1.4\nCönëct test document\n','utf8').toString('base64');
    const upload = async (type) => call('POST','/verification/documents',{document_type:type,filename:`${type}.pdf`,mime_type:'application/pdf',data_base64:pdf},courier.token);
    const idDoc=await upload('government_id'), licenceDoc=await upload('driving_license'), vehicleDoc=await upload('vehicle_registration');
    assert.equal(idDoc.status,201); assert.equal(licenceDoc.status,201); assert.equal(vehicleDoc.status,201);
    const admin=await register(); await pool.query("UPDATE users SET role='admin' WHERE email=$1",[admin.email]);
    assert.equal((await call('PATCH',`/admin/couriers/${(await pool.query('SELECT id FROM users WHERE email=$1',[courier.email])).rows[0].id}/approval`,{approved:true,orientation_completed:true},admin.token)).status,409);
    for (const d of [idDoc.body,licenceDoc.body,vehicleDoc.body]) assert.equal((await call('PATCH',`/admin/documents/${d.id}`,{review_status:'approved',review_notes:'Test review'},admin.token)).status,200);
    const userId=(await pool.query('SELECT id FROM users WHERE email=$1',[courier.email])).rows[0].id;
    assert.equal((await call('PATCH',`/admin/couriers/${userId}/approval`,{approved:true,orientation_completed:true},admin.token)).status,200);
    const list=await call('GET','/admin/documents',null,admin.token); assert.equal(list.status,200); assert.ok(list.body.length>=3);
    const fileResponse=await realFetch(`${base}/admin/documents/${idDoc.body.id}/file`,{headers:{Authorization:`Bearer ${admin.token}`}});
    assert.equal(fileResponse.status,200); assert.match(await fileResponse.text(),/^%PDF-1\.4/);
  });

  it('requires real reviewed documents before vendor approval', async () => {
    const vendor=await register('vendor');
    await call('PUT','/vendor/profile',{business_name:'Test Bakery',business_type:'food',phone:'+2348012345678',address:'2 Test Road, Awka',registration_number:'TEST-1'},vendor.token);
    const pdf=Buffer.from('%PDF-1.4\nVendor test document\n','utf8').toString('base64');
    const upload=async(type)=>call('POST','/verification/documents',{document_type:type,filename:`${type}.pdf`,mime_type:'application/pdf',data_base64:pdf},vendor.token);
    const idDoc=await upload('government_id'), foodDoc=await upload('food_safety'); assert.equal(idDoc.status,201); assert.equal(foodDoc.status,201);
    const admin=await register(); await pool.query("UPDATE users SET role='admin' WHERE email=$1",[admin.email]);
    const userId=(await pool.query('SELECT id FROM users WHERE email=$1',[vendor.email])).rows[0].id;
    assert.equal((await call('PATCH',`/admin/vendors/${userId}/approval`,{approved:true,orientation_completed:true},admin.token)).status,409);
    for(const d of [idDoc.body,foodDoc.body]) assert.equal((await call('PATCH',`/admin/documents/${d.id}`,{review_status:'approved'},admin.token)).status,200);
    assert.equal((await call('PATCH',`/admin/vendors/${userId}/approval`,{approved:true,orientation_completed:true,orientation_notes:'In-person orientation completed'},admin.token)).status,200);
    const persisted=(await pool.query('SELECT orientation_completed,orientation_completed_at,orientation_completed_by,orientation_notes FROM vendor_profiles WHERE user_id=$1',[userId])).rows[0];
    assert.equal(persisted.orientation_completed,true,'approval must persist the orientation record');
    assert.ok(persisted.orientation_completed_at,'approval must record when orientation was completed');
    assert.ok(persisted.orientation_completed_by,'approval must record which admin completed orientation');
    assert.equal(persisted.orientation_notes,'In-person orientation completed');
    assert.equal((await call('PATCH',`/admin/vendors/${userId}/approval`,{approved:false,review_notes:'Temporarily suspended'},admin.token)).status,200);
    assert.equal((await pool.query('SELECT vendor_approved FROM users WHERE id=$1',[userId])).rows[0].vendor_approved,false);
  });

  it('checks current database roles and invalidates deactivated accounts', async () => {
    const { email, token } = await register();
    await pool.query("UPDATE users SET role='support' WHERE email=$1",[email]);
    assert.equal((await call('GET','/admin/orders',null,token)).status,403);
    await pool.query('UPDATE users SET is_active=false WHERE email=$1',[email]);
    assert.equal((await call('GET','/addresses',null,token)).status,401);
    assert.equal((await call('POST','/auth/login',{email,password:'password123'})).status,401);
  });

  it('blocks unapproved couriers until an admin approves them', async () => {
    const courier = await register('courier');
    assert.equal((await call('GET', '/courier/available', null, courier.token)).status, 403);
    await pool.query('UPDATE users SET courier_approved = true WHERE email = $1', [courier.email]);
    assert.equal((await call('GET', '/courier/available', null, courier.token)).status, 200);
  });

  it('offers only paid ready orders to couriers and lets only one courier claim an order', async () => {
    const { order } = await newOrder();
    await pool.query("UPDATE users SET phone='+2348012345678' WHERE id=(SELECT customer_id FROM orders WHERE id=$1)",[order.id]);
    const a = await register('courier'), b = await register('courier');
    await pool.query('UPDATE users SET courier_approved = true WHERE email IN ($1, $2)', [a.email, b.email]);
    await pool.query(`INSERT INTO courier_locations(courier_id,lat,lng) SELECT id,6.5244,3.3792 FROM users WHERE email IN ($1,$2) ON CONFLICT(courier_id) DO UPDATE SET lat=EXCLUDED.lat,lng=EXCLUDED.lng,updated_at=now()`,[a.email,b.email]);
    const ids = async (t) => (await call('GET', '/courier/available', null, t)).body.map((o) => o.id);
    assert.ok(!(await ids(a.token)).includes(order.id));
    await pool.query("UPDATE orders SET paid = true, status = 'ready' WHERE id = $1", [order.id]);
    assert.ok((await ids(a.token)).includes(order.id));
    assert.equal((await call('POST', `/courier/orders/${order.id}/accept`, null, a.token)).status, 200);
    assert.equal((await call('POST', `/courier/orders/${order.id}/accept`, null, b.token)).status, 409);
    const active = await call('GET', '/courier/active', null, a.token);
    assert.equal(active.status, 200);
    const assigned = active.body.find((o) => o.id === order.id);
    assert.equal(assigned.customer_phone, '+2348012345678');
    assert.equal(Number(assigned.pickup_lat), 6.5244);
  });

  it('only marks an order paid when Paystack confirms the exact amount', async () => {
    const { order } = await newOrder();
    const verify = (amountKobo) => (url) => ({
      status: true,
      data: { status: 'success', reference: decodeURIComponent(String(url).split('/').pop()), amount: amountKobo, currency: 'NGN', metadata: { order_id: order.id } },
    });
    const paid = async () => (await pool.query('SELECT paid, payment_ref FROM orders WHERE id = $1', [order.id])).rows[0];
    await pool.query(`INSERT INTO payment_attempts(reference,order_id,amount_kobo,status) VALUES($1,$2,$3,'initialized')`, ['wrong-amount',order.id,Math.round(Number(order.total)*100)]);
    await pool.query(`INSERT INTO payment_attempts(reference,order_id,amount_kobo,status) VALUES($1,$2,$3,'initialized')`, ['right-amount',order.id,Math.round(Number(order.total)*100)]);

    paystackReply = verify(Math.round(Number(order.total) * 100) + 100); // 1 naira too much
    await call('GET', '/payment/done?reference=wrong-amount');
    assert.equal((await paid()).paid, false);

    paystackReply = verify(Math.round(Number(order.total) * 100));
    await call('GET', '/payment/done?reference=right-amount');
    const row = await paid();
    assert.equal(row.paid, true);
    assert.equal(row.payment_ref, 'right-amount');
  });

  it('does not mark a cancelled order paid and requests a refund for a late successful charge', async () => {
    const { order, token } = await newOrder();
    const reference = 'late-cancelled-payment';
    await pool.query('INSERT INTO payment_attempts(reference,order_id,amount_kobo,status) VALUES($1,$2,$3,\'initialized\')', [reference,order.id,Math.round(Number(order.total)*100)]);
    await call('POST', `/orders/${order.id}/cancel`, null, token);
    let refundCalled = false;
    paystackReply = (url, opts) => {
      if (String(url).endsWith('/refund')) { refundCalled = true; return { status: true, data: { id: 'refund_test' } }; }
      return { status: true, data: { status: 'success', reference, amount: Math.round(Number(order.total)*100), currency: 'NGN', metadata: { order_id: order.id } } };
    };
    await call('GET', `/payment/done?reference=${reference}`);
    const row = (await pool.query('SELECT paid,status FROM orders WHERE id=$1',[order.id])).rows[0];
    const attempt = (await pool.query('SELECT status FROM payment_attempts WHERE reference=$1',[reference])).rows[0];
    assert.equal(row.paid, false);
    assert.equal(row.status, 'cancelled');
    assert.equal(attempt.status, 'refund_requested');
    assert.equal(refundCalled, true);
  });

  it('does not automatically retry a late-payment refund after an uncertain provider response', async () => {
    const { order } = await newOrder();
    const reference = 'late-refund-timeout';
    await pool.query("UPDATE orders SET paid=true,payment_ref='original-charge' WHERE id=$1", [order.id]);
    await pool.query("INSERT INTO payment_attempts(reference,order_id,amount_kobo,status) VALUES($1,$2,$3,'initialized')", [reference,order.id,Math.round(Number(order.total)*100)]);
    let refundCalls = 0;
    paystackReply = (url) => {
      if (String(url).endsWith('/refund')) { refundCalls++; return { status: false, message: 'simulated timeout/uncertain response' }; }
      return { status: true, data: { status: 'success', reference, amount: Math.round(Number(order.total)*100), currency: 'NGN', metadata: { order_id: order.id } } };
    };
    await call('GET', `/payment/done?reference=${reference}`);
    assert.equal(refundCalls, 1);
    assert.equal((await pool.query('SELECT status FROM payment_attempts WHERE reference=$1', [reference])).rows[0].status, 'refund_failed');
    await call('GET', `/payment/done?reference=${reference}`);
    assert.equal(refundCalls, 1, 'a second callback must not submit another refund automatically');
  });

  it('rejects webhooks with a bad signature and accepts a genuine one', async () => {
    const { order } = await newOrder();
    await pool.query(`INSERT INTO payment_attempts(reference,order_id,amount_kobo,status) VALUES($1,$2,$3,'initialized')`, ['hook-ref',order.id,Math.round(Number(order.total)*100)]);
    paystackReply = (url) => ({
      status: true,
      data: { status: 'success', reference: decodeURIComponent(String(url).split('/').pop()), amount: Math.round(Number(order.total) * 100), currency: 'NGN', metadata: { order_id: order.id } },
    });
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'hook-ref' } });
    const post = (sig) => realFetch(`${base}/webhooks/paystack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig }, body,
    });
    assert.equal((await post('not-a-real-signature')).status, 401);
    const sig = crypto.createHmac('sha512', 'sk_test_unit').update(body).digest('hex');
    assert.equal((await post(sig)).status, 200);
    // Paystack may redeliver events. The same reference must remain idempotent.
    assert.equal((await post(sig)).status, 200);
    const paidOrder = (await pool.query('SELECT paid,payment_ref FROM orders WHERE id = $1', [order.id])).rows[0];
    assert.equal(paidOrder.paid, true, 'a valid charge.success webhook must verify and mark the order paid');
    assert.equal(paidOrder.payment_ref, 'hook-ref');
    assert.equal((await pool.query("SELECT status FROM payment_attempts WHERE reference='hook-ref'")).rows[0].status, 'paid');
  });

  it('keeps vendor operations gated until required review is recorded', async () => {
    const vendor = await register('vendor');
    assert.equal((await call('GET', '/vendor/products', null, vendor.token)).status, 403);
    assert.equal((await call('PUT', '/vendor/profile', { business_name: 'Test Bakery', business_type: 'food', address: '1 Test Road, Awka' }, vendor.token)).status, 200);
    const ordinary = await register();
    await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [ordinary.email]);
    const admin = await call('POST', '/auth/login', { email: ordinary.email, password: 'password123' });
    const blocked = await call('PATCH', `/admin/vendors/${(await pool.query('SELECT id FROM users WHERE email=$1',[vendor.email])).rows[0].id}/approval`, { approved: true }, admin.body.token);
    assert.equal(blocked.status, 409);
    const id = (await pool.query('SELECT id FROM users WHERE email=$1',[vendor.email])).rows[0].id;
    const approved = await call('PATCH', `/admin/vendors/${id}/approval`, { approved: true, government_id_status: 'approved', food_safety_status: 'approved', orientation_completed: true }, admin.body.token);
    assert.equal(approved.status, 200);
    const store = await call('POST', '/vendor/store', {}, vendor.token);
    assert.equal(store.status, 201);
    assert.equal(store.body.is_open, false);
  });

  it('lets customers open support tickets and exchange replies with support staff', async () => {
    const customer = await register();
    const ticket = await call('POST', '/support/tickets', { subject: 'Order help', message: 'Please help me understand my order.' }, customer.token);
    assert.equal(ticket.status, 201);
    assert.equal((await call('GET', '/support/tickets', null, customer.token)).status, 200);
    const adminUser = await register();
    await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [adminUser.email]);
    const admin = await call('POST', '/auth/login', { email: adminUser.email, password: 'password123' });
    const agent = await call('POST', '/admin/support/users', { name: 'Support Agent', email: 'agent@test.dev', password: 'support-password-123' }, admin.body.token);
    assert.equal(agent.status, 201);
    const agentLogin = await call('POST', '/auth/login', { email: 'agent@test.dev', password: 'support-password-123' });
    const reply = await call('POST', `/support/tickets/${ticket.body.id}/messages`, { message: 'We are looking into this for you.' }, agentLogin.body.token);
    assert.equal(reply.status, 201);
    const thread = await call('GET', `/support/tickets/${ticket.body.id}/messages`, null, customer.token);
    assert.equal(thread.status, 200);
    assert.equal(thread.body.length, 1);
  });

  
  // ---- Wallets --------------------------------------------------------------
  const makeAdmin = async () => {
    const u = await register();
    await pool.query("UPDATE users SET role='admin' WHERE email=$1", [u.email]);
    return (await call('POST', '/auth/login', { email: u.email, password: 'password123' })).body.token;
  };
  // A vendor-owned store, a paid order in "picked_up" assigned to an approved courier, ready for the PIN step.
  const deliverableOrder = async () => {
    const vendor = await register('vendor'), courier = await register('courier');
    await pool.query('UPDATE users SET vendor_approved=true WHERE email=$1', [vendor.email]);
    await pool.query('UPDATE users SET courier_approved=true WHERE email=$1', [courier.email]);
    await pool.query('UPDATE stores SET vendor_id=(SELECT id FROM users WHERE email=$1) WHERE id=1', [vendor.email]);
    const placed = await newOrder();
    await pool.query("UPDATE orders SET paid=true,status='picked_up',courier_id=(SELECT id FROM users WHERE email=$2) WHERE id=$1", [placed.order.id, courier.email]);
    const pin = (await call('GET', `/orders/${placed.order.id}/pin`, null, placed.token)).body.pin;
    const deliver = () => call('POST', `/courier/orders/${placed.order.id}/advance`, { pin }, courier.token);
    return { vendor, courier, placed, deliver };
  };
  const walletOf = async (token) => (await call('GET', '/wallet', null, token)).body;

  it('pays vendor and courier wallets exactly once when an order is delivered', async () => {
    const { vendor, courier, placed, deliver } = await deliverableOrder();
    const row = (await pool.query('SELECT vendor_net_amount,delivery_fee,courier_share_percent FROM orders WHERE id=$1', [placed.order.id])).rows[0];
    assert.equal((await walletOf(vendor.token)).balance, 0);
    assert.equal((await deliver()).status, 200);
    const expectedCourier = Math.round(Number(row.delivery_fee) * Number(row.courier_share_percent)) / 100;
    assert.equal((await walletOf(vendor.token)).balance, Number(row.vendor_net_amount));
    assert.equal((await walletOf(courier.token)).balance, expectedCourier);
    assert.equal((await deliver()).status, 409, 'a second delivery attempt must be rejected');
    assert.equal((await walletOf(vendor.token)).balance, Number(row.vendor_net_amount), 'balance must not change on a repeat');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM wallet_entries WHERE order_id=$1', [placed.order.id])).rows[0].n, 2);
    assert.equal((await call('GET', '/wallet', null, placed.token)).status, 403, 'customers have no wallet');
    assert.equal((await call('GET', '/wallet')).status, 401);
  });

  it('holds money on withdrawal request, blocks overdrafts and double requests, and settles via admin', async () => {
    const { vendor } = await deliverableOrder();
    const admin = await makeAdmin();
    const vendorId = (await pool.query('SELECT id FROM users WHERE email=$1', [vendor.email])).rows[0].id;
    assert.equal((await call('PATCH', '/admin/settings/wallet', { courier_share_percent: 100, min_withdrawal: 1000 }, admin)).status, 200);
    assert.equal((await call('POST', `/admin/wallets/${vendorId}/adjust`, { amount: 5000, note: 'Test top-up' }, admin)).status, 201);
    assert.equal((await call('POST', '/wallet/withdrawals', { amount: 1000 }, vendor.token)).status, 409, 'needs a bank account first');
    assert.equal((await call('PUT', '/wallet/payout-account', { bank_name: 'GTBank', account_number: '12345', account_name: 'Test Bakery' }, vendor.token)).status, 400, 'account number must be 10 digits');
    assert.equal((await call('PUT', '/wallet/payout-account', { bank_name: 'GTBank', account_number: '0123456789', account_name: 'Test Bakery' }, vendor.token)).status, 200);
    assert.equal((await call('POST', '/wallet/withdrawals', { amount: 500 }, vendor.token)).status, 400, 'below the minimum');
    assert.equal((await call('POST', '/wallet/withdrawals', { amount: 99_999_999 }, vendor.token)).status, 409, 'more than the balance');
    assert.equal((await call('POST', '/wallet/withdrawals', { amount: 10.123 }, vendor.token)).status, 400, 'more than 2 decimals');
    const before = (await walletOf(vendor.token)).balance;

    // Two simultaneous requests must not both succeed.
    const both = await Promise.all([call('POST', '/wallet/withdrawals', { amount: 1000 }, vendor.token), call('POST', '/wallet/withdrawals', { amount: 1000 }, vendor.token)]);
    assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);
    const wr = both.find((r) => r.status === 201).body;
    const during = await walletOf(vendor.token);
    assert.equal(during.balance, before - 1000, 'money is held immediately');
    assert.equal(during.pending_withdrawal, 1000);

    assert.equal((await call('PATCH', `/admin/withdrawals/${wr.id}`, { status: 'rejected' }, admin)).status, 400, 'a reason is required');
    assert.equal((await call('PATCH', `/admin/withdrawals/${wr.id}`, { status: 'rejected', note: 'Name does not match your ID' }, admin)).status, 200);
    assert.equal((await walletOf(vendor.token)).balance, before, 'rejection gives the money back');
    assert.equal((await call('PATCH', `/admin/withdrawals/${wr.id}`, { status: 'paid', payout_reference: 'TRF1' }, admin)).status, 409, 'already settled');

    const second = (await call('POST', '/wallet/withdrawals', { amount: 1000 }, vendor.token)).body;
    assert.equal((await call('PATCH', `/admin/withdrawals/${second.id}`, { status: 'paid' }, admin)).status, 400, 'bank reference required');
    assert.equal((await call('PATCH', `/admin/withdrawals/${second.id}`, { status: 'paid', payout_reference: 'TRF2' }, admin)).status, 200);
    assert.equal((await walletOf(vendor.token)).balance, before - 1000);
    assert.equal((await call('PATCH', `/admin/withdrawals/${second.id}`, { status: 'rejected', note: 'oops' }, admin)).status, 409, 'a paid withdrawal cannot be reversed');
    assert.equal((await call('GET', '/admin/withdrawals', null, vendor.token)).status, 403);
    assert.equal((await call('GET', '/admin/withdrawals?status=paid', null, admin)).status, 200);
  });

  it('keeps unapproved vendors from withdrawing and ignores a later bank change on an open payout', async () => {
    const { vendor } = await deliverableOrder();
    const admin = await makeAdmin();
    const vendorId = (await pool.query('SELECT id FROM users WHERE email=$1', [vendor.email])).rows[0].id;
    await call('POST', `/admin/wallets/${vendorId}/adjust`, { amount: 3000, note: 'Test top-up' }, admin);
    await call('PUT', '/wallet/payout-account', { bank_name: 'GTBank', account_number: '0123456789', account_name: 'Test Bakery' }, vendor.token);
    await pool.query('UPDATE users SET vendor_approved=false WHERE id=$1', [vendorId]);
    assert.equal((await call('POST', '/wallet/withdrawals', { amount: 1000 }, vendor.token)).status, 403);
    await pool.query('UPDATE users SET vendor_approved=true WHERE id=$1', [vendorId]);
    const wr = (await call('POST', '/wallet/withdrawals', { amount: 1000 }, vendor.token)).body;
    await call('PUT', '/wallet/payout-account', { bank_name: 'Other Bank', account_number: '9999999999', account_name: 'Someone Else' }, vendor.token);
    const listed = (await call('GET', '/admin/withdrawals?status=requested', null, admin)).body.find((w) => w.id === wr.id);
    assert.equal(listed.account_number, '0123456789', 'the payout goes to the account saved when it was requested');
  });

  it('takes earnings back when a delivered order is refunded and restores them if the refund fails', async () => {
    const { vendor, courier, placed, deliver } = await deliverableOrder();
    const admin = await makeAdmin();
    await deliver();
    const v0 = (await walletOf(vendor.token)).balance, c0 = (await walletOf(courier.token)).balance;
    assert.ok(v0 > 0 && c0 > 0);
    await pool.query("UPDATE orders SET payment_ref='orig-charge' WHERE id=$1", [placed.order.id]);
    const setRefund = (status, extra = {}) => call('PATCH', `/admin/orders/${placed.order.id}/refund-status`, { status, ...extra }, admin);
    assert.equal((await setRefund('processing')).status, 200);
    assert.equal((await walletOf(vendor.token)).balance, 0, 'vendor earnings reversed while the refund is under way');
    assert.equal((await walletOf(courier.token)).balance, 0);
    assert.equal((await setRefund('processing')).status, 200);
    assert.equal((await walletOf(vendor.token)).balance, 0, 'reversal is not applied twice');
    assert.equal((await setRefund('failed', { note: 'Provider error' })).status, 200);
    assert.equal((await walletOf(vendor.token)).balance, v0, 'failed refund restores the vendor');
    assert.equal((await walletOf(courier.token)).balance, c0);
    assert.equal((await setRefund('requested')).status, 200);
    assert.equal((await setRefund('completed', { note: 'Confirmed in Paystack', provider_reference: 'RF-1' })).status, 200);
    assert.equal((await walletOf(vendor.token)).balance, 0, 'completed refund keeps the earnings removed');
  });

  it('shows admins one history of every money movement, filterable and exportable', async () => {
    const { vendor, placed, deliver } = await deliverableOrder();
    const admin = await makeAdmin();
    await pool.query("INSERT INTO payment_attempts(reference,order_id,amount_kobo,status) VALUES('tx-hist-ref',$1,$2,'paid')", [placed.order.id, Math.round(Number(placed.order.total) * 100)]);
    await deliver();
    const all = await call('GET', '/admin/transactions', null, admin);
    assert.equal(all.status, 200);
    const types = new Set(all.body.rows.filter((r) => r.order_id === placed.order.id).map((r) => r.type));
    assert.ok(types.has('payment') && types.has('earning'), 'payment and earnings both appear');
    assert.ok(Number(all.body.summary.collected) > 0);
    assert.equal((await call('GET', '/admin/transactions?type=payment', null, admin)).body.rows.every((r) => r.type === 'payment'), true);
    assert.ok((await call('GET', `/admin/transactions?q=${encodeURIComponent(vendor.email)}`, null, admin)).body.rows.length >= 1);
    assert.equal((await call('GET', '/admin/transactions?before=not-a-date', null, admin)).status, 400);
    const csv = await realFetch(base + '/admin/transactions?format=csv', { headers: { Authorization: `Bearer ${admin}` } });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.equal((await call('GET', '/admin/transactions', null, vendor.token)).status, 403);
  });

  it('keeps customers and anonymous users out of the admin API', async () => {
    const { token } = await register();
    assert.equal((await call('GET', '/admin/orders', null, token)).status, 403);
    assert.equal((await call('GET', '/admin/orders')).status, 401);
  });
});
