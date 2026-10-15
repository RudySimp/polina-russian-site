import index from "./course-index.json" with { type: "json" };
import type { CourseModuleDescriptor } from "./course-model.ts";
export const courseModules = index as CourseModuleDescriptor[];
export const modulePath = (id: string) => "/oge/theory/modules/" + id + "/";
export const courseModulesFor = (topicId: string) =>
  courseModules.filter((m) => m.topicId === topicId);
