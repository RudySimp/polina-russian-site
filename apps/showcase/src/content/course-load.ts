import { courseModuleLoaders } from "./course-loaders";
import { courseModules } from "./course";
import { lessonFor } from "./lesson-load";
import type { CourseContent } from "./course-model";
const loaded = new Map<string, Promise<CourseContent>>();
export function courseModuleFor(id: string): Promise<CourseContent> {
  const existing = loaded.get(id);
  if (existing) return existing;
  const descriptor = courseModules.find((m) => m.id === id);
  const loader = courseModuleLoaders[id];
  const pending =
    descriptor && loader
      ? loader().then(async (payload) => ({
          ...payload,
          lesson:
            descriptor.kind === "chapter-sections"
              ? await lessonFor(descriptor.topicId)
              : payload.lesson!,
        }))
      : Promise.reject(new Error("Учебный модуль не найден."));
  // React.use must see the same fulfilled or rejected thenable until explicit reload.
  loaded.set(id, pending);
  return pending;
}
export function resetCourseLoads() {
  loaded.clear();
}
