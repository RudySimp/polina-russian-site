import { exercises, publishedTopics } from "./content/registry.ts";
export const routes = [
  "/",
  "/oge/",
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
