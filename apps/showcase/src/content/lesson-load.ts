import { lessonLoaders } from "./lesson-loaders";
import type { Lesson } from "./model";

const loaded = new Map<string, Promise<Lesson>>();

export function lessonFor(topicId: string): Promise<Lesson> {
  const existing = loaded.get(topicId);
  if (existing) return existing;
  const loader = lessonLoaders[topicId];
  if (!loader) return Promise.reject(new Error("Учебный раздел не найден."));
  const pending = loader().catch((error: unknown) => {
    loaded.delete(topicId);
    throw error;
  });
  loaded.set(topicId, pending);
  return pending;
}

export function resetLessonLoads() {
  loaded.clear();
}
