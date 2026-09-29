import type { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import dns from 'node:dns';

// Railway (and most container hosts) have a broken outbound IPv6 route, which makes any
// external connection — SMTP, or fetch() calls like Termii/Paystack/Nominatim — hang until it
// times out instead of failing fast, because Node tries IPv6 first by default. This applies to
// the whole process, so it's not dependent on remembering a NODE_OPTIONS env var per-host.
dns.setDefaultResultOrder('ipv4first');

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: isLocalDb ? false : { rejectUnauthorized: false } });
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set. Refusing to start with an insecure default — set JWT_SECRET on the backend service before deploying.');
}
const uploadRoot = path.resolve(process.env.STORAGE_DIR || './storage');

export type User = { userId: string; email?: string; name?: string };

async function ensureDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_records (id text PRIMARY KEY, collection text NOT NULL, record jsonb NOT NULL, created_at bigint NOT NULL DEFAULT 0);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS app_records_collection_idx ON app_records(collection);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_users (id text PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL, name text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', email_verified boolean NOT NULL DEFAULT false, created_at bigint NOT NULL);`);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;`);
  await pool.query(`CREATE TABLE IF NOT EXISTS email_verifications (id text PRIMARY KEY, user_id text NOT NULL, token text UNIQUE NOT NULL, expires_at bigint NOT NULL, created_at bigint NOT NULL);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS phone_otps (id text PRIMARY KEY, user_id text NOT NULL, phone text NOT NULL, code text NOT NULL, attempts int NOT NULL DEFAULT 0, expires_at bigint NOT NULL, created_at bigint NOT NULL);`);
}
const ready = ensureDb();
const rid = () => crypto.randomUUID();

function unwrap(r:any) { return r?.record ?? r; }

export const db = {
  async add<T=any>(collection:string, records:T[]) { await ready; const ids:string[]=[]; for (const record of records) { const id=rid(); await pool.query('INSERT INTO app_records(id,collection,record,created_at) VALUES($1,$2,$3,$4)',[id,collection,record,Date.now()]); ids.push(id); } return ids; },
  async list<T=any>(collection:string, opts:any={}) { await ready; const limit=Math.min(Number(opts.limit||100),1000); const r=await pool.query('SELECT id,record FROM app_records WHERE collection=$1 ORDER BY created_at DESC LIMIT $2',[collection,limit]); return {items:r.rows.map(x=>({id:x.id,...unwrap(x)})) as T[]}; },
  async get<T=any>(collection:string, ids:string[]) { await ready; if(!ids.length)return []; const r=await pool.query('SELECT id,record FROM app_records WHERE collection=$1 AND id=ANY($2::text[])',[collection,ids]); return r.rows.map(x=>({id:x.id,...unwrap(x)})) as T[]; },
  async update(collection:string, updates:any[]) { await ready; let ok=true; for(const u of updates){ const r=await pool.query('UPDATE app_records SET record=$1 WHERE collection=$2 AND id=$3',[u.record,collection,u.id]); if(!r.rowCount)ok=false; } return [ok]; },
  async delete(collection:string, ids:string[]) { await ready; if(!ids.length)return; await pool.query('DELETE FROM app_records WHERE collection=$1 AND id=ANY($2::text[])',[collection,ids]); }
};

export const storage = {
  async write(items:any[]) { await fs.mkdir(uploadRoot,{recursive:true}); const results:boolean[]=[]; for(const item of items){ const target=path.resolve(uploadRoot,item.path); if(!target.startsWith(uploadRoot)) { results.push(false); continue; } await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,Buffer.from(String(item.content),'base64')); results.push(true); } return results; },
  async url(paths:string[]) { const base=(process.env.PUBLIC_API_URL||'').replace(/\/$/,''); return paths.map(p=>({url:`${base}/storage/${p}`})); }
};

export const secrets = { async readSecret(name:string) { const v=process.env[name]; if(!v) throw new Error(`Missing secret ${name}`); return v; } };

// --- Email (direct SMTP, no third-party email API) ---
let mailTransporter: any = null;
function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass) throw new Error('Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS.');
  const smtpOptions: any = {
    host, port, secure: port === 465, auth: { user, pass },
    family: 4,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
  };
  mailTransporter = nodemailer.createTransport(smtpOptions);

  return mailTransporter;
}
export async function sendMail(to: string, subject: string, html: string) {
  const transporter = getMailTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transporter.sendMail({ from, to, subject, html });
}

// --- SMS (Termii - free-tier SMS gateway; real SMS delivery always needs a carrier/aggregator) ---
// Termii requires international format with no '+' (e.g. 2347012345678). Users type all
// kinds of formats, so normalize; a local Nigerian number starting with 0 is treated as +234.
export function normalizePhoneForSms(raw: string) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1);
  return d;
}
export async function sendSMS(to: string, message: string) {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) throw new Error('SMS is not configured. Set TERMII_API_KEY.');
  const resp = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: normalizePhoneForSms(to), from: process.env.TERMII_SENDER_ID || 'N-Alert', sms: message, type: 'plain', channel: 'generic', api_key: apiKey }),
    signal: AbortSignal.timeout(15000),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.message || 'SMS could not be sent.');
  return data;
}

// --- Email verification ---
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export async function getAppUserById(userId: string) {
  await ready;
  const r = await pool.query('SELECT id,email,name,phone,email_verified,phone_verified FROM app_users WHERE id=$1', [userId]);
  return r.rows[0] || null;
}
export async function createAndSendEmailVerification(userId: string, email: string, name: string) {
  await ready;
  await pool.query('DELETE FROM email_verifications WHERE user_id=$1', [userId]);
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO email_verifications(id,user_id,token,expires_at,created_at) VALUES($1,$2,$3,$4,$5)', [rid(), userId, token, Date.now() + EMAIL_TOKEN_TTL_MS, Date.now()]);
  const link = `${(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')}/?verifyEmail=${token}`;
  await sendMail(email, 'Verify your cönëct email address', `<p>Hi ${name || ''},</p><p>Confirm your email address for cönëct:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours. If you didn't create this account, ignore this email.</p>`);
}
export async function resendEmailVerificationByEmail(email: string) {
  await ready;
  const r = await pool.query('SELECT id,email,name,email_verified FROM app_users WHERE email=$1', [email.trim().toLowerCase()]);
  const u = r.rows[0];
  if (!u || u.email_verified) return; // stay silent either way to avoid leaking which emails exist
  await createAndSendEmailVerification(u.id, u.email, u.name);
}
export async function verifyEmailToken(token: string) {
  await ready;
  const r = await pool.query('SELECT * FROM email_verifications WHERE token=$1', [token]);
  const row = r.rows[0];
  if (!row) throw new Error('This verification link is invalid or has already been used.');
  if (Date.now() > Number(row.expires_at)) { await pool.query('DELETE FROM email_verifications WHERE id=$1', [row.id]); throw new Error('This verification link has expired. Request a new one.'); }
  await pool.query('UPDATE app_users SET email_verified=true WHERE id=$1', [row.user_id]);
  await pool.query('DELETE FROM email_verifications WHERE user_id=$1', [row.user_id]);
  return { userId: row.user_id };
}

// --- Phone (OTP) verification ---
const PHONE_OTP_TTL_MS = 10 * 60 * 1000;
export async function createAndSendPhoneOtp(userId: string, phone: string) {
  await ready;
  phone = phone.trim();
  if (phone.length < 7) throw new Error('Enter a valid phone number.');
  await pool.query('UPDATE app_users SET phone=$1 WHERE id=$2', [phone, userId]);
  await pool.query('DELETE FROM phone_otps WHERE user_id=$1', [userId]);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await pool.query('INSERT INTO phone_otps(id,user_id,phone,code,attempts,expires_at,created_at) VALUES($1,$2,$3,$4,0,$5,$6)', [rid(), userId, phone, code, Date.now() + PHONE_OTP_TTL_MS, Date.now()]);
  await sendSMS(phone, `Your cönëct verification code is ${code}. It expires in 10 minutes.`);
}
export async function verifyPhoneOtp(userId: string, code: string) {
  await ready;
  const r = await pool.query('SELECT * FROM phone_otps WHERE user_id=$1', [userId]);
  const row = r.rows[0];
  if (!row) throw new Error('Request a code first.');
  if (Date.now() > Number(row.expires_at)) { await pool.query('DELETE FROM phone_otps WHERE id=$1', [row.id]); throw new Error('This code has expired. Request a new one.'); }
  if (Number(row.attempts) >= 5) { await pool.query('DELETE FROM phone_otps WHERE id=$1', [row.id]); throw new Error('Too many incorrect attempts. Request a new code.'); }
  if (String(code).trim() !== row.code) { await pool.query('UPDATE phone_otps SET attempts=attempts+1 WHERE id=$1', [row.id]); throw new Error('Incorrect code.'); }
  await pool.query('UPDATE app_users SET phone_verified=true WHERE id=$1', [userId]);
  await pool.query('DELETE FROM phone_otps WHERE id=$1', [row.id]);
}
const VAPID_PUBLIC=process.env.VAPID_PUBLIC_KEY||'';
const VAPID_PRIVATE=process.env.VAPID_PRIVATE_KEY||'';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:support@conect.app', VAPID_PUBLIC, VAPID_PRIVATE);
}
export const notifications = {
  async send({ userIds, notification }: { userIds: string[]; notification: { title: string; body: string } }) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return { ok: true, skipped: 'not_configured' };
    try {
      const r = await db.list<any>('push_subscriptions', { limit: 500 });
      const targets = r.items.filter((s: any) => userIds.includes(s.userId));
      await Promise.all(targets.map(async (s: any) => {
        try {
          await webpush.sendNotification(s.subscription, JSON.stringify(notification));
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await db.delete('push_subscriptions', [s.id]).catch(() => {});
          }
        }
      }));
      return { ok: true, sent: targets.length };
    } catch {
      return { ok: false };
    }
  }
};

export function signToken(user:User) { return jwt.sign(user,JWT_SECRET,{expiresIn:'30d'}); }
export function verifyToken(token:string) { return jwt.verify(token,JWT_SECRET) as User; }

export function json(data:any,status=200){ return {status,data}; }
export function error(message:string,status=400){ return {status,data:{message}}; }
export function requireAuth(){ return {__requireAuth:true}; }

function routeToRegex(pattern:string){ const keys:string[]=[]; const rx=pattern.split('/').map(part=>{ if(part.startsWith(':')){keys.push(part.slice(1));return '([^/]+)';} return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }).join('/'); return {regex:new RegExp(`^${rx}/?$`),keys}; }

export function router(routes:Record<string,any>){
  const compiled=Object.entries(routes).map(([key,chain])=>{const [method,...parts]=key.split(' '); const {regex,keys}=routeToRegex(parts.join(' ')); return {method,path:parts.join(' '),regex,keys,handlers:Array.isArray(chain)?chain:[chain]};});
  return async (req:Request,res:Response,next:NextFunction)=>{
    const match=compiled.find(r=>r.method===req.method&&r.regex.test(req.path));
    if(!match)return next();
    const m=match.regex.exec(req.path)!; const params:any={}; match.keys.forEach((k,i)=>params[k]=decodeURIComponent(m[i+1]));
    let user:User|undefined;
    for(const h of match.handlers){
      if(h?.__requireAuth){ const auth=String(req.headers.authorization||''); if(!auth.startsWith('Bearer ')){res.status(401).json({message:'Authentication required'});return;} try{user=verifyToken(auth.slice(7));}catch{res.status(401).json({message:'Invalid or expired session'});return;} continue; }
      try{ const out=await h({user,body:req.body,query:req.query,params,request:req}); if(out){res.status(out.status||200).json(out.data);return;} }catch(e:any){console.error(e);res.status(500).json({message:e?.message||'Server error'});return; }
    }
  };
}

export async function authSignup(email:string,password:string,name:string,phone=''){
  await ready; email=email.trim().toLowerCase(); const exists=await pool.query('SELECT id FROM app_users WHERE email=$1',[email]); if(exists.rowCount) throw new Error('An account with this email already exists.'); const id=rid(); const hash=await bcrypt.hash(password,12); await pool.query('INSERT INTO app_users(id,email,password_hash,name,phone,email_verified,created_at) VALUES($1,$2,$3,$4,$5,false,$6)',[id,email,hash,name,phone,Date.now()]); return {id,email,name,phone};
}
export async function authSignin(email:string,password:string){ await ready; const r=await pool.query('SELECT * FROM app_users WHERE email=$1',[email.trim().toLowerCase()]); if(!r.rowCount) throw new Error('Invalid email or password.'); const u=r.rows[0]; if(!(await bcrypt.compare(password,u.password_hash))) throw new Error('Invalid email or password.'); return {user:{userId:u.id,email:u.email,name:u.name,phone:u.phone,emailVerified:u.email_verified,phoneVerified:u.phone_verified},token:signToken({userId:u.id,email:u.email,name:u.name})}; }
export async function changePassword(userId:string,oldPassword:string,newPassword:string){ await ready; if(!newPassword||newPassword.length<8) throw new Error('New password must be at least 8 characters.'); const r=await pool.query('SELECT * FROM app_users WHERE id=$1',[userId]); if(!r.rowCount) throw new Error('Account not found.'); const u=r.rows[0]; if(!(await bcrypt.compare(oldPassword,u.password_hash))) throw new Error('Current password is incorrect.'); const hash=await bcrypt.hash(newPassword,12); await pool.query('UPDATE app_users SET password_hash=$1 WHERE id=$2',[hash,userId]); return {ok:true}; }
