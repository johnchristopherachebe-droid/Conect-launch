import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { pool } from './db.js';

const dir = new URL('.', import.meta.url);
await pool.query(readFileSync(new URL('schema.sql', dir), 'utf8'));
// Never seed fictional stores automatically. Set SEED_DEMO_DATA=true only in a disposable local/test database.
if (process.env.SEED_DEMO_DATA === 'true') {
  await pool.query(readFileSync(new URL('seed.sql', dir), 'utf8'));
  console.log('Demo stores loaded into this explicitly opted-in database.');
}
console.log('Database ready.');
await pool.end();
