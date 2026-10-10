import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  const password = randomBytes(24).toString('hex');
  writeFileSync('.env', `DATABASE_URL=postgresql://polina:${password}@127.0.0.1:5433/polina\nPOSTGRES_PASSWORD=${password}\nAPP_ORIGIN=http://localhost:3000\nDEMO_MODE=true\nCOOKIE_SECURE=false\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created local .env with a generated database password.');
} else console.log('Existing .env preserved.');
