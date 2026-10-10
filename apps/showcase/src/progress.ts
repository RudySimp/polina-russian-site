import { gradeSubmission, type Result } from "../../../src/lib/grading";
import { exercises, type Exercise } from "./content";
export type LocalAttempt = {
  id: string;
  createdAt: string;
  exerciseId: string;
  revision: number;
  skillId: string;
  misconceptionId: string | null;
  repeat: boolean;
  results: Result[];
};
export const storageKey = "polina-showcase-attempts-v1";
export function readAttempts(
  storage: Pick<Storage, "getItem">,
): LocalAttempt[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter((a): a is LocalAttempt => {
        if (
          !a ||
          typeof a !== "object" ||
          typeof a.exerciseId !== "string" ||
          typeof a.id !== "string" ||
          typeof a.repeat !== "boolean" ||
          typeof a.createdAt !== "string" ||
          !Number.isFinite(Date.parse(a.createdAt))
        )
          return false;
        const exercise = exercises.find((e) => e.id === a.exerciseId);
        const result = a.results?.[0];
        const legacySkills: Record<string, string> = {
          "punctuation.homogeneous": "EGE:punctuation.homogeneous",
          "orthoepy.stress": "EGE:orthoepy.stress",
          "syntax.foundation": "OGE:syntax.foundation",
        };
        return (
          !!exercise &&
          a.revision === exercise.revision &&
          (a.skillId === exercise.skillId ||
            legacySkills[a.skillId] === exercise.skillId) &&
          Array.isArray(a.results) &&
          a.results.length === 1 &&
          typeof result?.answer === "string" &&
          result.answer.length <= 100 &&
          ["correct", "incorrect"].includes(result.status)
        );
      })
      .slice(-1000)
      .map((a) => {
        const exercise = exercises.find((e) => e.id === a.exerciseId)!;
        const results = gradeSubmission([exercise], {
          [exercise.id]: a.results[0].answer,
        });
        return {
          ...a,
          skillId: exercise.skillId,
          misconceptionId:
            results[0].status === "incorrect" ? exercise.misconceptionId : null,
          results,
        };
      })
      .filter((attempt) => attempt.results[0].status !== "format_error");
  } catch {
    return [];
  }
}
export function createAttempt(
  exercise: Exercise,
  answer: string,
  repeat: boolean,
): LocalAttempt {
  const results = gradeSubmission([exercise], { [exercise.id]: answer });
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    exerciseId: exercise.id,
    revision: exercise.revision,
    skillId: exercise.skillId,
    misconceptionId:
      results[0].status === "correct" ? null : exercise.misconceptionId,
    repeat,
    results,
  };
}
export function localMetrics(
  attempts: LocalAttempt[],
): {
  skillId: string;
  title: string;
  slug: string;
  total: number;
  correct: number;
  independent: number;
}[] {
  const groups = new Map<string, LocalAttempt[]>();
  for (const attempt of attempts.filter(
    (attempt) => attempt.results[0].status !== "format_error",
  )) {
    const group = groups.get(attempt.skillId) ?? [];
    group.push(attempt);
    groups.set(attempt.skillId, group);
  }
  return [...groups].map(([skillId, group]) => ({
    skillId,
    title: group[0].results[0].topicTitle,
    slug: group[0].results[0].topicSlug,
    total: group.length,
    correct: group.filter((attempt) => attempt.results[0].status === "correct")
      .length,
    independent: new Set(group.map((attempt) => attempt.exerciseId)).size,
  }));
}
export function confidence(independent: number): string {
  return independent < 3
    ? "Данных пока недостаточно для вывода об освоении темы"
    : "Предварительная оценка по нескольким заданиям";
}
