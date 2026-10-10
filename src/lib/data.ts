import { and, eq, or, asc, desc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as s from '@/db/schema';
import { AppError, demoMode, type User } from './auth';
import type { Snapshot } from './grading';

export const visibleStatus = (column: typeof s.lessons.status | typeof s.exercises.status) => demoMode() ? or(eq(column,'published'),eq(column,'demo')) : eq(column,'published');
export async function teacherIds(user: User) {
  if(user.role==='TEACHER') return [user.id];
  return (await db.select().from(s.enrollments).where(eq(s.enrollments.studentId,user.id))).map(e=>e.teacherId);
}
export async function catalog(user:User) {
  const owners=await teacherIds(user);
  return db.select({topic:s.topics,lesson:s.lessons}).from(s.lessons).innerJoin(s.topics,eq(s.lessons.topicId,s.topics.id)).where(and(inArray(s.lessons.ownerId,owners),visibleStatus(s.lessons.status))).orderBy(asc(s.topics.position));
}
export async function exerciseBank(user:User, includeDrafts=false) {
  const owners=await teacherIds(user);
  return db.select({exercise:s.exercises,topic:s.topics,exam:s.exams}).from(s.exercises).innerJoin(s.topics,eq(s.exercises.topicId,s.topics.id)).innerJoin(s.exams,eq(s.exercises.examId,s.exams.id)).where(and(inArray(s.exercises.ownerId,owners),includeDrafts&&user.role==='TEACHER'?undefined:visibleStatus(s.exercises.status))).orderBy(asc(s.topics.position),asc(s.exercises.title));
}
export function toSnapshot(row:Awaited<ReturnType<typeof exerciseBank>>[number]): Snapshot {
  const e=row.exercise;
  return {id:e.id,revision:e.revision,title:e.title,prompt:e.prompt,topicId:e.topicId,topicTitle:row.topic.title,topicSlug:row.topic.slug,exam:row.exam.exam,responseKind:e.responseKind,answers:e.answers,policy:e.policy,explanation:e.explanation,maxScore:e.maxScore,source:e.source};
}
export function safeExercise(item:Snapshot) {
  const {id,title,prompt,topicId,topicTitle,topicSlug,exam,responseKind,policy,maxScore,revision}=item;
  return {id,title,prompt,topicId,topicTitle,topicSlug,exam,responseKind,policy,maxScore,revision};
}
export async function homeworkList(user:User) {
  return db.select({assignment:s.assignments,recipient:s.recipients,student:{id:s.users.id,displayName:s.users.displayName,exam:s.users.exam},attempt:s.attempts}).from(s.recipients)
    .innerJoin(s.assignments,eq(s.recipients.assignmentId,s.assignments.id)).innerJoin(s.users,eq(s.recipients.studentId,s.users.id)).leftJoin(s.attempts,eq(s.attempts.recipientId,s.recipients.id))
    .where(user.role==='TEACHER'?eq(s.assignments.teacherId,user.id):eq(s.recipients.studentId,user.id)).orderBy(desc(s.assignments.createdAt));
}
export async function recipientDetail(user:User,id:string) {
  const [row]=await db.select({assignment:s.assignments,recipient:s.recipients,student:{id:s.users.id,displayName:s.users.displayName},attempt:s.attempts}).from(s.recipients)
    .innerJoin(s.assignments,eq(s.recipients.assignmentId,s.assignments.id)).innerJoin(s.users,eq(s.recipients.studentId,s.users.id)).leftJoin(s.attempts,eq(s.attempts.recipientId,s.recipients.id))
    .where(and(eq(s.recipients.id,id),user.role==='TEACHER'?eq(s.assignments.teacherId,user.id):eq(s.recipients.studentId,user.id))).limit(1);
  if(!row) throw new AppError('Работа не найдена.',404);
  const items=await db.select().from(s.assignmentItems).where(eq(s.assignmentItems.assignmentId,row.assignment.id)).orderBy(asc(s.assignmentItems.position));
  const canSeeResults=user.role==='TEACHER'||row.assignment.feedbackMode==='immediate'||row.recipient.feedbackReleased;
  return {...row,attempt:canSeeResults?row.attempt:null,items:items.map(i=>safeExercise(i.snapshot)),withheld:!!row.attempt&&!canSeeResults};
}
export async function studentAttempts(user:User, studentId?:string) {
  const id=studentId??user.id;
  if(id!==user.id) {
    const [e]=await db.select().from(s.enrollments).where(and(eq(s.enrollments.teacherId,user.id),eq(s.enrollments.studentId,id)));
    if(user.role!=='TEACHER'||!e) throw new AppError('Ученик не найден.',404);
  }
  return db.select({id:s.attempts.id,results:s.attempts.results,score:s.attempts.score,maxScore:s.attempts.maxScore,createdAt:s.attempts.createdAt,kind:s.assignments.kind,title:s.assignments.title}).from(s.attempts)
    .innerJoin(s.recipients,eq(s.attempts.recipientId,s.recipients.id)).innerJoin(s.assignments,eq(s.recipients.assignmentId,s.assignments.id))
    .where(and(eq(s.attempts.studentId,id),user.role==='TEACHER'?eq(s.assignments.teacherId,user.id):or(eq(s.assignments.feedbackMode,'immediate'),eq(s.recipients.feedbackReleased,true))))
    .orderBy(asc(s.attempts.createdAt));
}
export async function studentsFor(user:User) {
  return db.select({id:s.users.id,displayName:s.users.displayName,exam:s.users.exam}).from(s.enrollments).innerJoin(s.users,eq(s.enrollments.studentId,s.users.id)).where(eq(s.enrollments.teacherId,user.id));
}
