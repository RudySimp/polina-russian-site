import { exerciseIndex as exercises, type ExerciseSummary } from "../content/catalog";
import type { LocalAttempt } from "../progress";
export function nextExercise(
  current: ExerciseSummary,
  attempts: LocalAttempt[],
  bank = exercises,
): ExerciseSummary | undefined {
  const byId = new Map(bank.map((item) => [item.id, item]));
  const used = new Set(
    attempts
      .filter((attempt) => attempt.skillId === current.skillId && byId.get(attempt.exerciseId)?.revision === attempt.revision)
      .map((attempt) => attempt.exerciseId),
  );
  used.add(current.id);
  return bank.find(
    (exercise) =>
      exercise.exam === current.exam &&
      exercise.skillId === current.skillId &&
      !used.has(exercise.id),
  );
}
export function recommendations(
  attempts: LocalAttempt[],
  exam: string,
  bank = exercises,
): ExerciseSummary[] {
  const byId = new Map(bank.map((item) => [item.id, item]));
  const lastByExercise = new Map<string, LocalAttempt>();
  for (const attempt of attempts) {
    const exercise = byId.get(attempt.exerciseId);
    if (
      exercise?.exam === exam && exercise.revision === attempt.revision &&
      attempt.results[0]?.status !== "format_error"
    )
      lastByExercise.set(exercise.id, attempt);
  }
  const errors = [...lastByExercise.values()].filter(
    (attempt) => attempt.results[0]?.status === "incorrect",
  );
  const counts = new Map<string, number>();
  for (const attempt of errors)
    counts.set(attempt.skillId, (counts.get(attempt.skillId) ?? 0) + 1);
  const seen = new Set(lastByExercise.keys());
  const result: ExerciseSummary[] = [];
  for (const [skillId] of [...counts].sort((a, b) => b[1] - a[1])) {
    const item = bank.find(
      (item) =>
        item.exam === exam && item.skillId === skillId && !seen.has(item.id),
    );
    if (item) result.push(item);
  }
  return result;
}
