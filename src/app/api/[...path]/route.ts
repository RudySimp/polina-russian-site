import { randomBytes } from 'node:crypto';
import { and, eq, asc } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { db } from '@/db';
import * as s from '@/db/schema';
import { AppError, checkOrigin, createSession, demoMode, digest, hashPassword, logout, rateLimit, requireUser, verifyPassword } from '@/lib/auth';
import { answersSchema, assignmentSchema, checkPublish, exerciseSchema, lessonSchema } from '@/lib/validation';
import { exerciseBank, recipientDetail, safeExercise, studentAttempts, studentsFor, toSnapshot } from '@/lib/data';
import { gradeSubmission, recommendedExercises } from '@/lib/grading';

export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const ok=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function json(request:Request) {
  if(!request.headers.get('content-type')?.includes('application/json')) throw new AppError('Ожидается JSON.',415);
  const text=await request.text();
  if(text.length>180000) throw new AppError('Слишком большой запрос.',413);
  try { return JSON.parse(text) as unknown; } catch { throw new AppError('Некорректный JSON.'); }
}
async function handle(request:Request,context:Context) {
  const path=(await context.params).path, route=path.join('/'), method=request.method;
  if(method!=='GET') checkOrigin(request);
  if(route==='auth/login'&&method==='POST') {
    const data=z.object({login:z.string().trim().min(1).max(100).transform(v=>v.toLowerCase()),password:z.string().min(1).max(200)}).parse(await json(request));
    await rateLimit('login-global',300);
    await rateLimit(`login:${digest(data.login)}`,15);
    const [user]=await db.select().from(s.users).where(eq(s.users.login,data.login)).limit(1);
    const valid=user?await verifyPassword(user.passwordHash,data.password):false;
    if(!valid||!user||!user.active||(user.demo&&!demoMode())) throw new AppError('Неверный логин или пароль.',401);
    await createSession(user.id);
    return ok({redirect:user.role==='TEACHER'?'/teacher':'/student'});
  }
  if(route==='auth/register'&&method==='POST') {
    await rateLimit('registration-global',100);
    const data=z.object({token:z.string().length(64),login:z.string().regex(/^[a-z0-9._-]{3,40}$/),displayName:z.string().trim().min(2).max(60),password:z.string().min(12).max(200),consent:z.literal(true)}).parse(await json(request));
    const passwordHash=await hashPassword(data.password);
    const user=await db.transaction(async tx=>{
      const [invite]=await tx.select().from(s.invites).where(eq(s.invites.tokenHash,digest(data.token))).for('update');
      if(!invite||invite.usedAt||invite.expiresAt<new Date()) throw new AppError('Приглашение недействительно или истекло.');
      const [existing]=await tx.select({id:s.users.id}).from(s.users).where(eq(s.users.login,data.login));
      if(existing) throw new AppError('Выберите другой логин.',409);
      const [user]=await tx.insert(s.users).values({login:data.login,displayName:data.displayName,passwordHash,role:'STUDENT',exam:invite.exam,demo:demoMode()}).returning();
      await tx.insert(s.enrollments).values({teacherId:invite.teacherId,studentId:user.id});
      await tx.update(s.invites).set({usedAt:new Date()}).where(eq(s.invites.tokenHash,invite.tokenHash));
      await tx.insert(s.auditLogs).values({actorId:user.id,action:'accepted_preview_data_notice_v1',entityId:user.id});
      return user;
    });
    await createSession(user.id);return ok({redirect:'/student'},201);
  }
  const user=await requireUser();
  if(route==='auth/logout'&&method==='POST') {await logout();return ok({ok:true});}
  if(route==='me'&&method==='GET') return ok(user);
  if(route==='exercises'&&method==='GET') return ok((await exerciseBank(user)).map(toSnapshot).map(safeExercise));
  if(path[0]==='homework'&&path[1]) {
    const id=z.uuid().parse(path[1]);
    if(path.length===2&&method==='GET') return ok(await recipientDetail(user,id));
    if(user.role!=='STUDENT') throw new AppError('Действие доступно ученику.',403);
    if((path[2]==='draft'||path[2]==='submit')&&method==='POST') {
      await rateLimit(`work:${user.id}`,200,60000);
      const input=answersSchema.parse(await json(request));
      const submission=path[2]==='submit';
      const result=await db.transaction(async tx=>{
        const [recipient]=await tx.select().from(s.recipients).where(and(eq(s.recipients.id,id),eq(s.recipients.studentId,user.id))).for('update');
        if(!recipient) throw new AppError('Работа не найдена.',404);
        if(recipient.state==='submitted') {if(submission)return {submitted:true};throw new AppError('Работа уже сдана.',409);}
        if(recipient.draftVersion!==input.version) throw new AppError('Работа обновлена в другой вкладке. Перезагрузите страницу.',409);
        const [assignment]=await tx.select().from(s.assignments).where(eq(s.assignments.id,recipient.assignmentId));
        const items=await tx.select().from(s.assignmentItems).where(eq(s.assignmentItems.assignmentId,assignment.id)).orderBy(asc(s.assignmentItems.position));
        const allowed=new Set(items.map(i=>i.exerciseId));
        if(Object.keys(input.answers).some(k=>!allowed.has(k)))throw new AppError('В ответах есть неизвестное упражнение.');
        if(submission&&items.some(i=>!input.answers[i.exerciseId]?.trim()))throw new AppError('Ответьте на все задания перед сдачей.');
        if(submission) {
          const results=gradeSubmission(items.map(i=>i.snapshot),input.answers);
          await tx.insert(s.attempts).values({recipientId:id,studentId:user.id,results,score:results.reduce((a,r)=>a+r.score,0),maxScore:results.reduce((a,r)=>a+r.maxScore,0)});
          if(assignment.kind==='homework') await tx.insert(s.notifications).values({userId:assignment.teacherId,recipientId:id,message:`${user.displayName} сдал(а) работу «${assignment.title}»`}).onConflictDoNothing();
        }
        await tx.update(s.recipients).set({draft:input.answers,draftVersion:recipient.draftVersion+1,state:submission?'submitted':'in_progress'}).where(eq(s.recipients.id,id));
        return {version:recipient.draftVersion+1,submitted:submission};
      });
      return ok(result);
    }
  }
  if(route==='practice'&&method==='POST') {
    if(user.role!=='STUDENT')throw new AppError('Тренировка доступна ученику.',403);
    await rateLimit(`practice:${user.id}`,30,60000);
    const input=z.object({topicId:z.uuid().optional(),exam:z.enum(['OGE','EGE']).optional(),recommend:z.boolean().optional()}).parse(await json(request));
    let rows=(await exerciseBank(user)).filter(r=>r.exam.exam===(input.exam??user.exam)&&(!input.topicId||r.topic.id===input.topicId));
    if(!rows.length)throw new AppError('Для этой темы пока нет доступных упражнений.');
    // A practice run belongs to one teacher, maintaining tenant boundaries.
    rows=rows.filter(r=>r.exercise.ownerId===rows[0].exercise.ownerId);
    const history=await studentAttempts(user);
    const snapshots=input.recommend?recommendedExercises(rows.map(toSnapshot),history):rows.slice(0,5).map(toSnapshot);
    if(!snapshots.length)throw new AppError('Все доступные задания недавно решены верно. Выберите другую тему.');
    const recipient=await db.transaction(async tx=>{
      const [a]=await tx.insert(s.assignments).values({teacherId:rows[0].exercise.ownerId,title:input.recommend?'Повторение слабых тем':`Практика · ${input.topicId?rows[0].topic.title:'мини-тренировка'}`,kind:'practice',exam:rows[0].exam.exam}).returning();
      await tx.insert(s.assignmentItems).values(snapshots.map((snapshot,position)=>({assignmentId:a.id,exerciseId:snapshot.id,position,snapshot})));
      const [r]=await tx.insert(s.recipients).values({assignmentId:a.id,studentId:user.id}).returning();return r;
    });
    return ok({id:recipient.id},201);
  }
  if(!route.startsWith('teacher/'))throw new AppError('Маршрут не найден.',404);
  if(user.role!=='TEACHER')throw new AppError('Недостаточно прав.',403);
  if(route==='teacher/students'&&method==='GET')return ok(await studentsFor(user));
  if(route==='teacher/invites'&&method==='POST') {
    const {exam}=z.object({exam:z.enum(['OGE','EGE'])}).parse(await json(request));
    const token=randomBytes(32).toString('hex');
    await db.insert(s.invites).values({tokenHash:digest(token),teacherId:user.id,exam,expiresAt:new Date(Date.now()+7*86400000)});
    return ok({url:`${process.env.APP_ORIGIN}/join?token=${token}`},201);
  }
  if(route==='teacher/assignments'&&method==='POST') {
    const input=assignmentSchema.parse(await json(request));
    const students=await studentsFor(user);
    if(input.studentIds.some(id=>!students.some(s=>s.id===id)))throw new AppError('Ученик не найден.',404);
    const rows=(await exerciseBank(user)).filter(r=>input.exerciseIds.includes(r.exercise.id));
    if(rows.length!==new Set(input.exerciseIds).size)throw new AppError('Можно назначить только доступные задания.');
    if(new Set(rows.map(r=>r.exam.exam)).size!==1)throw new AppError('Выберите упражнения одного экзамена.');
    const exam=rows[0].exam.exam;
    if(input.studentIds.some(id=>students.find(s=>s.id===id)?.exam!==exam))throw new AppError('Направление ученика должно совпадать с упражнениями.');
    const ids=await db.transaction(async tx=>{
      const [a]=await tx.insert(s.assignments).values({teacherId:user.id,title:input.title,exam,dueAt:input.dueAt?new Date(input.dueAt):null,feedbackMode:input.feedbackMode}).returning();
      await tx.insert(s.assignmentItems).values(rows.map((r,position)=>({assignmentId:a.id,exerciseId:r.exercise.id,position,snapshot:toSnapshot(r)})));
      const recipients=await tx.insert(s.recipients).values([...new Set(input.studentIds)].map(studentId=>({assignmentId:a.id,studentId}))).returning({id:s.recipients.id});
      await tx.insert(s.auditLogs).values({actorId:user.id,action:'assignment_created',entityId:a.id});
      return recipients;
    });return ok({recipients:ids},201);
  }
  if(path[1]==='release'&&path[2]&&method==='POST') {
    const id=z.uuid().parse(path[2]),detail=await recipientDetail(user,id);
    if(detail.recipient.state!=='submitted')throw new AppError('Работа ещё не сдана.');
    await db.transaction(async tx=>{
      await tx.update(s.recipients).set({feedbackReleased:true}).where(eq(s.recipients.id,id));
      await tx.insert(s.auditLogs).values({actorId:user.id,action:'feedback_released',entityId:id});
    });return ok({ok:true});
  }
  if(route==='teacher/notifications/read'&&method==='POST') {
    await db.update(s.notifications).set({readAt:new Date()}).where(eq(s.notifications.userId,user.id));return ok({ok:true});
  }
  if(route==='teacher/topics'&&method==='POST') {
    const data=z.object({title:z.string().trim().min(3).max(150),section:z.string().trim().min(3).max(100),description:z.string().max(1000)}).parse(await json(request));
    const [topic]=await db.insert(s.topics).values({...data,slug:`topic-${randomBytes(6).toString('hex')}`}).returning();return ok(topic,201);
  }
  if((route==='teacher/lessons'||route==='teacher/exercises')&&method==='POST') {
    const isLesson=route.endsWith('/lessons'), data=isLesson?lessonSchema.parse(await json(request)):exerciseSchema.parse(await json(request));
    checkPublish(data);
    const table=isLesson?s.lessons:s.exercises;
    const result=await db.transaction(async tx=>{
      const [topic]=await tx.select().from(s.topics).where(eq(s.topics.id,data.topicId));
      if(!topic)throw new AppError('Тема не найдена.');
      if(!isLesson&&'examId' in data){const [exam]=await tx.select().from(s.exams).where(eq(s.exams.id,data.examId));if(!exam||exam.year!==data.source.examYear)throw new AppError('Год источника не совпадает с версией экзамена.');}
      const [old]=data.id?await tx.select().from(table).where(and(eq(table.id,data.id),eq(table.ownerId,user.id))).for('update'):[];
      if(data.id&&!old)throw new AppError('Материал не найден.',404);
      if(old&&data.revision!==old.revision)throw new AppError('Материал уже изменён. Перезагрузите редактор.',409);
      const revision=(old?.revision??0)+1;
      let saved;
      if(isLesson) {
        const lesson=lessonSchema.parse(data),values={...lesson,ownerId:user.id,revision,updatedAt:new Date()};
        [saved]=old?await tx.update(s.lessons).set(values).where(eq(s.lessons.id,old.id)).returning():await tx.insert(s.lessons).values(values).returning();
      } else {
        const exercise=exerciseSchema.parse(data),values={...exercise,ownerId:user.id,revision};
        [saved]=old?await tx.update(s.exercises).set(values).where(eq(s.exercises.id,old.id)).returning():await tx.insert(s.exercises).values(values).returning();
      }
      await tx.insert(s.revisions).values({entityId:saved.id,kind:isLesson?'lesson':'exercise',version:revision,content:saved,ownerId:user.id});
      await tx.insert(s.auditLogs).values({actorId:user.id,action:`${isLesson?'lesson':'exercise'}_${data.status}`,entityId:saved.id});
      return saved;
    });return ok(result);
  }
  if(path[1]==='revisions'&&path[2]&&method==='GET') {
    const id=z.uuid().parse(path[2]);return ok(await db.select().from(s.revisions).where(and(eq(s.revisions.entityId,id),eq(s.revisions.ownerId,user.id))).orderBy(asc(s.revisions.version)));
  }
  throw new AppError('Маршрут не найден.',404);
}
async function handler(request:Request,context:Context) {
  try{return await handle(request,context);}catch(error){
    if(error instanceof AppError)return ok({error:error.message},error.status);
    if(error instanceof ZodError)return ok({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},400);
    console.error('api_request_failed',{name:error instanceof Error?error.name:'unknown'});
    return ok({error:'Не удалось выполнить запрос. Повторите позже.'},500);
  }
}
export const GET=handler;
export const POST=handler;
