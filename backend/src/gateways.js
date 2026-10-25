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

// ---------------- Payder
const payderBase = () => process.env.PAYDER_BASE_URL
  || ((process.env.PAYDER_API_KEY || '').startsWith('pdr_live_') ? 'https://api.payder.ng' : 'https://sandbox-api.payder.ng');

async function payderCall(method, path, body, idempotencyKey) {
  const r = await fetch(payderBase() + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYDER_API_KEY}`,
      'X-Merchant-Id': process.env.PAYDER_MERCHANT_ID,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(httpError(502, (j.error && j.error.message) || 'The payment provider returned an error'), { providerStatus: r.status });
  return j;
}

const payder = {
  code: 'payder',
  name: 'Payder',
  description: 'Card or bank transfer',
  matchesOrderId: false,
  configured: () => Boolean(process.env.PAYDER_API_KEY && process.env.PAYDER_MERCHANT_ID && process.env.PAYDER_WEBHOOK_SECRET),

  async initialize({ order, reference, amountKobo, email, publicUrl }) {
    const d = await payderCall('POST', '/v1/checkouts', {
      reference,
      amount: amountKobo,
      currency: 'NGN',
      description: 'Conect order',
      customer: { email },
      returnUrl: `${publicUrl}/payment/done`,
      metadata: { orderId: order.id },
    }, `init-${reference}`);
    if (d.reference !== reference || !d.checkoutUrl) throw httpError(502, 'The payment provider returned an invalid checkout response. Please try again.');
    return { url: d.checkoutUrl, reference: d.reference };
  },

  async verify(reference) {
    const d = await payderCall('GET', `/v1/checkouts/${encodeURIComponent(reference)}`);
    const state = d.status === 'succeeded' ? 'paid' : d.status === 'failed' ? 'failed' : 'pending';
    return { state, reference: d.reference, currency: d.currency, amountKobo: Number(d.amount), orderId: null };
  },

  async refund(paymentRef, { amountKobo }) {
    const reference = 'rf-' + crypto.createHash('sha256').update(paymentRef).digest('hex').slice(0, 30);
    const d = await payderCall('POST', '/v1/refunds', {
      reference,
      paymentReference: paymentRef,
      amount: amountKobo,
      reason: 'Order refund',
    }, reference);
    if (d.status === 'failed') throw httpError(502, 'Payder did not accept the refund');
    return d;
  },
};

export const payderPayouts = {
  create({ reference, amountKobo, bankName, accountNumber, accountName }) {
    return payderCall('POST', '/v1/payouts', {
      reference,
      amount: amountKobo,
      currency: 'NGN',
      recipient: { bankName, accountNumber, accountName },
      narration: 'Conect payout',
    }, reference);
  },
  get: (reference) => payderCall('GET', `/v1/payouts/${encodeURIComponent(reference)}`),
};

export const gateways = { paystack, payder };
export const gatewayCodes = Object.keys(gateways);
export const isConfigured = (code) => Boolean(gateways[code] && gateways[code].configured());
export const publicInfo = (code) => ({ code, name: gateways[code].name, description: gateways[code].description });
