// Fail fast on a bad setup instead of misbehaving later. Imported right after dotenv.
const env = process.env;
const prod = env.NODE_ENV === 'production';
const problems = [];

if (!env.DATABASE_URL) problems.push('DATABASE_URL is missing');
if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
if (prod) {
  if (/change-me/i.test(env.JWT_SECRET || '')) problems.push('JWT_SECRET is still the example value');
  if (!env.PAYSTACK_SECRET_KEY && !(env.PAYDER_API_KEY && env.PAYDER_MERCHANT_ID && env.PAYDER_WEBHOOK_SECRET)) problems.push('No payment gateway is configured: set PAYSTACK_SECRET_KEY and/or PAYDER_API_KEY, PAYDER_MERCHANT_ID and PAYDER_WEBHOOK_SECRET');
  if (!/^(?:[0-9a-fA-F]{64}|[A-Za-z0-9_-]{43,44})$/.test(env.DOCUMENT_ENCRYPTION_KEY || '')) problems.push('DOCUMENT_ENCRYPTION_KEY must be a securely generated 32-byte key (64 hex characters or 43-44 base64url characters)');
  if (!/^https:\/\//.test(env.PUBLIC_URL || '')) problems.push('PUBLIC_URL must start with https:// in production');
}

if (problems.length) {
  console.error('Cannot start Cönëct:\n - ' + problems.join('\n - '));
  process.exit(1);
}
