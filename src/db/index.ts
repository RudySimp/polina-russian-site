import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
const globals = globalThis as unknown as { polinaPool?: Pool };
export const pool = globals.polinaPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
if (process.env.NODE_ENV !== 'production') globals.polinaPool = pool;
export const db = drizzle(pool, { schema });
