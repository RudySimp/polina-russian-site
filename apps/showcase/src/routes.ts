import { courseModules, modulePath } from "./content/course.ts";
import {
  exerciseIndex as exercises,
  publishedTopics,
} from "./content/catalog.ts";
export const routes = [
  "/",
  "/oge/",
  "/oge/theory/",
  ...courseModules.map((m) => modulePath(m.id)),
  "/oge/bank/",
  "/oge/variants/",
  "/oge/generator/",
  "/oge/games/",
  "/oge/practice/session/",
  "/oge/results/",
  ...Array.from({ length: 13 }, (_, n) => `/oge/bank/${n + 1}/`),
  ...Array.from({ length: 5 }, (_, n) => `/oge/variants/${n + 1}/`),
  ...[
    "foundation",
    "punctuation",
    "correction",
    "phrase",
    "matching",
    "spelling",
    "compression",
  ].map((id) => `/oge/games/${id}/`),
  "/ege/",
  "/theory/",
  "/practice/",
  "/progress/",
  "/sources/",
  "/about/",
  "/practice/ege-punctuation/",
  "/practice/ege-stress/",
  "/practice/oge-syntax/",
  ...publishedTopics.map((topic) => `/theory/${topic.slug}/`),
  ...exercises.map((exercise) => `/practice/${exercise.slug}/`),
];
export const basePath = "/polina-russian-site";
export const href = (path: string) => `${basePath}${path}`;
export function currentPath(pathname: string): string {
  const path = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length)
    : pathname;
  return path.endsWith("/") ? path : `${path}/`;
}
