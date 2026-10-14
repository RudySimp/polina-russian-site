import { lessonLoaders } from "./lesson-loaders";
import type { Lesson } from "./model";

const loaded = new Map<string, Promise<Lesson>>();

export function lessonFor(topicId: string): Promise<Lesson> {
  const existing = loaded.get(topicId);
  if (existing) return existing;
  const loader = lessonLoaders[topicId];
  // Retain rejected thenables until an explicit reset or a full-page reload.
  const pending = loader
    ? loader()
    : Promise.reject(new Error("Учебный раздел не найден."));
  loaded.set(topicId, pending);
  return pending;
}

export function resetLessonLoads() {
  loaded.clear();
}
