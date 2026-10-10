import { z } from 'zod';
import { policySchema, gradeAnswer } from './grading';
import { AppError } from './auth';
export const sourceSchema = z.object({
  sourceType:z.enum(['original_demo','polina','licensed']), sourceUrl:z.union([z.url().refine(s=>s.startsWith('https://'),'Нужна HTTPS-ссылка'),z.literal('')]),
  sourceTitle:z.string().min(3).max(300), author:z.string().min(2).max(150), rightsStatus:z.enum(['unknown','owned','licensed']),
  licenseNote:z.string().max(2000), verifiedAt:z.string().datetime().nullable(), examYear:z.number().int().min(2026).max(2040), editorialStatus:z.enum(['draft','needs_review','approved']),
});
const base = { id:z.uuid().optional(), topicId:z.uuid(), title:z.string().trim().min(3).max(160), status:z.enum(['draft','published']), source:sourceSchema, revision:z.number().int().positive().optional() };
export const lessonSchema = z.object({ ...base, body:z.string().min(30).max(100000) });
export const exerciseSchema = z.object({ ...base, examId:z.uuid(), prompt:z.string().min(10).max(10000), responseKind:z.enum(['short_text','digits_sequence']), answers:z.array(z.string().min(1).max(500)).min(1).max(20), policy:policySchema, explanation:z.string().min(15).max(10000), maxScore:z.number().int().min(1).max(10) });
export function checkPublish(data: z.infer<typeof lessonSchema> | z.infer<typeof exerciseSchema>) {
  if(data.status==='published' && (data.source.rightsStatus==='unknown' || data.source.editorialStatus!=='approved' || !data.source.verifiedAt || data.source.licenseNote.trim().length<10)) throw new AppError('Для публикации подтвердите права, основание использования и методическую проверку.');
  if('answers' in data && data.answers.some(a=>gradeAnswer(a,data).status!=='correct')) throw new AppError('Эталон ответа не соответствует выбранной политике проверки.');
}
export const assignmentSchema = z.object({title:z.string().trim().min(3).max(160), exerciseIds:z.array(z.uuid()).min(1).max(30), studentIds:z.array(z.uuid()).min(1).max(50), dueAt:z.string().datetime().nullable(), feedbackMode:z.enum(['immediate','manual'])});
export const answersSchema = z.object({answers:z.record(z.uuid(),z.string().max(500)),version:z.number().int().nonnegative()});
