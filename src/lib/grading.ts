import { z } from 'zod';

export const policySchema = z.object({
  version: z.literal(1), trim: z.boolean(), caseSensitive: z.boolean(),
  collapseSpaces: z.boolean(), allowYoAsE: z.boolean(),
  orderMatters: z.boolean(), allowDigitSeparators: z.boolean(),
  minLength: z.number().int().min(1).max(500), maxLength: z.number().int().min(1).max(500),
}).refine(v => v.maxLength >= v.minLength, 'Некорректная длина ответа');
export type Policy = z.infer<typeof policySchema>;
export const defaultPolicy: Policy = { version: 1, trim: true, caseSensitive: false, collapseSpaces: true, allowYoAsE: false, orderMatters: true, allowDigitSeparators: false, minLength: 1, maxLength: 100 };
export type ResponseKind = 'short_text' | 'digits_sequence';
export type Grade = { status: 'correct' | 'incorrect' | 'format_error'; score: number; maxScore: number; message: string };
export type Snapshot = { id: string; revision: number; title: string; prompt: string; topicId: string; topicTitle: string; topicSlug: string; exam: string; responseKind: ResponseKind; answers: string[]; policy: Policy; explanation: string; maxScore: number; source: Source; };
export type Result = Grade & { exerciseId: string; answer: string; expected: string[]; explanation: string; topicId: string; topicTitle: string; topicSlug: string };
export type Source = { sourceType: 'original_demo' | 'polina' | 'licensed'; sourceUrl: string; sourceTitle: string; author: string; rightsStatus: 'unknown' | 'owned' | 'licensed'; licenseNote: string; verifiedAt: string | null; examYear: number; editorialStatus: 'draft' | 'needs_review' | 'approved' };

export function normalize(answer: string, kind: ResponseKind, policy: Policy): string {
  let value = answer.normalize('NFC');
  if (policy.trim) value = value.trim();
  if (policy.collapseSpaces) value = value.replace(/\s+/gu, ' ');
  if (!policy.caseSensitive) value = value.toLocaleLowerCase('ru');
  if (policy.allowYoAsE) value = value.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  if (kind === 'digits_sequence') {
    if (policy.allowDigitSeparators) value = value.replace(/[ ,]/g, '');
    if (!policy.orderMatters) value = [...value].sort().join('');
  }
  return value;
}
export function gradeAnswer(answer: string, exercise: Pick<Snapshot, 'responseKind' | 'answers' | 'policy' | 'maxScore'>): Grade {
  const { responseKind: kind, policy, maxScore } = exercise;
  const value = normalize(answer, kind, policy);
  let error = '';
  if (value.length < policy.minLength || value.length > policy.maxLength) error = `Введите от ${policy.minLength} до ${policy.maxLength} символов.`;
  if (kind === 'digits_sequence' && (!/^[1-9]+$/.test(value) || new Set(value).size !== value.length)) error = 'Используйте цифры от 1 до 9 без повторений. Разделители допустимы только по инструкции.';
  if (error) return { status: 'format_error', score: 0, maxScore, message: error };
  const correct = exercise.answers.some(a => normalize(a, kind, policy) === value);
  return { status: correct ? 'correct' : 'incorrect', score: correct ? maxScore : 0, maxScore, message: correct ? 'Верно! Правило применено точно.' : 'Сравните свой ответ с объяснением и вернитесь к правилу.' };
}
export function gradeSubmission(items: Snapshot[], answers: Record<string, string>): Result[] {
  return items.map(item => ({ ...gradeAnswer(answers[item.id] ?? '', item), exerciseId: item.id, answer: answers[item.id] ?? '', expected: item.answers, explanation: item.explanation, topicId: item.topicId, topicTitle: item.topicTitle, topicSlug: item.topicSlug }));
}

export type TopicMetric = { topicId: string; title: string; slug: string; total: number; correct: number; errors: number; recentErrors: number; accuracy: number; priority: number };
export function topicMetrics(attempts: { results: Result[] }[]): TopicMetric[] {
  const byTopic = new Map<string, { result: Result; index: number }[]>();
  attempts.forEach((a, index) => a.results.forEach(result => { const list = byTopic.get(result.topicId) ?? []; list.push({ result, index }); byTopic.set(result.topicId, list); }));
  return [...byTopic].map(([topicId, values]) => {
    const total = values.length, correct = values.filter(v => v.result.status === 'correct').length;
    const recent = values.slice(-5), recentErrors = recent.filter(v => v.result.status !== 'correct').length;
    return { topicId, title: values[0].result.topicTitle, slug: values[0].result.topicSlug, total, correct, errors: total - correct, recentErrors, accuracy: Math.round(correct / total * 100), priority: total < 2 ? 0 : recentErrors / recent.length };
  }).sort((a, b) => b.priority - a.priority || b.errors - a.errors);
}
export function recommendedExercises(items: Snapshot[], attempts: { results: Result[] }[]): Snapshot[] {
  const metrics = topicMetrics(attempts), priorities = new Map(metrics.map(m => [m.topicId, m.priority]));
  const recentCorrect = new Set(attempts.slice(-3).flatMap(a => a.results.filter(r => r.status === 'correct').map(r => r.exerciseId)));
  return items.filter(i => !recentCorrect.has(i.id)).sort((a,b) => (priorities.get(b.topicId) ?? 0) - (priorities.get(a.topicId) ?? 0)).slice(0, 5);
}
