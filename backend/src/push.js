import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { q } from './db.js';

// Push is optional: without FIREBASE_SERVICE_ACCOUNT the API runs normally and sends nothing.
let messaging = null;
const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT;
const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (keyJson || keyFile) {
  try {
    const serviceAccount = keyJson ? JSON.parse(keyJson) : JSON.parse(readFileSync(keyFile, 'utf8'));
    initializeApp({ credential: cert(serviceAccount) });
    messaging = getMessaging();
  } catch (e) {
    console.error('Push disabled:', e.message);
  }
} else {
  console.log('Push disabled: set FIREBASE_SERVICE_ACCOUNT to enable notifications');
}

const DEAD = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

async function send(tokens, title, body, data = {}) {
  if (!messaging || !tokens.length) return;
  const res = await messaging.sendEachForMulticast({ tokens, notification: { title, body }, data });
  const dead = tokens.filter((_, i) => !res.responses[i].success && DEAD.includes(res.responses[i].error?.code));
  if (dead.length) await q('DELETE FROM device_tokens WHERE token = ANY($1)', [dead]);
}

// Notifications are best effort: a failure here must never break an order.
export async function notifyUser(userId, title, body, data) {
  try {
    const { rows } = await q('SELECT token FROM device_tokens WHERE user_id = $1', [userId]);
    await send(rows.map((r) => r.token), title, body, data);
  } catch (e) { console.error('Push failed:', e.message); }
}

export async function notifyCouriers(title, body, data) {
  try {
    const { rows } = await q(
      `SELECT t.token FROM device_tokens t JOIN users u ON u.id = t.user_id WHERE u.role = 'courier' AND u.courier_approved = true`);
    await send(rows.map((r) => r.token), title, body, data);
  } catch (e) { console.error('Push failed:', e.message); }
}
