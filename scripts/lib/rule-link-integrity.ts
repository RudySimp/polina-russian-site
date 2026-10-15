import type { Exercise, Lesson, Topic } from "../../apps/showcase/src/content/model";
import { generalRulePath } from "../../apps/showcase/src/oge/rule-feedback";
export function rulePathIssue(path: string, library: Lesson[], topics: Topic[]): string | null {
  let url: URL;
  try {url = new URL(path, "https://local.invalid");} catch {return "неверный адрес правила";}
  const match = /^\/theory\/([a-z0-9-]+)\/$/u.exec(url.pathname);
  if (!path.startsWith("/theory/") || url.origin !== "https://local.invalid" || !match) return "неверный маршрут правила";
  const topic = topics.find((item) => item.slug === match[1]);
  const lesson = library.find((item) => item.topicId === topic?.id);
  if (!lesson) return "урок правила не найден";
  const anchor = url.hash.slice(1);
  if (!anchor || !lesson.sections.some((section) => section.id === anchor)) return "раздел правила не найден: " + (anchor || "пустой якорь");
  return null;
}
export function exerciseRuleLinkIssues(exercise: Exercise, library: Lesson[], topics: Topic[]): string[] {
  const paths = [...(exercise.rulePaths ?? []), ...(exercise.elements ?? []).map((item) => item.rulePath), ...(exercise.ruleElements ?? []).map((item) => item.rulePath), ...(exercise.exam === "OGE" && exercise.taskLine ? [generalRulePath(exercise)] : [])];
  return [...new Set(paths)].flatMap((path) => {const issue = rulePathIssue(path, library, topics); return issue ? [path + ": " + issue] : [];});
}
