import 'dotenv/config';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync,existsSync,writeFileSync,readFileSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { db,pool } from '../src/db';
import * as s from '../src/db/schema';
import { demoTopics,demoExercises } from '../src/db/demo';
import { defaultPolicy,gradeSubmission,type Source,type Snapshot } from '../src/lib/grading';
if(process.env.DEMO_MODE!=='true')throw new Error('Seed is restricted to an explicitly enabled DEMO_MODE.');
const id=(key:string)=>{const h=createHash('sha256').update('polina-demo:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
mkdirSync('.local',{recursive:true,mode:0o700});
const credentialPath='.local/demo-credentials.json';
const credentials:Record<string,string>=existsSync(credentialPath)?JSON.parse(readFileSync(credentialPath,'utf8')):{};
const people=[{login:'polina.demo',displayName:'Полина · демо',role:'TEACHER',exam:'EGE'},{login:'sasha.demo',displayName:'Саша · демо',role:'STUDENT',exam:'EGE'},{login:'mira.demo',displayName:'Мира · демо',role:'STUDENT',exam:'OGE'}] as const;
for(const person of people){
  const [existing]=await db.select({id:s.users.id}).from(s.users).where(eq(s.users.login,person.login));
  if(!existing){credentials[person.login]=randomBytes(16).toString('base64url');const passwordHash=await hash(credentials[person.login],{memoryCost:19456,timeCost:2,parallelism:1});await db.insert(s.users).values({...person,id:id(person.login),passwordHash,demo:true});}
}
writeFileSync(credentialPath,JSON.stringify(credentials,null,2),{mode:0o600});
const teacherId=id('polina.demo');
for(const person of people.slice(1))await db.insert(s.enrollments).values({teacherId,studentId:id(person.login)}).onConflictDoNothing();
for(const exam of ['OGE','EGE'] as const)await db.insert(s.exams).values({id:id(exam),exam,year:2027,status:'draft',sourceUrl:`https://fipi.ru/${exam.toLowerCase()}/demoversii-specifikacii-kodifikatory`}).onConflictDoNothing();
const source:Source={sourceType:'original_demo',sourceUrl:'',sourceTitle:'Оригинальный демонстрационный материал проекта',author:'Демонстрационный контент проекта',rightsStatus:'owned',licenseNote:'Составлено для проекта; не скопировано из сторонних банков заданий.',verifiedAt:null,examYear:2027,editorialStatus:'needs_review'};
for(const [position,topic] of demoTopics.entries()){
  const {body,...fields}=topic,topicId=id(topic.slug);
  await db.insert(s.topics).values({...fields,id:topicId,position}).onConflictDoNothing();
  const [lesson]=await db.insert(s.lessons).values({id:id('lesson:'+topic.slug),topicId,ownerId:teacherId,title:topic.title,body,source,status:'demo'}).onConflictDoNothing().returning();
  if(lesson)await db.insert(s.revisions).values({entityId:lesson.id,kind:'lesson',version:1,content:lesson,ownerId:teacherId}).onConflictDoNothing();
}
const snapshots:Snapshot[]=[];
for(const [index,item] of demoExercises.entries()){
  const topic=demoTopics[item.topic],exerciseId=id('exercise:'+index),policy='policy' in item?item.policy:defaultPolicy;
  const [exercise]=await db.insert(s.exercises).values({id:exerciseId,topicId:id(topic.slug),ownerId:teacherId,examId:id(item.exam),title:item.title,prompt:item.prompt,responseKind:item.topic===2?'digits_sequence':'short_text',answers:[item.answer],policy,explanation:item.explanation,source,status:'demo'}).onConflictDoNothing().returning();
  if(exercise)await db.insert(s.revisions).values({entityId:exercise.id,kind:'exercise',version:1,content:exercise,ownerId:teacherId}).onConflictDoNothing();
  snapshots.push({id:exerciseId,revision:1,title:item.title,prompt:item.prompt,topicId:id(topic.slug),topicTitle:topic.title,topicSlug:topic.slug,exam:item.exam,responseKind:item.topic===2?'digits_sequence':'short_text',answers:[item.answer],policy,explanation:item.explanation,maxScore:1,source});
}
for(const person of people.slice(1)){
  for(const completed of [false,true]){
    const assignmentId=id(`assignment:${person.login}:${completed}`),recipientId=id(`recipient:${person.login}:${completed}`);
    const items=snapshots.filter(i=>i.exam===person.exam).filter((_,i)=>completed?i%2===0:i%2===1);
    await db.insert(s.assignments).values({id:assignmentId,teacherId,title:completed?'Первые шаги · демоистория':'От правила к практике',exam:person.exam,dueAt:completed?null:new Date('2026-10-17T12:00:00Z')}).onConflictDoNothing();
    await db.insert(s.assignmentItems).values(items.map((snapshot,position)=>({assignmentId,exerciseId:snapshot.id,position,snapshot}))).onConflictDoNothing();
    const answers=Object.fromEntries(items.map((e,i)=>[e.id,i===(person.exam==='EGE'?0:1)?'неверный ответ':e.answers[0]]));
    await db.insert(s.recipients).values({id:recipientId,assignmentId,studentId:id(person.login),state:completed?'submitted':'new',draft:completed?answers:{}}).onConflictDoNothing();
    if(completed){const results=gradeSubmission(items,answers);await db.insert(s.attempts).values({recipientId,studentId:id(person.login),results,score:results.reduce((a,r)=>a+r.score,0),maxScore:results.length,createdAt:new Date('2026-10-08T09:00:00Z')}).onConflictDoNothing();await db.insert(s.notifications).values({userId:teacherId,recipientId,message:`${person.displayName}: завершена демонстрационная работа`}).onConflictDoNothing();}
  }
}
console.log('Seed complete: 3 demo accounts, 3 lessons, 12 exercises. Existing records preserved. Local credentials: .local/demo-credentials.json (never commit).');
await pool.end();
