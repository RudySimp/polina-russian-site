import { gradeSubmission, type Result, type TopicMetric, topicMetrics } from '../../../src/lib/grading';
import { exercises, type Exercise } from './content';
export type LocalAttempt = { id: string; createdAt: string; exerciseId: string; revision: number; skillId: string; misconceptionId: string | null; repeat: boolean; results: Result[] };
export const storageKey = 'polina-showcase-attempts-v1';
export function readAttempts(storage: Pick<Storage, 'getItem'>): LocalAttempt[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((a): a is LocalAttempt => {
      if (!a || typeof a !== 'object' || typeof a.exerciseId !== 'string' || typeof a.id !== 'string' || typeof a.repeat !== 'boolean' || typeof a.createdAt !== 'string' || !Number.isFinite(Date.parse(a.createdAt))) return false;
      const exercise = exercises.find(e => e.id === a.exerciseId);
      const result = a.results?.[0];
      return !!exercise && a.revision === exercise.revision && a.skillId === exercise.skillId && Array.isArray(a.results) && a.results.length === 1 && typeof result?.answer === 'string' && result.answer.length <= 100 && ['correct', 'incorrect', 'format_error'].includes(result.status) && result.topicId === exercise.topicId;
    }).slice(-200).map(a => {
      const exercise = exercises.find(e => e.id === a.exerciseId)!;
      return { ...a, results: gradeSubmission([exercise], { [exercise.id]: a.results[0].answer }) };
    });
  } catch { return []; }
}
export function createAttempt(exercise: Exercise, answer: string, repeat: boolean): LocalAttempt {
  const results = gradeSubmission([exercise], { [exercise.id]: answer });
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), exerciseId: exercise.id, revision: exercise.revision, skillId: exercise.skillId, misconceptionId: results[0].status === 'correct' ? null : exercise.misconceptionId, repeat, results };
}
export function localMetrics(attempts: LocalAttempt[]): (TopicMetric & { independent: number })[] {
  return topicMetrics(attempts).map(metric => ({ ...metric, independent: new Set(attempts.filter(a => a.results[0].topicId === metric.topicId).map(a => a.exerciseId)).size }));
}
export function confidence(independent: number): string {
  return independent < 3 ? 'Данных пока недостаточно для вывода об освоении темы' : 'Предварительная оценка по нескольким заданиям';
}
