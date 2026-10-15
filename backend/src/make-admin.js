import 'dotenv/config';
import { pool } from './db.js';

// Usage: npm run make-admin you@example.com   (register that account in the app first)
const email = process.argv[2];
if (!email) { console.error('Usage: npm run make-admin <email>'); process.exit(1); }
const { rowCount } = await pool.query("UPDATE users SET role = 'admin' WHERE email = lower($1)", [email]);
console.log(rowCount ? `${email} is now an admin.` : 'No account with that email. Register it first.');
await pool.end();
