import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Read-only database assertions and real authentication requests. No secret values in output.
if (process.env.DEMO_MODE !== 'true') throw new Error('This check uses local demo accounts and requires DEMO_MODE=true.');
const credentials = JSON.parse(readFileSync('.local/demo-credentials.json', 'utf8'));
const origin = new URL(process.env.APP_ORIGIN).origin;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let passed = 0;
const checked = (name) => { passed++; console.log(`PASS ${name}`); };
async function request(path, cookie, body) {
  return fetch(`${origin}/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
}
const cookies = [];
try {
  const { rows: versions } = await pool.query('SELECT version() AS version');
  assert.match(versions[0].version, /^PostgreSQL 17\./);
  checked('PostgreSQL 17 connection');
  const { rows: migrations } = await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
  assert.ok(migrations[0].n >= 1);
  checked('Schema migration recorded');
  assert.equal((await request('me')).status, 401);
  checked('Anonymous API access returns 401');
  const profiles = [];
  for (const login of ['polina.demo', 'sasha.demo', 'mira.demo']) {
    assert.equal(typeof credentials[login], 'string', `Missing local demo credential for ${login}`);
    const response = await request('auth/login', null, { login, password: credentials[login] });
    assert.equal(response.status, 200, 'Login must succeed');
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Lax/i);
    if (process.env.COOKIE_SECURE === 'true') assert.match(setCookie, /Secure/i);
    const cookie = setCookie.split(';')[0]; cookies.push(cookie);
    const me = await request('me', cookie);
    assert.equal(me.status, 200); profiles.push(await me.json());
  }
  assert.deepEqual(profiles.map(p => p.role), ['TEACHER', 'STUDENT', 'STUDENT']);
  checked('Three demo accounts authenticate with protected session cookies');
  const teacherStudents = await request('teacher/students', cookies[0]);
  assert.equal(teacherStudents.status, 200); assert.ok((await teacherStudents.json()).length >= 2);
  assert.equal((await request('teacher/students', cookies[1])).status, 403);
  checked('Teacher/student role separation');
  const bankResponse = await request('exercises', cookies[1]);
  assert.equal(bankResponse.status, 200);
  const bank = await bankResponse.json(); assert.ok(bank.length >= 12);
  for (const exercise of bank) {
    assert.equal('answers' in exercise, false); assert.equal('explanation' in exercise, false);
    assert.equal('source' in exercise, false);
  }
  checked('Exercises load from PostgreSQL without answer keys');
  const { rows } = await pool.query('SELECT id FROM assignment_recipients WHERE student_id=$1 AND state=$2 LIMIT 1', [profiles[1].id, 'new']);
  assert.ok(rows.length, 'Seed must contain an unfinished homework assignment');
  const own = await request(`homework/${rows[0].id}`, cookies[1]); assert.equal(own.status, 200);
  const detail = await own.json(); assert.equal(detail.attempt, null); assert.ok(detail.items.length >= 1);
  for (const item of detail.items) assert.equal('answers' in item, false);
  assert.equal((await request(`homework/${rows[0].id}`, cookies[2])).status, 404);
  checked('Own homework loads; another student receives 404');
  const csrf = await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { cookie: cookies[1], Origin: 'https://invalid.example' } });
  assert.equal(csrf.status, 403);
  checked('Foreign-origin mutation rejected');
  console.log(`${passed} environment checks passed. No homework or content was modified.`);
} finally {
  for (const cookie of cookies) {
    const response = await request('auth/logout', cookie, {});
    assert.equal(response.status, 200);
    assert.equal((await request('me', cookie)).status, 401);
  }
  await pool.end();
}
