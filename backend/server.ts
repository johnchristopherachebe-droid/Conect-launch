import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { router, authSignup, authSignin, signToken, verifyToken, createAndSendEmailVerification, getAppUserById } from './platform.js';
import { handler } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app=express();
const allowedOrigin=process.env.PUBLIC_APP_URL||'';
app.use(cors({origin:allowedOrigin?[allowedOrigin,/\.vercel\.app$/]:true,credentials:true}));
app.use(express.json({limit:'12mb',verify:(req:any,_res,buf)=>{req.rawBody=buf}}));
app.use('/storage',express.static(path.resolve(process.env.STORAGE_DIR||'./storage')));

// Lightweight in-memory rate limiter. Not distributed (fine for a single backend instance);
// resets on redeploy. Protects auth endpoints against brute-force/credential-stuffing.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: any, res: any, next: any) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({ message: 'Too many attempts. Please wait a moment and try again.' });
    }
    bucket.count++;
    next();
  };
}
(setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (now > bucket.resetAt) rateBuckets.delete(key);
}, 5 * 60 * 1000) as any).unref?.();

app.post('/api/auth/signup',rateLimit(5,15*60*1000),async(req,res)=>{try{const {email,password,name,phone}=req.body||{};if(!email||!password||!name)return res.status(400).json({message:'Name, email and password are required.'});const u=await authSignup(email,password,name,phone);createAndSendEmailVerification(u.id,u.email,u.name).catch(e=>console.error('verification email failed:',e?.message||e));return res.status(201).json({user:{userId:u.id,email:u.email,name:u.name,phone:u.phone,emailVerified:false,phoneVerified:false},token:signToken({userId:u.id,email:u.email,name:u.name})});}catch(e:any){return res.status(400).json({message:e.message||'Could not create account.'});}});
app.post('/api/auth/signin',rateLimit(8,15*60*1000),async(req,res)=>{try{const {email,password}=req.body||{};if(!email||!password)return res.status(400).json({message:'Email and password are required.'});return res.json(await authSignin(email,password));}catch(e:any){return res.status(401).json({message:e.message||'Sign in failed.'});}});
app.get('/api/_healthcheck',(req,res)=>res.json({ok:true,app:'cönëct'}));
app.use('/api/auth/resend-verification',rateLimit(3,15*60*1000));
app.use('/api/auth/send-phone-otp',rateLimit(3,15*60*1000));
app.use('/api/auth/verify-phone-otp',rateLimit(10,15*60*1000));
app.use('/api/geocode/search',rateLimit(20,60*1000));
app.use('/api/geocode/reverse',rateLimit(30,60*1000));

// Hard verification gate: a signed-in user who hasn't confirmed both their email and
// phone number is blocked from every other API route. This is enforced here (not just
// in the UI) so it can't be bypassed by calling the API directly.
const VERIFICATION_EXEMPT_PATHS = new Set([
  '/api/auth/signup',
  '/api/auth/signin',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/send-phone-otp',
  '/api/auth/verify-phone-otp',
  '/api/me',
  '/api/profile/onboarding',
  '/api/push/vapid-public-key',
  '/api/_healthcheck',
]);
app.use('/api', async (req, res, next) => {
  if (VERIFICATION_EXEMPT_PATHS.has(req.path)) return next();
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return next(); // no token: let the route's own requireAuth() produce a 401
  try {
    const payload = verifyToken(auth.slice(7));
    const appUser = await getAppUserById(payload.userId);
    if (appUser && (!appUser.email_verified || !appUser.phone_verified)) {
      return res.status(403).json({
        message: 'Please verify your email and phone number to continue.',
        verificationRequired: true,
        emailVerified: appUser.email_verified,
        phoneVerified: appUser.phone_verified,
      });
    }
  } catch {
    // invalid/expired token: let the route's own requireAuth() produce a 401
  }
  next();
});

app.use('/api',rateLimit(120,60*1000));
app.use(handler);

// Serve the built frontend (if present) so one service handles both the API and the app —
// no separate frontend host needed. Run `npm run build:frontend` before starting in production.
const frontendDist = path.resolve(__dirname, '../../dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api|\/storage).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.warn(`Frontend build not found at ${frontendDist} — only the API will be served. Run "npm run build:frontend" in the project root before starting in production.`);
}

const port=Number(process.env.PORT||3000); app.listen(port,'0.0.0.0',()=>console.log(`cönëct listening on ${port}`));
