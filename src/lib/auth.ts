import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { cookies } from 'next/headers';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users, rateLimits } from '@/db/schema';
import { redirect } from 'next/navigation';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const hashPassword = (password: string) => hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = verify;
export const demoMode = () => process.env.DEMO_MODE === 'true';
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type User = Pick<typeof users.$inferSelect, 'id'|'displayName'|'role'|'exam'|'demo'>;
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get('polina_session')?.value;
  if (!token) return null;
  const [row] = await db.select({ user: users }).from(sessions).innerJoin(users,eq(sessions.userId,users.id))
    .where(and(eq(sessions.tokenHash,digest(token)),gt(sessions.expiresAt,new Date()),eq(users.active,true))).limit(1);
  if (!row || (row.user.demo && !demoMode())) return null;
  const { id, displayName, role, exam, demo } = row.user;
  return { id, displayName, role, exam, demo };
}
export async function requireUser(role?: User['role']): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AppError('Войдите в аккаунт.',401);
  if (role && user.role !== role) throw new AppError('Недостаточно прав.',403);
  return user;
}
export async function pageUser(role?: User['role']): Promise<User> {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect(user.role === 'TEACHER' ? '/teacher' : '/student');
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await db.insert(sessions).values({ tokenHash: digest(token), userId, expiresAt: new Date(Date.now()+7*86400000) });
  (await cookies()).set('polina_session',token,{ httpOnly:true, secure: process.env.COOKIE_SECURE === 'true', sameSite:'lax', path:'/', maxAge:7*86400 });
}
export async function logout() {
  const jar=await cookies(), token=jar.get('polina_session')?.value;
  if(token) await db.delete(sessions).where(eq(sessions.tokenHash,digest(token)));
  jar.delete('polina_session');
}
export async function rateLimit(key: string, limit: number, windowMs = 900000) {
  const now = new Date(), resetsAt = new Date(Date.now()+windowMs);
  const [row] = await db.insert(rateLimits).values({ key, count:1, resetsAt }).onConflictDoUpdate({ target:rateLimits.key, set:{
    count:sql`CASE WHEN ${rateLimits.resetsAt} < ${now} THEN 1 ELSE ${rateLimits.count} + 1 END`,
    resetsAt:sql`CASE WHEN ${rateLimits.resetsAt} < ${now} THEN ${resetsAt} ELSE ${rateLimits.resetsAt} END`,
  }}).returning();
  if(row.count > limit) throw new AppError('Слишком много запросов. Попробуйте позже.',429);
}
export function checkOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN;
  if(!expected || request.headers.get('origin') !== new URL(expected).origin) throw new AppError('Источник запроса не разрешён. Обновите страницу.',403);
}
