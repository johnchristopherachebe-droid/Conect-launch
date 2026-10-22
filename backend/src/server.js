import 'dotenv/config';
import './config.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { q, tx, pool } from './db.js';
import { sign, requireAuth } from './auth.js';
import { notifyUser } from './push.js';
import { startDispatch, dispatchTick } from './dispatch.js';
import { registerWallet, creditOrderEarnings, reverseOrderEarnings, restoreOrderEarnings } from './wallet.js';
import { gateways, gatewayCodes, isConfigured, publicInfo } from './gateways.js';

const app = express();
app.set('trust proxy', 1); // behind Caddy: use the real client IP for rate limits
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"], imgSrc: ["'self'", 'data:'], upgradeInsecureRequests: null,
    },
  },
}));
// The mobile apps do not need CORS. List origins only if you add a browser client on another domain.
const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (origins.length) app.use(cors({ origin: origins }));
// Paystack webhook needs the raw body to check its signature, so it comes before express.json().
app.post('/webhooks/paystack', express.raw({ type: 'application/json' }), paystackWebhook);
app.use(express.json({ limit: '4mb' }));

// Admin web panel (static page; every data call it makes is checked by requireAuth('admin')).
app.use('/panel', express.static(fileURLToPath(new URL('./admin', import.meta.url))));

// Rate limits (switched off under NODE_ENV=test so the test suite is not throttled).
const limiter = (windowMs, limit, message) => rateLimit({
  windowMs, limit, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', message: { error: message },
});
app.use(limiter(60_000, 300, 'Too many requests. Slow down a little.'));
app.use('/auth', limiter(15 * 60_000, 20, 'Too many attempts. Try again in a few minutes.'));
const payLimiter = limiter(60 * 60_000, 30, 'Too many payment attempts. Try again later.');

// Wrap async handlers and validate bodies with zod.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const parse = (schema, body) => schema.parse(body);
const adminOnly = requireAuth('admin');

// ---------- Auth ----------
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['customer', 'courier', 'vendor']).default('customer'),
});

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, emailVerified: Boolean(u.email_verified_at) });
const emailVerificationTtlMs = 24 * 60 * 60 * 1000;

async function sendVerificationEmail(email, token) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw httpError(503, 'Email verification is not configured yet. Please contact Cönëct support.');
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  if (!/^https:\/\//i.test(base)) throw httpError(503, 'Email verification requires PUBLIC_URL to be a public HTTPS URL.');
  const link = `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [email], subject: 'Verify your Cönëct email',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#163b31"><h1>Welcome to Cönëct</h1><p>Tap the button below to verify your email address. This link expires in 24 hours and can only be used once.</p><p><a href="${link}" style="display:inline-block;padding:13px 20px;background:#0B5D47;color:white;text-decoration:none;border-radius:8px">Verify my email</a></p><p>If you did not create a Cönëct account, you can ignore this email.</p></div>`,
      text: `Welcome to Cönëct. Verify your email using this link (expires in 24 hours): ${link}`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Email provider rejected verification message:', response.status, detail.slice(0, 300));
    throw httpError(502, 'We could not send the verification email. Please try again shortly.');
  }
}

async function createAndSendVerification(user) {
  if (process.env.NODE_ENV === 'test') {
    await q('UPDATE users SET email_verified_at = now(), email_verification_token_hash = NULL, email_verification_expires_at = NULL WHERE id = $1', [user.id]);
    return;
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await q(`UPDATE users SET email_verification_token_hash=$2, email_verification_expires_at=now()+interval '24 hours', email_verification_sent_at=now() WHERE id=$1`, [user.id, hash]);
  await sendVerificationEmail(user.email, token);
}

app.post('/auth/register', h(async (req, res) => {
  const b = parse(registerSchema, req.body);
  const hash = await bcrypt.hash(b.password, 10);
  try {
    const { rows } = await q(
      `INSERT INTO users (email, password_hash, name, phone, role)
       VALUES (lower($1), $2, $3, $4, $5) RETURNING id, email, name, role, email_verified_at`,
      [b.email.trim(), hash, b.name.trim(), b.phone ?? null, b.role]);
    const user = rows[0];
    await createAndSendVerification(user);
    if (process.env.NODE_ENV === 'test') return res.status(201).json({ user: publicUser({ ...user, email_verified_at: new Date() }), token: sign(user) });
    res.status(201).json({ needsVerification: true, email: user.email, message: 'Check your inbox for a verification link. The link expires in 24 hours.' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already registered' });
    throw e;
  }
}));

app.post('/auth/resend-verification', limiter(15 * 60_000, 5, 'Please wait before requesting another verification email.'), h(async (req, res) => {
  const b = parse(z.object({ email: z.string().email() }), req.body);
  const u = (await q('SELECT id,email,email_verified_at,email_verification_sent_at FROM users WHERE email=lower($1)', [b.email.trim()])).rows[0];
  // Same response for unknown, verified, and unverified addresses to avoid account enumeration.
  if (u && !u.email_verified_at) {
    const last = u.email_verification_sent_at ? new Date(u.email_verification_sent_at).getTime() : 0;
    if (Date.now() - last >= 60_000) {
      try { await createAndSendVerification(u); }
      catch (e) { if (e.status) throw e; throw e; }
    }
  }
  res.json({ message: 'If this address has an unverified Cönëct account, a verification email will be sent shortly.' });
}));

app.get('/auth/verify-email', h(async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (token.length < 30 || token.length > 200) return res.status(400).type('html').send(verificationPage(false, 'This verification link is invalid. Request a new one in the Cönëct app.'));
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await q(`UPDATE users SET email_verified_at=now(), email_verification_token_hash=NULL, email_verification_expires_at=NULL WHERE email_verification_token_hash=$1 AND email_verification_expires_at > now() AND email_verified_at IS NULL RETURNING id`, [hash]);
  if (!rows.length) return res.status(400).type('html').send(verificationPage(false, 'This link has expired or has already been used. Return to the Cönëct app and request another verification email.'));
  res.type('html').send(verificationPage(true, 'Your email is verified. Return to the Cönëct app and sign in.'));
}));

function verificationPage(ok, message) {
  const color = ok ? '#0B5D47' : '#a33b22';
  const safe = String(message).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cönëct email verification</title><body style="font-family:Arial,sans-serif;background:#FAF9F6;margin:0;padding:32px;color:#163b31"><main style="max-width:520px;margin:8vh auto;background:white;padding:28px;border-radius:16px"><h1 style="color:${color}">${ok ? 'Email verified' : 'Verification link problem'}</h1><p>${safe}</p><p>You can close this page when done.</p></main></body></html>`;
}

app.delete('/account', requireAuth('customer'), h(async (req,res)=>{
  const active = (await q(`SELECT count(*)::int AS count FROM orders WHERE customer_id=$1 AND status NOT IN ('delivered','cancelled')`,[req.user.id])).rows[0];
  if (Number(active.count)>0) return res.status(409).json({error:'Please wait until your active orders are delivered or cancelled before deleting your account.'});
  const replacementEmail = `deleted+${req.user.id}@deleted.conect.invalid`;
  await tx(async (c)=>{
    await c.query(`UPDATE users SET is_active=false,deleted_at=now(),email=$2,name='Deleted customer',phone=NULL,password_hash=$3,email_verification_token_hash=NULL,email_verification_expires_at=NULL,email_verification_sent_at=NULL WHERE id=$1`,[req.user.id,replacementEmail,await bcrypt.hash(crypto.randomBytes(32).toString('hex'),10)]);
    await c.query(`UPDATE addresses SET label='Deleted address',line1='Deleted address',city='Deleted',lat=NULL,lng=NULL WHERE user_id=$1`,[req.user.id]);
    await c.query(`UPDATE order_ratings SET comment='' WHERE customer_id=$1`,[req.user.id]);
    await c.query('DELETE FROM device_tokens WHERE user_id=$1',[req.user.id]);
  });
  res.json({ok:true,message:'Your account has been deactivated and your profile details anonymised. Transaction records may be retained where required for accounting, safety, or dispute handling.'});
}));

app.post('/auth/login', h(async (req, res) => {
  const b = parse(z.object({ email: z.string().email(), password: z.string() }), req.body);
  const { rows } = await q('SELECT * FROM users WHERE email = lower($1)', [b.email.trim()]);
  const u = rows[0];
  if (!u || !u.is_active || !(await bcrypt.compare(b.password, u.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  if (!u.email_verified_at && process.env.NODE_ENV !== 'test')
    return res.status(403).json({ error: 'Please verify your email first. Open the link we emailed you, or request a new one.' });
  res.json({ user: publicUser(u), token: sign(u) });
}));

// Courier accounts can register, but cannot access delivery/customer data until an admin approves them.
const approvedCourier = (req, res, next) => {
  q("SELECT courier_approved FROM users WHERE id = $1 AND role = 'courier'", [req.user.id])
    .then(({ rows }) => {
      if (!rows[0] || !rows[0].courier_approved) return res.status(403).json({ error: 'Your courier account is awaiting admin approval.' });
      next();
    }).catch(next);
};

// ---------- Vendor onboarding and self-service ----------
const approvedVendor = (req, res, next) => {
  q("SELECT vendor_approved FROM users WHERE id = $1 AND role = 'vendor'", [req.user.id])
    .then(({ rows }) => {
      if (!rows[0]) return res.status(403).json({ error: 'Vendor account required.' });
      if (!rows[0].vendor_approved) return res.status(403).json({ error: 'Your vendor application is awaiting admin approval.' });
      next();
    }).catch(next);
};

app.get('/vendor/profile', requireAuth('vendor'), h(async (req, res) => {
  const profile = (await q('SELECT * FROM vendor_profiles WHERE user_id = $1', [req.user.id])).rows[0] ?? null;
  const store = (await q('SELECT * FROM stores WHERE vendor_id = $1', [req.user.id])).rows[0] ?? null;
  const status = (await q('SELECT vendor_approved FROM users WHERE id = $1', [req.user.id])).rows[0];
  res.json({ profile, store, approved: Boolean(status?.vendor_approved) });
}));

const BUSINESS_TYPES = ['food','groceries','pharmacy','fashion','gadgets','beauty'];

app.put('/vendor/profile', requireAuth('vendor'), h(async (req, res) => {
  const b = parse(z.object({
    business_name: z.string().trim().min(2).max(120),
    business_types: z.array(z.enum(BUSINESS_TYPES)).min(1).max(BUSINESS_TYPES.length).optional(),
    business_type: z.enum(BUSINESS_TYPES).optional(),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().min(5).max(300),
    registration_number: z.string().trim().max(100).optional(),
  }), req.body);
  const types = [...new Set(b.business_types ?? [b.business_type ?? 'food'])];
  const { rows } = await q(
    `INSERT INTO vendor_profiles (user_id,business_name,business_type,business_types,phone,address,registration_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id) DO UPDATE SET business_name=$2,business_type=$3,business_types=$4,phone=$5,address=$6,registration_number=$7,updated_at=now()
     RETURNING *`, [req.user.id,b.business_name,types[0],types,b.phone ?? null,b.address,b.registration_number ?? null]);
  await q('UPDATE stores SET category=$2,categories=$3 WHERE vendor_id=$1', [req.user.id,types[0],types]);
  res.status(200).json(rows[0]);
}));

// ---------- Private vendor/courier verification documents ----------
function documentKey() {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY || '';
  if (!/^(?:[0-9a-fA-F]{64}|[A-Za-z0-9_-]{43,44})$/.test(raw)) throw httpError(503,'Secure document storage is not configured. Please contact Cönëct support.');
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw,'hex') : Buffer.from(raw,'base64url');
  if (key.length !== 32) throw httpError(503,'Secure document storage key must decode to 32 bytes.');
  return key;
}
function encryptDocument(bytes) {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',documentKey(),iv);
  const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return { encrypted, iv, tag:cipher.getAuthTag() };
}
function decryptDocument(row) {
  const decipher=crypto.createDecipheriv('aes-256-gcm',documentKey(),row.encryption_iv);
  decipher.setAuthTag(row.encryption_tag);
  return Buffer.concat([decipher.update(row.encrypted_data),decipher.final()]);
}
const documentMimeTypes = ['image/jpeg','image/png','application/pdf'];
const documentTypesByRole = { vendor:['government_id','food_safety'], courier:['government_id','driving_license','vehicle_registration'] };
app.get('/verification/documents', requireAuth('vendor','courier'), h(async(req,res)=>{
  res.json((await q('SELECT id,document_type,filename,mime_type,review_status,created_at,updated_at FROM verification_documents WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id])).rows);
}));
app.post('/verification/documents', requireAuth('vendor','courier'), limiter(15*60_000,10,'Too many document uploads. Try again later.'), h(async(req,res)=>{
  const b=parse(z.object({document_type:z.enum(['government_id','food_safety','driving_license','vehicle_registration']),filename:z.string().trim().min(1).max(180),mime_type:z.enum(documentMimeTypes),data_base64:z.string().min(20).max(2_800_000)}).strict(),req.body);
  if(!documentTypesByRole[req.user.role].includes(b.document_type)) return res.status(400).json({error:'This document type is not valid for your account role.'});
  const profileTable=req.user.role==='vendor'?'vendor_profiles':'courier_profiles';
  if(!(await q(`SELECT user_id FROM ${profileTable} WHERE user_id=$1`,[req.user.id])).rows[0]) return res.status(409).json({error:'Save your business/courier profile before uploading verification documents.'});
  const bytes=Buffer.from(b.data_base64,'base64');
  if(!bytes.length || bytes.length>2*1024*1024) return res.status(413).json({error:'Each verification file must be no larger than 2 MB.'});
  const valid = b.mime_type==='application/pdf' ? bytes.subarray(0,5).toString()==='%PDF-' : b.mime_type==='image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
  if(!valid) return res.status(400).json({error:'The file contents do not match the selected file type.'});
  const enc=encryptDocument(bytes);
  const {rows}=await q(`INSERT INTO verification_documents(user_id,document_type,filename,mime_type,encrypted_data,encryption_iv,encryption_tag) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,document_type,filename,mime_type,review_status,created_at`,[req.user.id,b.document_type,b.filename,b.mime_type,enc.encrypted,enc.iv,enc.tag]);
  if(req.user.role==='vendor' && ['government_id','food_safety'].includes(b.document_type)) await q(`UPDATE vendor_profiles SET ${b.document_type==='government_id'?'government_id_status':'food_safety_status'}='submitted',updated_at=now() WHERE user_id=$1`,[req.user.id]);
  if(req.user.role==='courier') { const field=b.document_type==='government_id'?'government_id_status':b.document_type==='driving_license'?'driving_license_status':'vehicle_registration_status'; await q(`UPDATE courier_profiles SET ${field}='submitted',updated_at=now() WHERE user_id=$1`,[req.user.id]); }
  res.status(201).json(rows[0]);
}));

app.post('/vendor/store', requireAuth('vendor'), h(async (req, res) => {
  const profile = (await q('SELECT * FROM vendor_profiles WHERE user_id=$1', [req.user.id])).rows[0];
  if (!profile) return res.status(400).json({ error: 'Complete your business profile first.' });
  const b = parse(z.object({ emoji: z.string().max(8).default('🏪'), eta_minutes: z.number().int().min(1).max(240).default(30), delivery_fee: z.number().min(0).default(300), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict(), req.body);
  const existing = (await q('SELECT id FROM stores WHERE vendor_id=$1', [req.user.id])).rows[0];
  if (existing) return res.status(409).json({ error: 'A store is already linked to this vendor account.' });
  const { rows } = await q(
    `INSERT INTO stores (name,category,categories,emoji,eta_minutes,delivery_fee,is_open,lat,lng,vendor_id)
     VALUES ($1,$2,$9,$3,$4,$5,false,$6,$7,$8) RETURNING *`,
    [profile.business_name,profile.business_type,b.emoji,b.eta_minutes,b.delivery_fee,b.lat ?? null,b.lng ?? null,req.user.id,profile.business_types?.length ? profile.business_types : [profile.business_type]]);
  res.status(201).json({ ...rows[0], message: 'Store created as closed pending admin approval.' });
}));

app.get('/vendor/products', requireAuth('vendor'), approvedVendor, h(async (req, res) => {
  res.json((await q('SELECT p.* FROM products p JOIN stores s ON s.id=p.store_id WHERE s.vendor_id=$1 ORDER BY p.id', [req.user.id])).rows);
}));

app.post('/vendor/products', requireAuth('vendor'), approvedVendor, h(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(120), price: z.number().min(0), available: z.boolean().default(true) }), req.body);
  const store = (await q('SELECT id FROM stores WHERE vendor_id=$1', [req.user.id])).rows[0];
  if (!store) return res.status(400).json({ error: 'Your store has not been created.' });
  const { rows } = await q('INSERT INTO products (store_id,name,price,available) VALUES ($1,$2,$3,$4) RETURNING *', [store.id,b.name,b.price,b.available]);
  res.status(201).json(rows[0]);
}));

app.patch('/vendor/products/:id', requireAuth('vendor'), approvedVendor, h(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(120), price: z.number().min(0), available: z.boolean() }).partial().strict(), req.body);
  const allowed = Object.keys(b);
  if (!allowed.length) return res.status(400).json({ error: 'Nothing to update.' });
  const sets = allowed.map((k,i) => `${k}=$${i+2}`).join(', ');
  const { rows } = await q(`UPDATE products p SET ${sets} FROM stores s WHERE p.store_id=s.id AND s.vendor_id=$1 AND p.id=$${allowed.length+2} RETURNING p.*`, [req.user.id,...allowed.map(k=>b[k]),Number(req.params.id)]);
  if (!rows[0]) return res.status(404).json({ error: 'Product not found in your store.' });
  res.json(rows[0]);
}));

app.patch('/vendor/orders/:id/status', requireAuth('vendor'), approvedVendor, h(async(req,res)=>{
  const b=parse(z.object({status:z.enum(['preparing','ready'])}).strict(),req.body);
  const allowedFrom=b.status==='preparing'?'placed':'preparing';
  const {rows}=await q(`UPDATE orders o SET status=$3,updated_at=now() FROM stores s WHERE o.store_id=s.id AND s.vendor_id=$1 AND o.id=$2 AND o.paid=true AND o.status=$4 RETURNING o.id,o.status,o.customer_id`,[req.user.id,req.params.id,b.status,allowedFrom]);
  if(!rows[0])return res.status(409).json({error:'Only paid orders belonging to your store can move to the next preparation status. Refresh and try again.'});
  const message=b.status==='preparing'?'The vendor is preparing your order.':'Your order is ready for courier pickup.';
  notifyUser(rows[0].customer_id,'Order update',message,{orderId:rows[0].id});
  if(b.status==='ready') dispatchTick().catch(e=>console.error('Dispatch after order ready failed:',e.message));
  res.json({ id: rows[0].id, status: rows[0].status }); // vendors never see what the customer paid
}));

app.get('/vendor/orders', requireAuth('vendor'), approvedVendor, h(async (req, res) => {
    res.json((await q(
    `SELECT o.id,o.status,o.paid,o.subtotal,o.commission_rate,o.commission_amount,o.vendor_net_amount,o.created_at,u.name AS customer_name, a.line1,a.city
     FROM orders o JOIN stores s ON s.id=o.store_id JOIN users u ON u.id=o.customer_id JOIN addresses a ON a.id=o.address_id
     WHERE s.vendor_id=$1 ORDER BY o.created_at DESC LIMIT 100`, [req.user.id])).rows);
}));

app.patch('/vendor/store', requireAuth('vendor'), approvedVendor, h(async (req, res) => {
  const b = parse(z.object({ is_open: z.boolean() }).strict(), req.body);
  const { rows } = await q('UPDATE stores SET is_open=$2 WHERE vendor_id=$1 RETURNING *', [req.user.id,b.is_open]);
  if (!rows[0]) return res.status(404).json({ error: 'Your store was not found.' });
  res.json(rows[0]);
}));

// ---------- Customer support tickets ----------
app.get('/support/tickets', requireAuth(), h(async (req, res) => {
  if (!['customer','support','admin'].includes(req.user.role)) return res.status(403).json({ error: 'Support access is not available for this role.' });
  const query = req.user.role === 'customer'
    ? q('SELECT * FROM support_tickets WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 50',[req.user.id])
    : q(`SELECT t.*,u.name AS customer_name,u.email AS customer_email FROM support_tickets t JOIN users u ON u.id=t.customer_id ORDER BY t.created_at DESC LIMIT 100`);
  res.json((await query).rows);
}));

app.post('/support/tickets', requireAuth('customer'), h(async (req, res) => {
  const b = parse(z.object({ subject: z.string().trim().min(3).max(120), message: z.string().trim().min(5).max(4000), order_id: z.string().uuid().optional() }), req.body);
  if (b.order_id) {
    const owns = (await q('SELECT id FROM orders WHERE id=$1 AND customer_id=$2',[b.order_id,req.user.id])).rows[0];
    if (!owns) return res.status(404).json({ error: 'Order not found for this account.' });
  }
  const { rows } = await q('INSERT INTO support_tickets (customer_id,order_id,subject,message) VALUES ($1,$2,$3,$4) RETURNING *',[req.user.id,b.order_id ?? null,b.subject,b.message]);
  res.status(201).json(rows[0]);
}));

app.get('/support/tickets/:id/messages', requireAuth(), h(async (req,res)=>{
  const ticket = (await q('SELECT customer_id FROM support_tickets WHERE id=$1',[req.params.id])).rows[0];
  if (!ticket) return res.status(404).json({ error: 'Support ticket not found.' });
  if (req.user.role === 'customer' && ticket.customer_id !== req.user.id) return res.status(404).json({ error: 'Support ticket not found.' });
  if (!['customer','support','admin'].includes(req.user.role)) return res.status(403).json({ error: 'Support access is not available for this role.' });
  res.json((await q('SELECT m.id,m.message,m.created_at,m.author_id,u.name AS author_name,u.role AS author_role FROM support_messages m JOIN users u ON u.id=m.author_id WHERE m.ticket_id=$1 ORDER BY m.created_at',[req.params.id])).rows);
}));

app.post('/support/tickets/:id/messages', requireAuth(), h(async (req,res)=>{
  if (!['customer','support','admin'].includes(req.user.role)) return res.status(403).json({ error: 'Support access is not available for this role.' });
  const b = parse(z.object({ message: z.string().trim().min(1).max(4000) }),req.body);
  const ticket = (await q('SELECT customer_id,status FROM support_tickets WHERE id=$1',[req.params.id])).rows[0];
  if (!ticket || (req.user.role === 'customer' && ticket.customer_id !== req.user.id)) return res.status(404).json({ error: 'Support ticket not found.' });
  if (['closed','resolved'].includes(ticket.status) && req.user.role === 'customer') return res.status(409).json({ error: 'This ticket is closed. Create a new ticket if you still need help.' });
  const { rows } = await q('INSERT INTO support_messages (ticket_id,author_id,message) VALUES ($1,$2,$3) RETURNING *',[req.params.id,req.user.id,b.message]);
  await q("UPDATE support_tickets SET updated_at=now(), status=CASE WHEN status='open' AND $2 IN ('support','admin') THEN 'in_progress' ELSE status END WHERE id=$1",[req.params.id,req.user.role]);
  res.status(201).json(rows[0]);
}));

app.patch('/support/tickets/:id/status', requireAuth('support'), h(async (req,res)=>{
  const b = parse(z.object({ status: z.enum(['open','in_progress','escalated','resolved','closed']), admin_note: z.string().max(2000).optional() }).strict(),req.body);
  const { rows } = await q("UPDATE support_tickets SET status=$2,admin_note=COALESCE($3,admin_note),updated_at=now() WHERE id=$1 RETURNING *",[req.params.id,b.status,b.admin_note ?? null]);
  if (!rows[0]) return res.status(404).json({ error: 'Support ticket not found.' });
  res.json(rows[0]);
}));

app.patch('/admin/support/tickets/:id', adminOnly, h(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['open','in_progress','escalated','resolved','closed']).optional(), admin_note: z.string().max(2000).optional(), refund_status: z.enum(['none','requested','processing','completed','failed','rejected']).optional() }).strict(), req.body);
  const fields = Object.keys(b); if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });
  const sets = fields.map((k,i) => `${k}=$${i+2}`).join(', ');
  const { rows } = await q(`UPDATE support_tickets SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id,...fields.map(k=>b[k])]);
  if (!rows[0]) return res.status(404).json({ error: 'Support ticket not found.' });
  res.json(rows[0]);
}));

// ---------- Addresses ----------
app.get('/addresses', requireAuth(), h(async (req, res) => {
  res.json((await q('SELECT * FROM addresses WHERE user_id = $1', [req.user.id])).rows);
}));

app.post('/addresses', requireAuth('customer'), h(async (req, res) => {
  const b = parse(z.object({
    label: z.string().trim().min(1).max(60), line1: z.string().trim().min(3).max(300), city: z.string().trim().min(2).max(120),
    lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
  }).refine(v => (v.lat == null) === (v.lng == null), { message: 'Provide both GPS latitude and longitude, or neither.' }), req.body);
  const { rows } = await q(
    `INSERT INTO addresses (user_id, label, line1, city, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.id, b.label, b.line1, b.city, b.lat ?? null, b.lng ?? null]);
  res.status(201).json(rows[0]);
}));

async function getDeliveryPricing() {
  const rows=(await q(`SELECT key,value FROM app_settings WHERE key IN ('delivery_base_fee','delivery_per_km','delivery_min_fee','vendor_commission_percent','courier_share_percent')`)).rows;
  const values=Object.fromEntries(rows.map(r=>[r.key,Number(r.value)]));
  return { baseFee:Number.isFinite(values.delivery_base_fee)?values.delivery_base_fee:Number(process.env.DELIVERY_BASE_FEE??300), perKm:Number.isFinite(values.delivery_per_km)?values.delivery_per_km:Number(process.env.DELIVERY_PER_KM??180), minFee:Number.isFinite(values.delivery_min_fee)?values.delivery_min_fee:Number(process.env.DELIVERY_MIN_FEE??300), commissionPercent:Number.isFinite(values.vendor_commission_percent)?values.vendor_commission_percent:10, courierSharePercent:Number.isFinite(values.courier_share_percent)?values.courier_share_percent:100 };
}
// ---------- Catalog (public) ----------
app.get('/stores', h(async (req, res) => {
  const { category, search } = req.query;
  const hasLat=req.query.lat!==undefined, hasLng=req.query.lng!==undefined;
  if(hasLat!==hasLng)return res.status(400).json({error:'Provide both latitude and longitude to find nearby stores.'});
  let lat=null,lng=null,radiusKm=15;
  if(hasLat) {
    lat=Number(req.query.lat); lng=Number(req.query.lng); radiusKm=req.query.radiusKm===undefined?15:Number(req.query.radiusKm);
    if(!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lng)||lng < -180||lng>180||!Number.isFinite(radiusKm)||radiusKm<=0||radiusKm>100) return res.status(400).json({error:'Invalid location or search radius.'});
  }
  const { rows } = await q(
    `SELECT s.*,COALESCE(r.average_rating,0) AS average_rating,COALESCE(r.rating_count,0)::int AS rating_count FROM stores s
     LEFT JOIN LATERAL (SELECT round(avg(stars)::numeric,1) AS average_rating,count(*) AS rating_count FROM order_ratings WHERE store_id=s.id) r ON true
     WHERE s.is_open AND ($1::text IS NULL OR s.category = $1 OR $1 = ANY(s.categories))
       AND ($2::text IS NULL OR s.name ILIKE '%' || $2 || '%')
     ORDER BY s.name`, [category ?? null, search ?? null]);
  if(!hasLat) return res.json(rows);
    const zones=(await q('SELECT center_lat,center_lng,radius_km FROM delivery_zones WHERE enabled=true')).rows;
  if(zones.length&&!isInsideDeliveryZone(lat,lng,zones)) return res.json([]);
  const nearby=rows.filter(s=>s.lat!=null&&s.lng!=null).map(s=>({...s,distance_km:haversineKm(lat,lng,Number(s.lat),Number(s.lng))})).filter(s=>s.distance_km<=radiusKm).sort((a,b)=>a.distance_km-b.distance_km);
  res.json(nearby);
}));

app.get('/stores/:id', h(async (req, res) => {
  const s = (await q(`SELECT s.*,COALESCE(r.average_rating,0) AS average_rating,COALESCE(r.rating_count,0)::int AS rating_count FROM stores s LEFT JOIN LATERAL (SELECT round(avg(stars)::numeric,1) AS average_rating,count(*) AS rating_count FROM order_ratings WHERE store_id=s.id) r ON true WHERE s.id=$1`, [req.params.id])).rows[0];
  if (!s) return res.status(404).json({ error: 'Store not found' });
  const products = (await q(
    'SELECT id, name, price FROM products WHERE store_id = $1 AND available ORDER BY id', [s.id])).rows;
  res.json({ ...s, products });
}));

// Delivery quote for checkout UI. The order endpoint recalculates the fee again at placement time.
app.get('/delivery/quote', requireAuth('customer'), h(async (req,res)=>{
  const storeId = Number(req.query.storeId);
  const addressId = typeof req.query.addressId === 'string' ? req.query.addressId : '';
  if (!Number.isInteger(storeId) || storeId < 1 || !addressId) return res.status(400).json({ error: 'Choose a store and delivery address.' });
  const store = (await q('SELECT id,delivery_fee,lat,lng FROM stores WHERE id=$1 AND is_open=true',[storeId])).rows[0];
  if (!store) return res.status(404).json({ error: 'This store is closed or unavailable.' });
  const address = (await q('SELECT id,lat,lng FROM addresses WHERE id=$1 AND user_id=$2',[addressId,req.user.id])).rows[0];
  if (!address) return res.status(404).json({ error: 'Delivery address not found.' });
  if(store.lat==null||store.lng==null) return res.status(409).json({error:'This store has not configured its GPS location yet. Please choose another store or contact support.'});
  if(address.lat==null||address.lng==null) return res.status(400).json({error:'Add your delivery address GPS location before checkout so we can calculate delivery and confirm coverage.'});
  const zones = (await q('SELECT id,name,center_lat,center_lng,radius_km FROM delivery_zones WHERE enabled=true')).rows;
  assertAddressAllowedByZones(address, zones);
  const distanceKm = haversineKm(Number(store.lat),Number(store.lng),Number(address.lat),Number(address.lng));
  const pricing=await getDeliveryPricing();
  const fee = Math.max(pricing.minFee,Math.round(pricing.baseFee+distanceKm*pricing.perKm));
  res.json({ deliveryFee: fee, distanceKm, pricing: 'distance' });
}));

// ---------- Orders (customer) ----------
const orderSchema = z.object({
  storeId: z.number().int(),
  addressId: z.string().uuid(),
  items: z.array(z.object({ productId: z.number().int(), quantity: z.number().int().min(1).max(50) })).min(1),
});

app.post('/orders', requireAuth('customer'), h(async (req, res) => {
  const b = parse(orderSchema, req.body);
  const order = await tx(async (c) => {
    const store = (await c.query('SELECT * FROM stores WHERE id = $1 AND is_open', [b.storeId])).rows[0];
    if (!store) throw httpError(400, 'This store is closed or does not exist');
    const addr = (await c.query('SELECT id,lat,lng FROM addresses WHERE id = $1 AND user_id = $2',
      [b.addressId, req.user.id])).rows[0];
    if (!addr) throw httpError(400, 'Choose one of your saved addresses');
    if(store.lat==null||store.lng==null) throw httpError(409,'This store has not configured its GPS location yet. Please choose another store or contact support.');
    if(addr.lat==null||addr.lng==null) throw httpError(400,'Add your delivery address GPS location before checkout so we can calculate delivery and confirm coverage.');
    const zones = (await c.query('SELECT id,name,center_lat,center_lng,radius_km FROM delivery_zones WHERE enabled=true')).rows;
    assertAddressAllowedByZones(addr, zones);

    // Prices always come from the database, never from the client.
    const ids = b.items.map((i) => i.productId);
    const prods = (await c.query(
      'SELECT id, name, price FROM products WHERE id = ANY($1) AND store_id = $2 AND available',
      [ids, store.id])).rows;
    if (prods.length !== new Set(ids).size) throw httpError(400, 'An item is unavailable');

    const lines = b.items.map((i) => {
      const p = prods.find((x) => x.id === i.productId);
      return { ...i, name: p.name, unit: Number(p.price) };
    });
    const subtotal = lines.reduce((a, l) => a + l.unit * l.quantity, 0);
    const pricing=await getDeliveryPricing();
    const fee = Math.max(pricing.minFee, Math.round(pricing.baseFee + haversineKm(Number(store.lat), Number(store.lng), Number(addr.lat), Number(addr.lng)) * pricing.perKm));
    // Commission applies only to the food subtotal, never the delivery fee. Snapshot it on each order.
    const commissionRate = pricing.commissionPercent;
    const commissionAmount = Math.round(subtotal * commissionRate) / 100;
    const vendorNetAmount = Math.round((subtotal - commissionAmount) * 100) / 100;

      const o = (await c.query(
      `INSERT INTO orders (customer_id, store_id, address_id, subtotal, delivery_fee, total, commission_rate, commission_amount, vendor_net_amount, courier_share_percent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, store.id, b.addressId, subtotal, fee, subtotal + fee, commissionRate, commissionAmount, vendorNetAmount, pricing.courierSharePercent])).rows[0];
    for (const l of lines)
      await c.query(
        `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity)
         VALUES ($1,$2,$3,$4,$5)`, [o.id, l.productId, l.name, l.unit, l.quantity]);
    return o;
  });
  res.status(201).json(order);
}));

app.get('/orders', requireAuth('customer'), h(async (req, res) => {
  res.json((await q(
    `SELECT o.*, s.name AS store_name FROM orders o JOIN stores s ON s.id = o.store_id
     WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id])).rows);
}));

// Order details + live courier position (the customer app polls this every few seconds).
app.get('/orders/:id', requireAuth(), h(async (req, res) => {
  const o = (await q(
    `SELECT o.*, s.name AS store_name FROM orders o JOIN stores s ON s.id = o.store_id
     WHERE o.id = $1 AND (o.customer_id = $2 OR o.courier_id = $2 OR $3 = 'admin')`,
    [req.params.id, req.user.id, req.user.role])).rows[0];
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const items = (await q('SELECT name, unit_price, quantity FROM order_items WHERE order_id = $1', [o.id])).rows;
  const courier = o.courier_id
    ? (await q('SELECT lat, lng, updated_at FROM courier_locations WHERE courier_id = $1', [o.courier_id])).rows[0] ?? null
    : null;
  const address = (await q('SELECT label, line1, city, lat, lng FROM addresses WHERE id = $1', [o.address_id])).rows[0] ?? null;
  res.json({ ...o, items, courierLocation: courier, address });
}));

// Customer feedback is allowed only for their own completed, paid order.
app.get('/orders/:id/rating', requireAuth('customer'), h(async (req, res) => {
  const order = (await q('SELECT id FROM orders WHERE id=$1 AND customer_id=$2', [req.params.id, req.user.id])).rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const rating = (await q('SELECT stars,comment,created_at,updated_at FROM order_ratings WHERE order_id=$1 AND customer_id=$2', [req.params.id,req.user.id])).rows[0] ?? null;
  res.json(rating);
}));

app.post('/orders/:id/rating', requireAuth('customer'), h(async (req, res) => {
  const b = parse(z.object({ stars: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).default('') }).strict(), req.body);
  const order = (await q(`SELECT id,customer_id,store_id,courier_id,status,paid FROM orders WHERE id=$1 AND customer_id=$2`, [req.params.id,req.user.id])).rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status !== 'delivered' || !order.paid) return res.status(409).json({ error: 'You can rate an order after delivery and confirmed payment.' });
  const { rows } = await q(`INSERT INTO order_ratings (order_id,customer_id,store_id,courier_id,stars,comment)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (order_id) DO UPDATE SET stars=EXCLUDED.stars,comment=EXCLUDED.comment,updated_at=now()
    WHERE order_ratings.customer_id=EXCLUDED.customer_id RETURNING order_id,stars,comment,created_at,updated_at`,
    [order.id,req.user.id,order.store_id,order.courier_id,b.stars,b.comment]);
  if (!rows[0]) return res.status(409).json({ error: 'This order has already been rated by a different account.' });
  res.status(201).json(rows[0]);
}));

app.post('/orders/:id/cancel', requireAuth('customer'), h(async (req, res) => {
  const { rows } = await q(
    `UPDATE orders SET status='cancelled', updated_at=now()
     WHERE id=$1 AND customer_id=$2 AND status='placed' RETURNING *`, [req.params.id, req.user.id]);
  const o = rows[0];
  if (!o) return res.status(409).json({ error: 'Only orders that have not started can be cancelled' });
  const refundResult = await requestOrderRefund(o.id);
  const refund = refundResult.kind === 'requested' ? 'requested' : (refundResult.status || o.refund_status || 'none');
  res.json({ ...o, refund, refund_status:refund, refundMessage: refundResult.kind === 'uncertain' ? 'Refund status is being reconciled. Do not retry until the Paystack dashboard has been checked.' : undefined });
}));

// ---------- Payments (NGN; gateways are switched on/off by admins in the panel) ----------
async function enabledGateways() {
  await q(`INSERT INTO payment_gateways(code,enabled,sort_order) SELECT c,(c='paystack'),100 FROM unnest($1::text[]) AS c ON CONFLICT (code) DO NOTHING`, [gatewayCodes]);
  const { rows } = await q('SELECT code,enabled FROM payment_gateways ORDER BY sort_order, code');
  return rows.filter((r) => r.enabled && isConfigured(r.code)).map((r) => r.code);
}

app.get('/payment-gateways', requireAuth('customer'), h(async (_req, res) => {
  res.json((await enabledGateways()).map(publicInfo));
}));

app.post('/orders/:id/pay', payLimiter, requireAuth('customer'), h(async (req, res) => {
  const b = parse(z.object({ gateway: z.string().trim().max(30).optional() }).strict(), req.body ?? {});
  const available = await enabledGateways();
  const code = b.gateway ?? available[0];
  if (!code || !available.includes(code)) {
    return res.status(409).json({ error: b.gateway ? 'That payment method is not available right now. Please choose another.' : 'No payment method is available right now. Please try again later.' });
  }
  const { rows } = await q(
    `SELECT o.id, o.total, o.paid, o.status, o.customer_id, u.email
     FROM orders o JOIN users u ON u.id = o.customer_id
     WHERE o.id = $1 AND o.customer_id = $2`, [req.params.id, req.user.id]);
  const o = rows[0];
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (o.paid) return res.status(409).json({ error: 'This order is already paid' });
  if (o.status === 'cancelled') return res.status(409).json({ error: 'This order was cancelled' });
  const amountKobo = Math.round(Number(o.total) * 100);
  if (!Number.isSafeInteger(amountKobo) || amountKobo < 1) return res.status(409).json({ error: 'This order has an invalid payment amount. Contact support.' });
  const reference = `cnct-${o.id}-${crypto.randomUUID()}`;
  await q(`INSERT INTO payment_attempts(reference,order_id,amount_kobo,status,gateway) VALUES($1,$2,$3,'initializing',$4)`, [reference,o.id,amountKobo,code]);
  try {
    const d = await gateways[code].initialize({
      order: { id: o.id, customerId: o.customer_id },
      reference, amountKobo, email: o.email, publicUrl: process.env.PUBLIC_URL,
    });
    await q(`UPDATE payment_attempts SET status='initialized',updated_at=now() WHERE reference=$1 AND status='initializing'`, [reference]);
    res.json({ url: d.url, reference: d.reference, gateway: code });
  } catch (e) {
    await q(`UPDATE payment_attempts SET status='failed',updated_at=now() WHERE reference=$1 AND status='initializing'`, [reference]).catch(()=>{});
    throw e;
  }
}));

app.get('/admin/gateways', adminOnly, h(async (_req, res) => {
  await enabledGateways();
  const { rows } = await q('SELECT code,enabled,updated_at FROM payment_gateways ORDER BY sort_order, code');
  res.json(rows.filter((r) => gateways[r.code]).map((r) => ({ ...publicInfo(r.code), enabled: r.enabled, configured: isConfigured(r.code), updated_at: r.updated_at })));
}));

app.patch('/admin/gateways/:code', adminOnly, h(async (req, res) => {
  const code = req.params.code;
  if (!gateways[code]) return res.status(404).json({ error: 'Unknown payment gateway' });
  const b = parse(z.object({ enabled: z.boolean() }).strict(), req.body);
  const available = await enabledGateways();
  if (b.enabled && !isConfigured(code)) return res.status(409).json({ error: `${gateways[code].name} cannot be switched on until its keys are set on the server.` });
  if (!b.enabled && !available.filter((c) => c !== code).length) return res.status(409).json({ error: 'At least one working payment gateway must stay switched on, or customers cannot pay.' });
  await q('UPDATE payment_gateways SET enabled=$2, updated_by=$3, updated_at=now() WHERE code=$1', [code, b.enabled, req.user.id]);
  res.json({ code, enabled: b.enabled });
}));


// Paystack sends the customer here after paying. We confirm with Paystack directly,
// so this also works in local testing where webhooks cannot reach your computer.
app.get('/payment/done', h(async (req, res) => {
  let heading = 'Payment not confirmed';
  let message = 'We could not verify this payment. Check your order in Cönëct before trying again.';
  if (typeof req.query.reference === 'string' && req.query.reference.length <= 200) {
    try {
      const paid = await confirmPayment(req.query.reference);
      if (paid) { heading = 'Payment successful'; message = 'Your payment has been verified. You can return to the Cönëct app.'; }
      else {
          const attempt = (await q('SELECT gateway FROM payment_attempts WHERE reference=$1', [req.query.reference])).rows[0];
        if (attempt && gateways[attempt.gateway]) {
          const d = await gateways[attempt.gateway].verify(req.query.reference);
          if (d.state === 'pending') { heading = 'Payment pending'; message = 'We have not received confirmation yet. Transfers and USSD can take a moment. Check your order in Cönëct shortly.'; }
          else if (d.state !== 'paid') { heading = 'Payment not completed'; message = 'No successful payment was confirmed. Return to Cönëct to review your order.'; }
        }
      }
    } catch (e) { console.error('Payment callback verification failed:', e.message); }
  }
  const back = (process.env.CUSTOMER_APP_URL || '').replace(/\/$/, '');
  const ok = /^https:\/\//i.test(back);
  const target = `${back}/?orders=1`;
  const refresh = ok ? `<meta http-equiv="refresh" content="2;url=${target}">` : '';
  const button = ok ? `<p><a href="${target}" style="display:inline-block;padding:13px 20px;background:#6D28D9;color:white;text-decoration:none;border-radius:8px">Back to Cönëct</a></p>` : '';
  res.status(200).type('html').send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}<title>${heading}</title><body style="font-family:system-ui;text-align:center;padding:48px 24px"><h2>${heading}</h2><p>${message}</p>${button}</body>`);
}));

async function requestOrderRefund(orderId, { ticketId = null } = {}) {
  // Claim the refund while holding the order row lock. All cancellation and support
  // routes share this helper so concurrent requests cannot independently call Paystack.
  const claim = await tx(async (client) => {
    const order = (await client.query('SELECT id,customer_id,paid,payment_ref,refund_status FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!order) return { kind: 'not_found' };
    if (!order.paid || !order.payment_ref) return { kind: 'not_paid', orderId: order.id };
    if (['requested', 'processing', 'completed', 'failed', 'rejected'].includes(order.refund_status)) return { kind: 'already_claimed', status: order.refund_status, orderId: order.id };
    if (ticketId !== null) {
      const ticket = (await client.query('SELECT id,customer_id,order_id FROM support_tickets WHERE id=$1 FOR UPDATE', [ticketId])).rows[0];
      if (!ticket || String(ticket.order_id) !== String(order.id) || String(ticket.customer_id) !== String(order.customer_id)) return { kind: 'ticket_mismatch' };
    }
    await client.query("UPDATE orders SET refund_status='processing',refund_updated_at=now() WHERE id=$1", [order.id]);
    await client.query("UPDATE support_tickets SET refund_status='processing',updated_at=now() WHERE order_id=$1 AND customer_id=$2 AND refund_status NOT IN ('completed','rejected')", [order.id, order.customer_id]);
    await reverseOrderEarnings(client, order.id); // no-op unless the order was already delivered and paid out to wallets
    const att = (await client.query('SELECT gateway,amount_kobo FROM payment_attempts WHERE reference=$1', [order.payment_ref])).rows[0];
    return { kind: 'claimed', orderId: order.id, customerId: order.customer_id, paymentRef: order.payment_ref, gateway: att?.gateway || 'paystack', amountKobo: att ? Number(att.amount_kobo) : null };
  });
  if (claim.kind !== 'claimed') return claim;
  try {
    await gateways[claim.gateway].refund(claim.paymentRef, { amountKobo: claim.amountKobo });
    const result = await tx(async (client) => {
      const order = (await client.query("UPDATE orders SET refund_status='requested',refund_updated_at=now() WHERE id=$1 AND refund_status='processing' RETURNING id,refund_status,refund_updated_at", [claim.orderId])).rows[0];
      await client.query("UPDATE support_tickets SET refund_status='requested',updated_at=now() WHERE order_id=$1 AND customer_id=$2 AND refund_status='processing'", [claim.orderId, claim.customerId]);
      return order;
    });
    return { kind: 'requested', orderId: claim.orderId, status: result?.refund_status || 'processing' };
  } catch (e) {
    // A timeout can happen after Paystack accepted the request. Keep processing and
    // require dashboard reconciliation; never automatically submit a second refund.
    console.error('Paystack refund result uncertain; manual reconciliation required for order', claim.orderId, e.message);
    return { kind: 'uncertain', orderId: claim.orderId, status: 'processing' };
  }
}


// Never trust the client or webhook payload for payment details. Verify with Paystack,
// match the reference to a server-created attempt, then lock the order before applying payment.
async function confirmPayment(reference) {
  if (typeof reference !== 'string' || reference.length < 1 || reference.length > 200) return null;
  const attempt = (await q('SELECT reference,order_id,amount_kobo,status,gateway FROM payment_attempts WHERE reference=$1', [reference])).rows[0];
  const gw = attempt && gateways[attempt.gateway];
  if (!gw) return null;
  const d = await gw.verify(reference);
  if (d.state !== 'paid' || d.reference !== reference || d.currency !== 'NGN') return null;
  if (gw.matchesOrderId && (!d.orderId || String(attempt.order_id) !== String(d.orderId))) return null;
  if (Number(d.amountKobo) !== Number(attempt.amount_kobo)) return null;

  const outcome = await tx(async (c) => {
    const a = (await c.query('SELECT * FROM payment_attempts WHERE reference=$1 FOR UPDATE', [reference])).rows[0];
    const o = (await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [attempt.order_id])).rows[0];
    if (!a || !o) return { kind: 'invalid' };
    if (a.status === 'paid' && o.paid && o.payment_ref === reference) return { kind: 'already_paid', order: o };
    if (o.paid || o.status === 'cancelled') {
      if (a.status !== 'refund_requested' && a.status !== 'refund_failed') {
        await c.query(`UPDATE payment_attempts SET status='refund_requested',updated_at=now() WHERE reference=$1`, [reference]);
        return { kind: 'refund', order: o };
      }
      // A prior refund request may have reached Paystack even if our HTTP call timed out.
      // Never auto-retry a late/duplicate-charge refund from a callback; reconcile manually.
      return { kind: 'refund_pending', order: o };
    }
    const updated = (await c.query(
      `UPDATE orders SET paid=true,payment_ref=$2,updated_at=now() WHERE id=$1 AND paid=false AND status<>'cancelled' RETURNING *`,
      [o.id, reference])).rows[0];
    if (!updated) return { kind: 'invalid' };
    await c.query(`UPDATE payment_attempts SET status='paid',updated_at=now() WHERE reference=$1`, [reference]);
    return { kind: 'paid', order: updated };
  });

  if (outcome.kind === 'refund') {
    try {
      await gw.refund(reference, { amountKobo: Number(attempt.amount_kobo) });
      await q(`UPDATE payment_attempts SET status='refund_requested',updated_at=now() WHERE reference=$1`, [reference]);
    } catch (e) {
      // The provider may have accepted the refund before the connection failed.
      // Store a non-retryable state and require dashboard reconciliation.
      await q(`UPDATE payment_attempts SET status='refund_failed',updated_at=now() WHERE reference=$1`, [reference]);
      console.error('Late/duplicate payment refund outcome uncertain; manual Paystack reconciliation required:', e.message);
    }
    return null;
  }
  if (outcome.kind === 'paid') {
    notifyUser(outcome.order.customer_id, 'Payment received', 'Payment confirmed. The store will prepare your order.', { orderId: outcome.order.id });
    return outcome.order;
  }
  return outcome.kind === 'already_paid' ? outcome.order : null;
}
app.post('/webhooks/opay', h(async (req, res) => {
  const event = req.body;
  const reference = event && event.payload && event.payload.reference;
  if (!event || event.type !== 'transaction-status' || typeof reference !== 'string' || reference.length > 200) return res.sendStatus(200);
  const known = (await q(`SELECT 1 FROM payment_attempts WHERE reference=$1 AND gateway='opay'`, [reference])).rows[0];
  if (!known) return res.sendStatus(200);
  try {
    await confirmPayment(reference);
    return res.sendStatus(200);
  } catch (e) {
    console.error('OPay webhook processing failed:', e.message);
    return res.status(500).json({ error: 'Webhook processing failed; retry later.' });
  }
}));

async function paystackWebhook(req, res) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Invalid webhook configuration or body.' });

  const supplied = req.get('x-paystack-signature') || '';
  const expected = crypto.createHmac('sha512', secret).update(req.body).digest();
  if (!/^[a-f0-9]{128}$/i.test(supplied)) return res.sendStatus(401);
  const suppliedBytes = Buffer.from(supplied, 'hex');
  if (suppliedBytes.length !== expected.length || !crypto.timingSafeEqual(suppliedBytes, expected)) return res.sendStatus(401);

  let event;
  try { event = JSON.parse(req.body.toString('utf8')); }
  catch { return res.status(400).json({ error: 'Malformed webhook JSON.' }); }

  // A valid signature authenticates the payload, but payment state must still be
  // verified against Paystack's API and a server-created checkout attempt.
  if (event?.event !== 'charge.success') return res.sendStatus(200);
  const reference = event?.data?.reference;
  if (typeof reference !== 'string' || reference.length < 1 || reference.length > 200) {
    return res.status(400).json({ error: 'Missing or invalid transaction reference.' });
  }
  try {
    await confirmPayment(reference);
    return res.sendStatus(200);
  } catch (e) {
    // Return a retryable status for provider/network/database errors. Paystack can
    // redeliver the event; confirmPayment is designed to be idempotent by reference.
    console.error('Paystack webhook processing failed:', e.message);
    return res.status(500).json({ error: 'Webhook processing failed; retry later.' });
  }
}

// ---------- Couriers ----------
app.get('/courier/profile', requireAuth('courier'), h(async(req,res)=>{
  const profile=(await q('SELECT * FROM courier_profiles WHERE user_id=$1',[req.user.id])).rows[0]??null;
  const user=(await q('SELECT courier_approved FROM users WHERE id=$1',[req.user.id])).rows[0];
  const documents=(await q('SELECT id,document_type,filename,mime_type,review_status,created_at FROM verification_documents WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id])).rows;
  res.json({profile,approved:Boolean(user?.courier_approved),documents});
}));
app.put('/courier/profile', requireAuth('courier'), h(async(req,res)=>{
  const b=parse(z.object({phone:z.string().trim().min(7).max(30),address:z.string().trim().min(5).max(300),vehicle_type:z.enum(['bicycle','motorcycle','car','other']),license_number:z.string().trim().max(100).optional()}).strict(),req.body);
  const {rows}=await q(`INSERT INTO courier_profiles(user_id,phone,address,vehicle_type,license_number) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET phone=$2,address=$3,vehicle_type=$4,license_number=$5,updated_at=now() RETURNING *`,[req.user.id,b.phone,b.address,b.vehicle_type,b.license_number??null]);
  await q('UPDATE users SET phone=$2 WHERE id=$1',[req.user.id,b.phone]);
  res.json(rows[0]);
}));

app.get('/courier/available', requireAuth('courier'), approvedCourier, h(async (req, res) => {
  // Serverless deployments have no reliable in-memory timer. Courier polling advances dispatch waves.
  await dispatchTick();
  res.json((await q(
    `SELECT o.id, o.total, o.delivery_fee, s.name AS store_name,
            s.lat AS pickup_lat, s.lng AS pickup_lng, vp.address AS pickup_address,
            a.line1, a.city
     FROM orders o JOIN stores s ON s.id=o.store_id JOIN addresses a ON a.id=o.address_id
     LEFT JOIN vendor_profiles vp ON vp.user_id=s.vendor_id
     JOIN order_offers f ON f.order_id=o.id AND f.courier_id=$1
     WHERE o.courier_id IS NULL AND o.paid AND o.status = 'ready'
     ORDER BY o.created_at LIMIT 20`,[req.user.id])).rows);
}));

// Atomic claim: only an explicitly offered courier can win the order.
app.post('/courier/orders/:id/accept', requireAuth('courier'), approvedCourier, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE orders o SET courier_id=$2, updated_at=now()
     WHERE o.id=$1 AND o.courier_id IS NULL AND o.paid AND o.status='ready'
       AND EXISTS (SELECT 1 FROM order_offers f WHERE f.order_id=o.id AND f.courier_id=$2)
       AND NOT EXISTS (SELECT 1 FROM orders a WHERE a.courier_id=$2 AND a.status IN ('ready','picked_up')) RETURNING o.*`,
    [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(409).json({ error: 'Another courier already took this order' });
  notifyUser(rows[0].customer_id, 'Courier assigned', 'A courier accepted your order.', { orderId: rows[0].id });
  res.json(rows[0]);
}));
import { registerDeliveryPin } from './delivery-pin.js';
registerDeliveryPin(app, { approvedCourier });
import { registerExtras } from './extras.js';
registerExtras(app, { approvedCourier, approvedVendor });
registerWallet(app, { adminOnly });
import { registerLegal } from './legal.js';
registerLegal(app);

const NEXT = { ready: 'picked_up', picked_up: 'delivered' };

app.post('/courier/orders/:id/advance', requireAuth('courier'), approvedCourier, h(async (req, res) => {
  const cur = (await q('SELECT status FROM orders WHERE id=$1 AND courier_id=$2',
    [req.params.id, req.user.id])).rows[0];
    if (!cur || !NEXT[cur.status]) return res.status(409).json({ error: 'Cannot advance this order' });
  // Marking delivered and paying the vendor/courier wallets happen in one transaction: both or neither.
  const rows = await tx(async (c) => {
    const upd = (await c.query(
      `UPDATE orders SET status=$3, updated_at=now() WHERE id=$1 AND courier_id=$2 AND status=$4 RETURNING *`,
      [req.params.id, req.user.id, NEXT[cur.status], cur.status])).rows;
    if (upd[0] && ['picked_up', 'delivered'].includes(upd[0].status)) await creditOrderEarnings(c, upd[0].id);
    return upd;
  });
  if (!rows[0]) return res.status(409).json({ error: 'The order changed, please refresh' });
  const MESSAGES = {
    preparing: 'Your order is being prepared.',
    ready: 'Your order is ready for pickup.',
    picked_up: 'Your courier is on the way.',
    delivered: 'Delivered. Enjoy!',
  };
  notifyUser(rows[0].customer_id, 'Order update', MESSAGES[rows[0].status], { orderId: rows[0].id });
  res.json(rows[0]);
}));

app.put('/courier/location', requireAuth('courier'), approvedCourier, h(async (req, res) => {
  const b = parse(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), req.body);
  await q(
    `INSERT INTO courier_locations (courier_id, lat, lng) VALUES ($1,$2,$3)
     ON CONFLICT (courier_id) DO UPDATE SET lat=$2, lng=$3, updated_at=now()`,
    [req.user.id, b.lat, b.lng]);
  res.status(204).end();
}));

// Orders this courier has accepted and not yet delivered.
app.get('/courier/active', requireAuth('courier'), approvedCourier, h(async (req, res) => {
  res.json((await q(
    `SELECT o.id, o.status, o.total, s.name AS store_name,
            s.lat AS pickup_lat, s.lng AS pickup_lng, vp.address AS pickup_address,
            a.label, a.line1, a.city, u.phone AS customer_phone
     FROM orders o JOIN stores s ON s.id=o.store_id JOIN addresses a ON a.id=o.address_id
     JOIN users u ON u.id=o.customer_id
     LEFT JOIN vendor_profiles vp ON vp.user_id=s.vendor_id
     WHERE o.courier_id=$1 AND o.status IN ('ready','picked_up')
     ORDER BY o.created_at`, [req.user.id])).rows);
}));

// ---------- Admin ----------
app.post('/admin/support/users', adminOnly, h(async (req,res)=>{
  const b = parse(z.object({ name:z.string().trim().min(1).max(120),email:z.string().email(),password:z.string().min(12).max(200) }),req.body);
  const hash = await bcrypt.hash(b.password,10);
  try {
    const { rows } = await q("INSERT INTO users (email,password_hash,name,role,email_verified_at) VALUES (lower($1),$2,$3,'support',now()) RETURNING id,email,name,role,email_verified_at",[b.email,hash,b.name]);
    res.status(201).json(rows[0]);
  } catch(e) { if (e.code==='23505') return res.status(409).json({error:'That email is already registered'}); throw e; }
}));
const CATEGORIES = z.enum(['food', 'groceries', 'pharmacy', 'fashion', 'gadgets', 'beauty', 'courier']);

// Build "UPDATE ... SET a=$1, b=$2" from only the fields that were sent.
async function patchRow(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) throw httpError(400, 'Nothing to update');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const { rows } = await q(`UPDATE ${table} SET ${sets} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => data[k])]);
  if (!rows[0]) throw httpError(404, 'Not found');
  return rows[0];
}

// Delivery-zone administration. Zones are circular areas where delivery is disabled.
app.get('/admin/delivery-zones', adminOnly, h(async (_req,res)=>{
  res.json((await q('SELECT * FROM delivery_zones ORDER BY enabled DESC,name')).rows);
}));
app.post('/admin/delivery-zones', adminOnly, h(async (req,res)=>{
  const b=parse(z.object({name:z.string().trim().min(2).max(120),center_lat:z.number().min(-90).max(90),center_lng:z.number().min(-180).max(180),radius_km:z.number().positive().max(500),enabled:z.boolean().default(true)}).strict(),req.body);
  const {rows}=await q('INSERT INTO delivery_zones (name,center_lat,center_lng,radius_km,enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *',[b.name,b.center_lat,b.center_lng,b.radius_km,b.enabled]);
  res.status(201).json(rows[0]);
}));
app.patch('/admin/delivery-zones/:id', adminOnly, h(async (req,res)=>{
  const b=parse(z.object({name:z.string().trim().min(2).max(120),center_lat:z.number().min(-90).max(90),center_lng:z.number().min(-180).max(180),radius_km:z.number().positive().max(500),enabled:z.boolean()}).partial().strict(),req.body);
  const keys=Object.keys(b); if(!keys.length)return res.status(400).json({error:'Nothing to update.'});
  const sets=keys.map((k,i)=>`${k}=$${i+2}`).join(', ');
  const {rows}=await q(`UPDATE delivery_zones SET ${sets},updated_at=now() WHERE id=$1 RETURNING *`,[req.params.id,...keys.map(k=>b[k])]);
  if(!rows[0])return res.status(404).json({error:'Delivery zone not found.'}); res.json(rows[0]);
}));
app.delete('/admin/delivery-zones/:id', adminOnly, h(async (req,res)=>{
  const {rowCount}=await q('DELETE FROM delivery_zones WHERE id=$1',[req.params.id]);
  if(!rowCount)return res.status(404).json({error:'Delivery zone not found.'}); res.status(204).end();
}));

app.get('/admin/orders', adminOnly, h(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  res.json((await q(
    `SELECT o.id, o.status, o.paid, o.total, o.refund_status, o.refund_note, o.created_at, s.name AS store_name,
            c.name AS customer_name, k.name AS courier_name
     FROM orders o JOIN stores s ON s.id = o.store_id JOIN users c ON c.id = o.customer_id
     LEFT JOIN users k ON k.id = o.courier_id
     WHERE ($1::text IS NULL OR o.status = $1)
     ORDER BY o.created_at DESC LIMIT 100`, [status])).rows);
}));

app.post('/admin/orders/:id/cancel', adminOnly, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE orders SET status='cancelled', updated_at=now()
     WHERE id=$1 AND status NOT IN ('delivered','cancelled') RETURNING *`, [req.params.id]);
  const o = rows[0];
  if (!o) return res.status(409).json({ error: 'This order is already finished' });
  const refundResult = await requestOrderRefund(o.id);
  const refund = refundResult.kind === 'requested' ? 'requested' : (refundResult.status || o.refund_status || 'none');
  notifyUser(o.customer_id, 'Order cancelled', refund === 'requested' ? 'Your order was cancelled. A refund request has been sent for review.' : 'Your order was cancelled. If a refund is due, its status is being checked.', { orderId: o.id });
  res.json({ ...o, refund, refund_status:refund, refundMessage: refundResult.kind === 'uncertain' ? 'Refund status is being reconciled. Check Paystack before retrying.' : undefined });
}));

app.patch('/admin/orders/:id/refund-status', adminOnly, h(async(req,res)=>{
  const b=parse(z.object({
    status:z.enum(['requested','processing','completed','failed','rejected']),
    note:z.string().trim().max(2000).optional(),
    provider_reference:z.string().trim().min(1).max(200).optional()
  }).strict(),req.body);
  // A refund may only be marked completed after an admin records the provider's
  // refund reference from Paystack. This is an auditable manual reconciliation,
  // not proof that the provider reference itself was independently verified.
  if (b.status === 'completed' && (!b.provider_reference || !b.note)) {
    return res.status(400).json({error:'A Paystack refund reference and reconciliation note are required before marking a refund completed.'});
  }
  const result = await tx(async client => {
    const current = (await client.query('SELECT id,paid,refund_status FROM orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if (!current || !current.paid) return {kind:'not_found'};
    if (current.refund_status === 'completed' && b.status !== 'completed') return {kind:'conflict',message:'A completed refund cannot be moved to another status. Reconcile with Paystack before any correction.'};
    if (current.refund_status === 'rejected' && !['rejected'].includes(b.status)) return {kind:'conflict',message:'A rejected refund cannot be reopened through this endpoint. Review Paystack and use the documented reconciliation procedure.'};
    const updated = (await client.query(
      `UPDATE orders SET refund_status=$2,refund_note=$3,
         refund_provider_reference=CASE WHEN $2='completed' THEN $4 ELSE refund_provider_reference END,
         refund_reconciled_by=CASE WHEN $2='completed' THEN $5 ELSE refund_reconciled_by END,
         refund_reconciled_at=CASE WHEN $2='completed' THEN now() ELSE refund_reconciled_at END,
         refund_updated_at=now()
       WHERE id=$1 RETURNING id,refund_status,refund_note,refund_provider_reference,refund_reconciled_by,refund_reconciled_at,refund_updated_at`,
      [req.params.id,b.status,b.note??null,b.provider_reference??null,req.user.id])).rows[0];
        await client.query('UPDATE support_tickets SET refund_status=$2,updated_at=now() WHERE order_id=$1',[req.params.id,b.status]);
    if (['failed','rejected'].includes(b.status)) await restoreOrderEarnings(client, req.params.id);
    else await reverseOrderEarnings(client, req.params.id);
    return {kind:'ok',order:updated};
  });
  if (result.kind==='not_found') return res.status(404).json({error:'Paid order not found.'});
  if (result.kind==='conflict') return res.status(409).json({error:result.message});
  res.json(result.order);
}));

app.get('/admin/settings', adminOnly, h(async(_req,res)=>{
  const rows=(await q('SELECT key,value,updated_at FROM app_settings ORDER BY key')).rows;
  res.json(Object.fromEntries(rows.map(r=>[r.key,{value:Number(r.value),updated_at:r.updated_at}])));
}));
app.patch('/admin/settings/delivery-fees', adminOnly, h(async(req,res)=>{
  const b=parse(z.object({base_fee:z.number().min(0).max(100000),per_km:z.number().min(0).max(100000),min_fee:z.number().min(0).max(100000)}).strict(),req.body);
  const settings=[['delivery_base_fee',b.base_fee],['delivery_per_km',b.per_km],['delivery_min_fee',b.min_fee]];
  for(const [key,value] of settings) await q(`INSERT INTO app_settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`,[key,String(value),req.user.id]);
  res.json({base_fee:b.base_fee,per_km:b.per_km,min_fee:b.min_fee});
}));
app.patch('/admin/settings/commission', adminOnly, h(async(req,res)=>{
  const b=parse(z.object({commission_percent:z.number().min(0).max(50)}).strict(),req.body);
  await q(`INSERT INTO app_settings(key,value,updated_by) VALUES('vendor_commission_percent',$1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`,[String(b.commission_percent),req.user.id]);
  res.json({commission_percent:b.commission_percent,applies_to:'food_subtotal_only',existing_orders_unchanged:true});
}));

app.get('/admin/stores', adminOnly, h(async (_req, res) => {
  res.json((await q(
    `SELECT s.*, (SELECT count(*) FROM products p WHERE p.store_id = s.id)::int AS product_count
     FROM stores s ORDER BY s.name`)).rows);
}));

const storeFields = {
  name: z.string().min(1), category: CATEGORIES, emoji: z.string().max(8),
  eta_minutes: z.number().int().min(1).max(240), delivery_fee: z.number().min(0), is_open: z.boolean(),
  lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(),
};

app.post('/admin/stores', adminOnly, h(async (req, res) => {
  const b = parse(z.object({ ...storeFields, emoji: storeFields.emoji.default('🏪'),
    eta_minutes: storeFields.eta_minutes.default(30), delivery_fee: storeFields.delivery_fee.default(500),
    lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .omit({ is_open: true }), req.body);
  const { rows } = await q(
    `INSERT INTO stores (name, category, emoji, eta_minutes, delivery_fee, lat, lng) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.name, b.category, b.emoji, b.eta_minutes, b.delivery_fee, b.lat ?? null, b.lng ?? null]);
  res.status(201).json(rows[0]);
}));

app.patch('/admin/stores/:id', adminOnly, h(async (req, res) => {
  res.json(await patchRow('stores', req.params.id, parse(z.object(storeFields).partial().strict(), req.body)));
}));

app.get('/admin/stores/:id/products', adminOnly, h(async (req, res) => {
  res.json((await q('SELECT * FROM products WHERE store_id = $1 ORDER BY id', [req.params.id])).rows);
}));

app.post('/admin/stores/:id/products', adminOnly, h(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1), price: z.number().min(0) }), req.body);
  const { rows } = await q(
    'INSERT INTO products (store_id, name, price) VALUES ($1,$2,$3) RETURNING *', [req.params.id, b.name, b.price]);
  res.status(201).json(rows[0]);
}));

// Products are hidden (available = false) rather than deleted, so old orders keep their items.
app.patch('/admin/products/:id', adminOnly, h(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1), price: z.number().min(0), available: z.boolean() }).partial().strict(), req.body);
  res.json(await patchRow('products', req.params.id, b));
}));

app.get('/admin/documents', adminOnly, h(async(req,res)=>{
  const role=typeof req.query.role==='string'&&['vendor','courier'].includes(req.query.role)?req.query.role:null;
  res.json((await q(`SELECT d.id,d.user_id,d.document_type,d.filename,d.mime_type,d.review_status,d.review_notes,d.created_at,u.name AS owner_name,u.email AS owner_email,u.role AS owner_role FROM verification_documents d JOIN users u ON u.id=d.user_id WHERE ($1::text IS NULL OR u.role=$1) ORDER BY CASE d.review_status WHEN 'submitted' THEN 0 ELSE 1 END,d.created_at DESC LIMIT 300`,[role])).rows);
}));
app.get('/admin/documents/:id/file', adminOnly, h(async(req,res)=>{
  const row=(await q('SELECT filename,mime_type,encrypted_data,encryption_iv,encryption_tag FROM verification_documents WHERE id=$1',[req.params.id])).rows[0];
  if(!row)return res.status(404).json({error:'Document not found.'});
  let bytes; try{bytes=decryptDocument(row);}catch(e){console.error('Verification document decryption failed:',e.message);throw httpError(503,'Could not decrypt this document. Check the configured document encryption key.');}
  res.set('Content-Type',row.mime_type); res.set('Content-Disposition',`attachment; filename="${String(row.filename).replace(/[\"\r\n]/g,'_')}"`); res.set('Cache-Control','private, no-store'); res.send(bytes);
}));
app.patch('/admin/documents/:id', adminOnly, h(async(req,res)=>{
  const b=parse(z.object({review_status:z.enum(['approved','rejected']),review_notes:z.string().trim().max(2000).optional()}).strict(),req.body);
  // Keep the document decision and its onboarding status in one transaction. A database
  // error must not leave a document approved while the vendor/courier profile says otherwise.
  const doc = await tx(async client => {
    const {rows}=await client.query(`UPDATE verification_documents SET review_status=$2,review_notes=$3,reviewed_by=$4,updated_at=now() WHERE id=$1 RETURNING *`,[req.params.id,b.review_status,b.review_notes??null,req.user.id]);
    const row=rows[0];
    if(!row) return null;
    const status=b.review_status;
    if(row.document_type==='government_id') {
      await client.query(`UPDATE vendor_profiles SET government_id_status=$2,updated_at=now() WHERE user_id=$1`,[row.user_id,status]);
      await client.query(`UPDATE courier_profiles SET government_id_status=$2,updated_at=now() WHERE user_id=$1`,[row.user_id,status]);
    } else if(row.document_type==='food_safety') await client.query('UPDATE vendor_profiles SET food_safety_status=$2,updated_at=now() WHERE user_id=$1',[row.user_id,status]);
    else if(row.document_type==='driving_license') await client.query('UPDATE courier_profiles SET driving_license_status=$2,updated_at=now() WHERE user_id=$1',[row.user_id,status]);
    else if(row.document_type==='vehicle_registration') await client.query('UPDATE courier_profiles SET vehicle_registration_status=$2,updated_at=now() WHERE user_id=$1',[row.user_id,status]);
    return row;
  });
  if(!doc)return res.status(404).json({error:'Document not found.'});
  res.json({id:doc.id,review_status:doc.review_status,review_notes:doc.review_notes});
}));

app.get('/admin/couriers', adminOnly, h(async (_req, res) => {
  res.json((await q(
    `SELECT u.id, u.name, u.email, u.phone, u.courier_approved, l.updated_at AS last_seen,
            cp.vehicle_type,cp.government_id_status,cp.driving_license_status,cp.vehicle_registration_status,cp.orientation_completed,cp.review_notes,
            (SELECT count(*) FROM orders o WHERE o.courier_id = u.id
               AND o.status IN ('placed','preparing','ready','picked_up'))::int AS active_orders,
            (SELECT count(*) FROM orders o WHERE o.courier_id = u.id AND o.status = 'delivered')::int AS delivered
     FROM users u LEFT JOIN courier_locations l ON l.courier_id = u.id LEFT JOIN courier_profiles cp ON cp.user_id=u.id
     WHERE u.role = 'courier' ORDER BY u.name`)).rows);
}));

app.patch('/admin/couriers/:id/approval', adminOnly, h(async (req, res) => {
  const b = parse(z.object({ approved: z.boolean(), orientation_completed: z.boolean().optional(), orientation_notes: z.string().max(2000).optional(), review_notes: z.string().max(2000).optional() }).strict(), req.body);
  if(b.approved) {
    const profile=(await q('SELECT government_id_status,driving_license_status,vehicle_registration_status,vehicle_type,orientation_completed FROM courier_profiles WHERE user_id=$1',[req.params.id])).rows[0];
    const docs=(await q(`SELECT DISTINCT ON(document_type) document_type,review_status FROM verification_documents WHERE user_id=$1 AND document_type IN ('government_id','driving_license','vehicle_registration') ORDER BY document_type,created_at DESC,id DESC`,[req.params.id])).rows;
    const latest=Object.fromEntries(docs.map(d=>[d.document_type,d.review_status]));
    const orientation=b.orientation_completed ?? profile?.orientation_completed;
    const motorVehicle=['motorcycle','car'].includes(profile?.vehicle_type);
    if(!profile || profile.government_id_status!=='approved' || latest.government_id!=='approved' || (motorVehicle && (profile.driving_license_status!=='approved' || latest.driving_license!=='approved' || profile.vehicle_registration_status!=='approved' || latest.vehicle_registration!=='approved')) || !orientation) return res.status(409).json({error:'Courier approval requires a completed profile, approved government ID, approved driving licence and vehicle registration for motor vehicles, and completed orientation.'});
  }
  if(b.orientation_completed!==undefined || b.review_notes!==undefined || b.orientation_notes!==undefined) await q(`UPDATE courier_profiles SET orientation_completed=COALESCE($2,orientation_completed),orientation_completed_at=CASE WHEN $2 IS TRUE THEN now() WHEN $2 IS FALSE THEN NULL ELSE orientation_completed_at END,orientation_completed_by=CASE WHEN $2 IS TRUE THEN $4 WHEN $2 IS FALSE THEN NULL ELSE orientation_completed_by END,orientation_notes=COALESCE($5,orientation_notes),review_notes=COALESCE($3,review_notes),updated_at=now() WHERE user_id=$1`,[req.params.id,b.orientation_completed??null,b.review_notes??null,req.user.id,b.orientation_notes??null]);
  const { rows } = await q(
    `UPDATE users SET courier_approved = $2 WHERE id = $1 AND role = 'courier'
     RETURNING id, name, email, courier_approved`, [req.params.id, b.approved]);
  if (!rows[0]) return res.status(404).json({ error: 'Courier not found' });
  res.json(rows[0]);
}));

// ---------- Admin vendor review ----------
app.get('/admin/vendors', adminOnly, h(async (_req, res) => {
  res.json((await q(
    `SELECT u.id,u.name,u.email,u.phone,u.vendor_approved,v.business_name,v.business_type,v.address,
            v.registration_number,v.government_id_status,v.food_safety_status,v.orientation_completed,v.review_notes,
            s.id AS store_id,s.is_open
     FROM users u LEFT JOIN vendor_profiles v ON v.user_id=u.id LEFT JOIN stores s ON s.vendor_id=u.id
     WHERE u.role='vendor' ORDER BY u.created_at DESC`)).rows);
}));

app.patch('/admin/vendors/:id/approval', adminOnly, h(async (req, res) => {
  const b = parse(z.object({ approved: z.boolean(), review_notes: z.string().max(2000).optional(), orientation_completed: z.boolean().optional(), orientation_notes: z.string().max(2000).optional() }).strict(), req.body);
  const user = await tx(async client => {
    // Lock the vendor record so concurrent admin actions cannot approve based on stale review state.
    const existing=(await client.query("SELECT id FROM users WHERE id=$1 AND role='vendor' FOR UPDATE",[req.params.id])).rows[0];
    if(!existing) return {notFound:true};
    const check = (await client.query('SELECT v.business_name,v.business_type,v.business_types,v.government_id_status,v.food_safety_status,v.orientation_completed FROM vendor_profiles v WHERE v.user_id=$1',[req.params.id])).rows[0];
    const orientation = b.orientation_completed ?? check?.orientation_completed;
    if (b.approved) {
      const docs=(await client.query(`SELECT DISTINCT ON(document_type) document_type,review_status FROM verification_documents WHERE user_id=$1 AND document_type IN ('government_id','food_safety') ORDER BY document_type,created_at DESC,id DESC`,[req.params.id])).rows;
      const latest=Object.fromEntries(docs.map(d=>[d.document_type,d.review_status]));
      if (!check) throw httpError(409, 'Vendor must submit a business profile before approval.');
      if (!orientation || check.government_id_status !== 'approved' || latest.government_id !== 'approved' || ((check.business_types ?? [check.business_type]).includes('food') && (check.food_safety_status !== 'approved' || latest.food_safety !== 'approved')))
        throw httpError(409, 'Approval requires verified government ID, applicable food-safety approval, and completed orientation. Save those review results first.');
    }
    // Persist orientation/review notes before setting the privilege flag, in the same transaction.
    const updates = { review_notes:b.review_notes, orientation_completed:b.orientation_completed, orientation_notes:b.orientation_notes };
    if(b.orientation_completed===true) { updates.orientation_completed_at=new Date(); updates.orientation_completed_by=req.user.id; }
    if(b.orientation_completed===false) { updates.orientation_completed_at=null; updates.orientation_completed_by=null; }
    const keys = Object.keys(updates).filter(k => updates[k] !== undefined);
    if (keys.length && check) {
      const sets = keys.map((k,i)=>`${k}=$${i+2}`).join(', ');
      await client.query(`UPDATE vendor_profiles SET ${sets},updated_at=now() WHERE user_id=$1`,[req.params.id,...keys.map(k=>updates[k])]);
    }
    const result=(await client.query("UPDATE users SET vendor_approved=$2 WHERE id=$1 AND role='vendor' RETURNING id,name,email,vendor_approved",[req.params.id,b.approved])).rows[0];
    if(!b.approved) await client.query('UPDATE stores SET is_open=false WHERE vendor_id=$1',[req.params.id]);
    return result;
  });
  if(user?.notFound) return res.status(404).json({error:'Vendor not found.'});
  res.json(user);
}));

app.get('/admin/support/tickets', adminOnly, h(async (_req,res)=>{
  res.json((await q(`SELECT t.*,u.name AS customer_name,u.email AS customer_email FROM support_tickets t JOIN users u ON u.id=t.customer_id ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'escalated' THEN 1 ELSE 2 END,t.created_at DESC LIMIT 200`)).rows);
}));

app.post('/admin/support/tickets/:id/refund', adminOnly, h(async (req,res)=>{
  const ticket = (await q('SELECT id,order_id,customer_id FROM support_tickets WHERE id=$1', [req.params.id])).rows[0];
  if (!ticket) return res.status(404).json({error:'Support ticket not found.'});
  if (!ticket.order_id) return res.status(400).json({error:'This ticket is not linked to an order.'});
  const result = await requestOrderRefund(ticket.order_id, { ticketId: ticket.id });
  if (result.kind === 'not_found') return res.status(404).json({error:'Order not found.'});
  if (result.kind === 'not_paid') return res.status(409).json({error:'This order has no verified payment reference to refund.'});
  if (result.kind === 'ticket_mismatch') return res.status(409).json({error:'This support ticket is not linked to the selected customer order.'});
  if (result.kind === 'already_claimed') return res.status(409).json({error:`A refund is already ${result.status} for this order. Check Paystack before taking further action.`});
  const updatedTicket = (await q('SELECT * FROM support_tickets WHERE id=$1', [ticket.id])).rows[0];
  if (result.kind === 'uncertain') return res.status(502).json({error:'Paystack did not return a confirmed result. The refund remains processing to prevent a duplicate request. Check the Paystack dashboard before retrying.'});
  res.json({ ticket: updatedTicket, message: 'Refund request sent to Paystack. Confirm settlement in the Paystack dashboard before marking it completed.' });
}));

// ---------- Push notification tokens ----------
app.post('/devices', requireAuth(), h(async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(4096) }), req.body);
  // One device token belongs to one user: signing in on a shared phone moves it.
  await q(
    `INSERT INTO device_tokens (token, user_id) VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE SET user_id = $2, updated_at = now()`, [b.token, req.user.id]);
  res.status(204).end();
}));

app.post('/devices/remove', requireAuth(), h(async (req, res) => {
  const b = parse(z.object({ token: z.string() }), req.body);
  await q('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [b.token, req.user.id]);
  res.status(204).end();
}));

// ---------- Errors ----------
function isInsideDeliveryZone(lat, lng, zones) {
  return zones.some((zone) => haversineKm(Number(zone.center_lat), Number(zone.center_lng), Number(lat), Number(lng)) <= Number(zone.radius_km));
}

function assertAddressAllowedByZones(address, zones) {
  if (!zones.length) return;
  if (address.lat == null || address.lng == null) {
    throw httpError(400, 'Add your delivery address GPS location before checkout so we can confirm delivery coverage.');
  }
  if (!isInsideDeliveryZone(address.lat, address.lng, zones)) {
    throw httpError(400, 'Sorry, we do not deliver to this address yet. Please choose an address inside one of our delivery areas.');
  }
}


function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

app.get('/health', h(async (_req, res) => { await q('SELECT 1'); res.json({ ok: true }); }));

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

export { app };
export default app;

// Listen only when run directly; tests import the app without starting a server.
if (!process.env.VERCEL && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = app.listen(process.env.PORT || 3000, () => {
    console.log('Cönëct API running');
    startDispatch();
  });
  const stop = () => {
    server.close(async () => { await pool.end(); process.exit(0); }); // finish in-flight requests first
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
