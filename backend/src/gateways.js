import crypto from 'node:crypto';

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------------- Paystack
const PAYSTACK = 'https://api.paystack.co';

async function paystackCall(method, path, body) {
  const r = await fetch(PAYSTACK + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) throw httpError(502, j.message || 'The payment provider returned an error');
  return j.data;
}

const paystack = {
  code: 'paystack',
  name: 'Paystack',
  description: 'Card, bank transfer or USSD',
  matchesOrderId: true,
  configured: () => Boolean(process.env.PAYSTACK_SECRET_KEY),

  async initialize({ order, reference, amountKobo, email, publicUrl }) {
    const d = await paystackCall('POST', '/transaction/initialize', {
      email,
      amount: amountKobo,
      currency: 'NGN',
      reference,
      callback_url: `${publicUrl}/payment/done`,
      metadata: { order_id: order.id },
    });
    if (d.reference !== reference || !d.authorization_url) throw httpError(502, 'The payment provider returned an invalid checkout response. Please try again.');
    return { url: d.authorization_url, reference: d.reference };
  },

  async verify(reference) {
    const d = await paystackCall('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    const state = d.status === 'success' ? 'paid' : ['failed', 'abandoned', 'reversed'].includes(d.status) ? 'failed' : 'pending';
    return { state, reference: d.reference, currency: d.currency, amountKobo: Number(d.amount), orderId: d.metadata && d.metadata.order_id };
  },

  async refund(paymentRef) {
    return paystackCall('POST', '/refund', { transaction: paymentRef });
  },
};

// ---------------- OPay
const opayBase = () => process.env.OPAY_BASE_URL
  || (process.env.OPAY_ENV === 'live' ? 'https://liveapi.opaycheckout.com' : 'https://testapi.opaycheckout.com');

const hmacSha512 = (text, key) => crypto.createHmac('sha512', key).update(text).digest('hex');

async function opayCall(path, body, { signed }) {
  const raw = JSON.stringify(body);
  const token = signed ? hmacSha512(raw, process.env.OPAY_PRIVATE_KEY) : process.env.OPAY_PUBLIC_KEY;
  const r = await fetch(opayBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, MerchantId: process.env.OPAY_MERCHANT_ID },
    body: raw,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== '00000') throw httpError(502, j.message || 'The payment provider returned an error');
  return j.data;
}

const opay = {
  code: 'opay',
  name: 'OPay',
  description: 'OPay wallet, card, bank transfer or USSD',
  matchesOrderId: false,
  configured: () => Boolean(process.env.OPAY_MERCHANT_ID && process.env.OPAY_PUBLIC_KEY && process.env.OPAY_PRIVATE_KEY),

  async initialize({ order, reference, amountKobo, email, publicUrl }) {
    const back = `${publicUrl}/payment/done?reference=${encodeURIComponent(reference)}`;
    const d = await opayCall('/api/v1/international/cashier/create', {
      country: 'NG',
      reference,
      amount: { total: amountKobo, currency: 'NGN' },
      returnUrl: back,
      cancelUrl: back,
      callbackUrl: `${publicUrl}/webhooks/opay`,
      expireAt: 30,
      userInfo: { userId: String(order.customerId), userEmail: email },
      product: { name: 'Conect order', description: `Order ${order.id}` },
    }, { signed: false });
    if (d.reference !== reference || !d.cashierUrl) throw httpError(502, 'The payment provider returned an invalid checkout response. Please try again.');
    return { url: d.cashierUrl, reference: d.reference };
  },

  async verify(reference) {
    const d = await opayCall('/api/v1/international/cashier/status', { country: 'NG', reference }, { signed: true });
    const state = d.status === 'SUCCESS' ? 'paid' : ['FAIL', 'CLOSE'].includes(d.status) ? 'failed' : 'pending';
    return { state, reference: d.reference, currency: d.amount && d.amount.currency, amountKobo: Number(d.amount && d.amount.total), orderId: null };
  },

  async refund(paymentRef, { amountKobo }) {
    const reference = 'rf' + crypto.createHash('sha256').update(paymentRef).digest('hex').slice(0, 30);
    const d = await opayCall('/api/v1/international/payment/refund/create', {
      amount: { currency: 'NGN', total: amountKobo },
      callbackUrl: `${process.env.PUBLIC_URL}/webhooks/opay`,
      country: 'NG',
      originalReference: paymentRef,
      reference,
      refundWay: 'Original',
    }, { signed: true });
    if (d.orderStatus === 'FAIL') throw httpError(502, 'OPay did not accept the refund');
    return d;
  },
};

// ---------------- Korapay
const KORAPAY = 'https://api.korapay.com/merchant/api/v1';

async function korapayCall(method, path, body) {
  const r = await fetch(KORAPAY + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.KORAPAY_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok || j.status === false) {
    console.error('Korapay error', r.status, method, path, 'server:', r.headers.get('server'), text.slice(0, 500));
    throw httpError(502, j.message || `The payment provider returned an error (HTTP ${r.status})`);
  }
  return j.data;
}


const korapay = {
  code: 'korapay',
  name: 'Korapay',
  description: 'Card, bank transfer or pay with bank',
  matchesOrderId: false,
  configured: () => Boolean(process.env.KORAPAY_SECRET_KEY),

  async initialize({ order, reference, amountKobo, email, publicUrl }) {
    const d = await korapayCall('POST', '/charges/initialize', {
      reference,
      amount: amountKobo / 100,
      currency: 'NGN',
      narration: 'Conect order',
      redirect_url: `${publicUrl}/payment/done`,
      notification_url: `${publicUrl}/webhooks/korapay`,
      customer: { email },
    });
    if (!d || d.reference !== reference || !d.checkout_url) throw httpError(502, 'The payment provider returned an invalid checkout response. Please try again.');
    return { url: d.checkout_url, reference: d.reference };
  },

  async verify(reference) {
    const d = await korapayCall('GET', `/charges/${encodeURIComponent(reference)}`);
    const state = d.status === 'success' ? 'paid' : ['failed', 'expired'].includes(d.status) ? 'failed' : 'pending';
    const paid = d.amount_paid ?? d.amount;
    return {
      state,
      reference: [d.reference, d.payment_reference].includes(reference) ? reference : d.reference,
      currency: d.currency || 'NGN',
      amountKobo: Math.round(Number(paid) * 100),
      orderId: null,
    };
  },

  async refund(paymentRef, { amountKobo }) {
    const reference = 'rf' + crypto.createHash('sha256').update(paymentRef).digest('hex').slice(0, 30);
    const d = await korapayCall('POST', '/refunds/initiate', {
      payment_reference: paymentRef,
      reference,
      amount: amountKobo / 100,
      reason: 'Order refund',
    });
    if (d && d.status === 'failed') throw httpError(502, 'Korapay did not accept the refund');
    return d;
  },
};

export const gateways = { paystack, opay, korapay };
export const gatewayCodes = Object.keys(gateways);
export const isConfigured = (code) => Boolean(gateways[code] && gateways[code].configured());
export const publicInfo = (code) => ({ code, name: gateways[code].name, description: gateways[code].description });
