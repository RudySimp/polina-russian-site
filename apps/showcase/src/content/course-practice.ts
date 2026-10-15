import type { ExerciseSummary } from "./catalog";
export function chooseCoursePractice(
  candidates: ExerciseSummary[],
  stored: unknown,
) {
  const seen = new Map<string, { count: number; last: number }>();
  if (Array.isArray(stored))
    for (const item of stored.slice(-1000)) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.exerciseId !== "string" ||
        !Number.isFinite(Date.parse(item.createdAt)) ||
        !Array.isArray(item.results) ||
        item.results.length !== 1 ||
        !["correct", "incorrect"].includes(item.results[0]?.status)
      )
        continue;
      const candidate = candidates.find(
        (e) => e.id === item.exerciseId && e.revision === item.revision,
      );
      if (!candidate) continue;
      const previous = seen.get(candidate.id) ?? { count: 0, last: 0 };
      seen.set(candidate.id, {
        count: previous.count + 1,
        last: Math.max(previous.last, Date.parse(item.createdAt)),
      });
    }
  const exercise = [...candidates].sort(
    (a, b) =>
      (seen.get(a.id)?.count ?? 0) - (seen.get(b.id)?.count ?? 0) ||
      (seen.get(a.id)?.last ?? 0) - (seen.get(b.id)?.last ?? 0) ||
      a.id.localeCompare(b.id),
  )[0];
  return { exercise, fresh: !!exercise && !seen.has(exercise.id) };
}
export function storedCourseAttempts(): unknown {
  try {
    const raw = localStorage.getItem("polina-showcase-attempts-v1");
    return raw && raw.length < 3000000 ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function courseReadingCount(
  module: {
    sourceLessonId?: string;
    sourceLessonRevision?: number;
    sectionIds: string[];
  },
  storage: Pick<Storage, "getItem">,
) {
  try {
    const raw = storage.getItem(
      "polina-lesson-state-v2:" +
        module.sourceLessonId +
        "@" +
        module.sourceLessonRevision +
        ":reading",
    );
    const value = raw && raw.length < 100000 ? JSON.parse(raw) : null;
    if (
      !value ||
      !Array.isArray(value.read) ||
      value.read.some((id: unknown) => typeof id !== "string")
    )
      return 0;
    return module.sectionIds.filter((id) => value.read.includes(id)).length;
  } catch {
    return 0;
  }
}
