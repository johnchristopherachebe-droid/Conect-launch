import { q, tx } from './db.js';
import { requireAuth } from './auth.js';
import { notifyUser } from './push.js';
import { z } from 'zod';
import { isConfigured, payderPayouts } from './gateways.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const httpError = (status, message) => Object.assign(new Error(message), { status });
const parse = (schema, body) => schema.parse(body);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
// Money from clients: positive, at most 2 decimals.
const money = z.number().positive().max(100_000_000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use at most 2 decimal places');

// ---------- Ledger helpers (all take a transaction client) ----------

// Pays the vendor (food subtotal minus commission) and the courier (their share of the delivery fee)
// when an order is delivered. Safe to call twice: unique indexes make the second call a no-op.
export async function creditOrderEarnings(client, orderId) {
  const o = (await client.query(
    `SELECT o.id,o.status,o.paid,o.courier_id,o.vendor_net_amount,o.delivery_fee,o.courier_share_percent,s.vendor_id
     FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=$1`, [orderId])).rows[0];
  if (!o || !o.paid || !['picked_up', 'delivered'].includes(o.status)) return { credited: false };
  const vendorAmount = round2(o.vendor_net_amount);
  const courierAmount = round2(Number(o.delivery_fee) * Number(o.courier_share_percent) / 100);
  if (o.vendor_id && vendorAmount > 0) {
    await client.query(
      `INSERT INTO wallet_entries(user_id,order_id,kind,amount,note) VALUES($1,$2,'order_earning',$3,'Order earnings (after commission)')
       ON CONFLICT DO NOTHING`, [o.vendor_id, o.id, vendorAmount]);
  }
  if (o.status === 'delivered' && o.courier_id && courierAmount > 0) {
    await client.query(
      `INSERT INTO wallet_entries(user_id,order_id,kind,amount,note) VALUES($1,$2,'delivery_earning',$3,'Delivery earnings')
       ON CONFLICT DO NOTHING`, [o.courier_id, o.id, courierAmount]);
  }
  return { credited: true, vendorId: o.vendor_id, courierId: o.courier_id, vendorAmount, courierAmount };
}

// Takes an order's earnings back out of the wallets when a refund is under way.
// Callers hold the order row lock, so the "net is zero" check cannot race.
export async function reverseOrderEarnings(client, orderId) {
  const earned = (await client.query(
    `SELECT user_id, amount FROM wallet_entries WHERE order_id=$1 AND kind IN ('order_earning','delivery_earning')`, [orderId])).rows;
  for (const e of earned) {
    const net = Number((await client.query(
      `SELECT COALESCE(SUM(amount),0) AS n FROM wallet_entries WHERE order_id=$1 AND user_id=$2 AND kind IN ('refund_reversal','refund_reversal_undo')`,
      [orderId, e.user_id])).rows[0].n);
    if (net === 0) {
      await client.query(
        `INSERT INTO wallet_entries(user_id,order_id,kind,amount,note) VALUES($1,$2,'refund_reversal',$3,'Order refunded to customer')`,
        [e.user_id, orderId, -Number(e.amount)]);
    }
  }
}

// Puts the money back if the refund failed or was rejected.
export async function restoreOrderEarnings(client, orderId) {
  const earned = (await client.query(
    `SELECT user_id, amount FROM wallet_entries WHERE order_id=$1 AND kind IN ('order_earning','delivery_earning')`, [orderId])).rows;
  for (const e of earned) {
    const net = Number((await client.query(
      `SELECT COALESCE(SUM(amount),0) AS n FROM wallet_entries WHERE order_id=$1 AND user_id=$2 AND kind IN ('refund_reversal','refund_reversal_undo')`,
      [orderId, e.user_id])).rows[0].n);
    if (net < 0) {
      await client.query(
        `INSERT INTO wallet_entries(user_id,order_id,kind,amount,note) VALUES($1,$2,'refund_reversal_undo',$3,'Refund did not go through; earnings restored')`,
        [e.user_id, orderId, -net]);
    }
  }
}

const balanceOf = async (client, userId) =>
  Number((await client.query('SELECT COALESCE(SUM(amount),0) AS b FROM wallet_entries WHERE user_id=$1', [userId])).rows[0].b);

async function setting(key, fallback) {
  const r = (await q('SELECT value FROM app_settings WHERE key=$1', [key])).rows[0];
  const v = Number(r?.value);
  return Number.isFinite(v) ? v : fallback;
}

export function registerWallet(app, { adminOnly }) {
  const earner = requireAuth('vendor', 'courier');

  // ---- Vendor / courier ----------------------------------------------------
  app.get('/wallet', earner, h(async (req, res) => {
    const uid = req.user.id;
    const [balance, held, account, minWithdrawal, entries, open] = await Promise.all([
      balanceOf({ query: q }, uid),
      q(`SELECT COALESCE(SUM(amount),0) AS n FROM withdrawal_requests WHERE user_id=$1 AND status='requested'`, [uid]),
      q('SELECT bank_name,account_number,account_name FROM payout_accounts WHERE user_id=$1', [uid]),
      setting('min_withdrawal', 1000),
      q(`SELECT id,kind,amount,note,order_id,created_at FROM wallet_entries WHERE user_id=$1 ORDER BY id DESC LIMIT 50`, [uid]),
      q(`SELECT id,amount,status,created_at FROM withdrawal_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [uid]),
    ]);
    const lifetime = Number((await q(`SELECT COALESCE(SUM(amount),0) AS n FROM wallet_entries WHERE user_id=$1 AND kind IN ('order_earning','delivery_earning')`, [uid])).rows[0].n);
    res.json({
      balance: round2(balance),                 // available to withdraw (money already held for a pending withdrawal is NOT included)
      pending_withdrawal: round2(held.rows[0].n),
      lifetime_earnings: round2(lifetime),
      min_withdrawal: minWithdrawal,
      payout_account: account.rows[0] ?? null,
      entries: entries.rows,
      withdrawals: open.rows,
    });
  }));

  app.put('/wallet/payout-account', earner, h(async (req, res) => {
    const b = parse(z.object({
      bank_name: z.string().trim().min(2).max(80),
      account_number: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
      account_name: z.string().trim().min(2).max(120),
    }).strict(), req.body);
    const r = await q(
      `INSERT INTO payout_accounts(user_id,bank_name,account_number,account_name) VALUES($1,$2,$3,$4)
       ON CONFLICT(user_id) DO UPDATE SET bank_name=EXCLUDED.bank_name,account_number=EXCLUDED.account_number,account_name=EXCLUDED.account_name,updated_at=now()
       RETURNING bank_name,account_number,account_name`, [req.user.id, b.bank_name, b.account_number, b.account_name]);
    res.json(r.rows[0]);
  }));

  app.post('/wallet/withdrawals', earner, h(async (req, res) => {
    const b = parse(z.object({ amount: money }).strict(), req.body);
    const minWithdrawal = await setting('min_withdrawal', 1000);
    const w = await tx(async (c) => {
      // Lock the user row so two simultaneous requests cannot both spend the same balance.
      const u = (await c.query('SELECT id,role,vendor_approved,courier_approved,is_active FROM users WHERE id=$1 FOR UPDATE', [req.user.id])).rows[0];
      if (!u || !u.is_active) throw httpError(403, 'Account is not active.');
      if ((u.role === 'vendor' && !u.vendor_approved) || (u.role === 'courier' && !u.courier_approved))
        throw httpError(403, 'Your account must be approved before you can withdraw.');
      const acct = (await c.query('SELECT bank_name,account_number,account_name FROM payout_accounts WHERE user_id=$1', [u.id])).rows[0];
      if (!acct) throw httpError(409, 'Add your bank account before requesting a withdrawal.');
      if (b.amount < minWithdrawal) throw httpError(400, `The minimum withdrawal is ₦${minWithdrawal}.`);
      if (b.amount > round2(await balanceOf(c, u.id))) throw httpError(409, 'That is more than your available balance.');
      const open = (await c.query(`SELECT 1 FROM withdrawal_requests WHERE user_id=$1 AND status='requested'`, [u.id])).rows[0];
      if (open) throw httpError(409, 'You already have a withdrawal waiting to be paid.');
      const wr = (await c.query(
        `INSERT INTO withdrawal_requests(user_id,amount,bank_name,account_number,account_name) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [u.id, b.amount, acct.bank_name, acct.account_number, acct.account_name])).rows[0];
      // Hold the money straight away so it cannot be withdrawn twice or spent elsewhere.
      await c.query(`INSERT INTO wallet_entries(user_id,withdrawal_id,kind,amount,note) VALUES($1,$2,'withdrawal',$3,'Withdrawal requested')`, [u.id, wr.id, -b.amount]);
      return wr;
    });
    res.status(201).json(w);
  }));

  // ---- Admin -----------------------------------------------------------------
  app.get('/admin/withdrawals', adminOnly, h(async (req, res) => {
    const status = ['requested', 'paid', 'rejected'].includes(req.query.status) ? req.query.status : null;
    res.json((await q(
      `SELECT w.*, u.name, u.email, u.role FROM withdrawal_requests w JOIN users u ON u.id=w.user_id
       WHERE ($1::text IS NULL OR w.status=$1) ORDER BY (w.status='requested') DESC, w.created_at DESC LIMIT 200`, [status])).rows);
  }));

  app.patch('/admin/withdrawals/:id', adminOnly, h(async (req, res) => {
    const b = parse(z.object({
      status: z.enum(['paid', 'rejected']),
      payout_reference: z.string().trim().min(1).max(200).optional(),
      note: z.string().trim().max(2000).optional(),
    }).strict(), req.body);
    if (b.status === 'paid' && !b.payout_reference) return res.status(400).json({ error: 'Enter the bank transfer reference before marking a withdrawal paid.' });
    if (b.status === 'rejected' && !b.note) return res.status(400).json({ error: 'Give a reason so the person knows why it was rejected.' });
    const out = await tx(async (c) => {
      const w = (await c.query('SELECT * FROM withdrawal_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!w) return { kind: 'not_found' };
      if (w.status !== 'requested') return { kind: 'done', status: w.status };
      const upd = (await c.query(
        `UPDATE withdrawal_requests SET status=$2,payout_reference=$3,admin_note=$4,processed_by=$5,processed_at=now() WHERE id=$1 RETURNING *`,
        [w.id, b.status, b.payout_reference ?? null, b.note ?? null, req.user.id])).rows[0];
      if (b.status === 'rejected')
        await c.query(`INSERT INTO wallet_entries(user_id,withdrawal_id,kind,amount,note,created_by) VALUES($1,$2,'withdrawal_reversal',$3,$4,$5)`,
          [w.user_id, w.id, Number(w.amount), `Withdrawal rejected: ${b.note}`, req.user.id]);
      return { kind: 'ok', withdrawal: upd };
    });
    if (out.kind === 'not_found') return res.status(404).json({ error: 'Withdrawal not found.' });
    if (out.kind === 'done') return res.status(409).json({ error: `This withdrawal is already ${out.status}.` });
    notifyUser(out.withdrawal.user_id, b.status === 'paid' ? 'Withdrawal paid' : 'Withdrawal rejected',
      b.status === 'paid' ? `₦${out.withdrawal.amount} has been sent to your bank account.` : `Your withdrawal was rejected: ${b.note}`, {});
    res.json(out.withdrawal);
  }));

  app.get('/admin/wallets', adminOnly, h(async (_req, res) => {
    res.json((await q(
      `SELECT u.id,u.name,u.email,u.role,
              COALESCE(SUM(e.amount),0) AS balance,
              COALESCE(SUM(e.amount) FILTER (WHERE e.kind IN ('order_earning','delivery_earning')),0) AS lifetime_earnings
       FROM users u LEFT JOIN wallet_entries e ON e.user_id=u.id
       WHERE u.role IN ('vendor','courier') GROUP BY u.id ORDER BY balance DESC LIMIT 500`)).rows);
  }));

  app.post('/admin/wallets/:userId/adjust', adminOnly, h(async (req, res) => {
    const b = parse(z.object({
      amount: z.number().refine((v) => v !== 0 && Math.abs(v) <= 100_000_000 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Enter a non-zero amount with at most 2 decimals'),
      note: z.string().trim().min(3).max(500),
    }).strict(), req.body);
    const entry = await tx(async (c) => {
      const u = (await c.query(`SELECT id FROM users WHERE id=$1 AND role IN ('vendor','courier') FOR UPDATE`, [req.params.userId])).rows[0];
      if (!u) throw httpError(404, 'Vendor or courier not found.');
      return (await c.query(`INSERT INTO wallet_entries(user_id,kind,amount,note,created_by) VALUES($1,'adjustment',$2,$3,$4) RETURNING *`,
        [u.id, b.amount, b.note, req.user.id])).rows[0];
    });
    res.status(201).json(entry);
  }));

  app.patch('/admin/settings/wallet', adminOnly, h(async (req, res) => {
    const b = parse(z.object({ courier_share_percent: z.number().min(0).max(100), min_withdrawal: z.number().min(0).max(10_000_000) }).strict(), req.body);
    for (const [k, v] of [['courier_share_percent', b.courier_share_percent], ['min_withdrawal', b.min_withdrawal]])
      await q(`INSERT INTO app_settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`, [k, String(v), req.user.id]);
    res.json(b);
  }));

  // ---- Admin: full transaction history ----------------------------------------
  // One chronological feed of every money movement: customer payments, refunds, vendor/courier
  // earnings, withdrawals, bank payouts and manual adjustments. Read-only.
  const KIND_LABEL = `CASE e.kind
      WHEN 'order_earning' THEN 'Vendor earnings' WHEN 'delivery_earning' THEN 'Courier earnings'
      WHEN 'refund_reversal' THEN 'Earnings taken back (refund)' WHEN 'refund_reversal_undo' THEN 'Earnings restored (refund failed)'
      WHEN 'withdrawal' THEN 'Withdrawal requested' WHEN 'withdrawal_reversal' THEN 'Withdrawal rejected, money returned'
      ELSE 'Manual adjustment' END`;
  const KIND_TYPE = `CASE WHEN e.kind IN ('order_earning','delivery_earning') THEN 'earning'
      WHEN e.kind IN ('refund_reversal','refund_reversal_undo') THEN 'reversal'
      WHEN e.kind IN ('withdrawal','withdrawal_reversal') THEN 'withdrawal' ELSE 'adjustment' END`;
  const FEED = `
    SELECT pa.updated_at AS occurred_at, 'payment'::text AS type, 'Customer payment'::text AS label, (pa.amount_kobo / 100.0)::numeric(14,2) AS amount,
           c.name AS party, c.email AS email, pa.order_id AS order_id, pa.reference AS reference, pa.status::text AS status
      FROM payment_attempts pa JOIN orders o ON o.id=pa.order_id JOIN users c ON c.id=o.customer_id WHERE pa.status='paid'
    UNION ALL
    SELECT pa.updated_at, 'refund', 'Refund of a late payment', -(pa.amount_kobo / 100.0)::numeric(14,2),
           c.name, c.email, pa.order_id, pa.reference, pa.status::text
      FROM payment_attempts pa JOIN orders o ON o.id=pa.order_id JOIN users c ON c.id=o.customer_id WHERE pa.status IN ('refund_requested','refund_failed')
    UNION ALL
    SELECT COALESCE(o.refund_updated_at, o.updated_at), 'refund', 'Refund to customer', -o.total,
           c.name, c.email, o.id, o.refund_provider_reference, o.refund_status::text
      FROM orders o JOIN users c ON c.id=o.customer_id WHERE o.refund_status <> 'none'
    UNION ALL
    SELECT e.created_at, ${KIND_TYPE}, ${KIND_LABEL}, e.amount,
           u.name, u.email, e.order_id, e.note, u.role::text
      FROM wallet_entries e JOIN users u ON u.id=e.user_id
    UNION ALL
    SELECT w.processed_at, 'payout', 'Bank payout to ' || u.role, -w.amount,
           u.name, u.email, NULL::uuid, w.payout_reference, 'paid'
      FROM withdrawal_requests w JOIN users u ON u.id=w.user_id WHERE w.status='paid' AND w.processed_at IS NOT NULL`;
  const TX_TYPES = ['payment', 'refund', 'earning', 'reversal', 'withdrawal', 'payout', 'adjustment'];
  const csvCell = (v) => {
    let t = v instanceof Date ? v.toISOString() : String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // stop spreadsheet apps from running a cell as a formula
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };

  app.get('/admin/transactions', adminOnly, h(async (req, res) => {
    const type = TX_TYPES.includes(req.query.type) ? req.query.type : null;
    const search = String(req.query.q ?? '').trim().slice(0, 100);
    const like = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null;
    const beforeRaw = req.query.before ? new Date(String(req.query.before)) : null;
    if (beforeRaw && Number.isNaN(beforeRaw.getTime())) return res.status(400).json({ error: 'Invalid "before" date.' });
    const csv = req.query.format === 'csv';
    const limit = csv ? 5000 : Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const rows = (await q(
      `SELECT * FROM (${FEED}) feed
       WHERE ($1::text IS NULL OR type=$1)
         AND ($2::text IS NULL OR party ILIKE $2 OR email ILIKE $2 OR order_id::text ILIKE $2 OR reference ILIKE $2)
         AND ($3::timestamptz IS NULL OR occurred_at < $3)
       ORDER BY occurred_at DESC LIMIT $4`, [type, like, beforeRaw, limit])).rows;
    if (csv) {
      const head = ['Time', 'Type', 'Description', 'Amount (NGN)', 'Person', 'Email', 'Order', 'Reference / note', 'Status'];
      const lines = [head.join(',')].concat(rows.map((r) => [r.occurred_at, r.type, r.label, r.amount, r.party, r.email, r.order_id, r.reference, r.status].map(csvCell).join(',')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="conect-transactions.csv"');
      return res.send('\ufeff' + lines.join('\r\n'));
    }
    let summary = null;
    if (!beforeRaw) {
      const s = (await q(`SELECT
        (SELECT COALESCE(SUM(total),0) FROM orders WHERE paid) AS collected,
        (SELECT COALESCE(SUM(total),0) FROM orders WHERE refund_status='completed') AS refunded,
        (SELECT COALESCE(SUM(commission_amount),0) FROM orders WHERE paid AND status='delivered' AND refund_status NOT IN ('requested','processing','completed')) AS commission,
        (SELECT COALESCE(SUM(amount),0) FROM wallet_entries) AS in_wallets,
        (SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='requested') AS awaiting_payout,
        (SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE status='paid') AS paid_out`)).rows[0];
      summary = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, round2(v)]));
    }
    res.json({ summary, rows, next_before: rows.length === limit ? rows[rows.length - 1].occurred_at : null });
  }));
}
