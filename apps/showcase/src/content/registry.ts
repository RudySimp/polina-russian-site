import { exerciseData, lessonLoaders } from "./generated.ts";
import { topics, sections, skills, sectionTitle } from "./topics.ts";
import type { Exercise, Lesson } from "./model.ts";
export { topics, sections, skills, sectionTitle };
export type {
  Exercise,
  Lesson,
  Topic,
  Exam,
  Interactive,
  LessonBlock,
} from "./model.ts";
export const exercises = (exerciseData as Exercise[]).sort((a, b) => {
  const retained = (id: string) =>
    /^(oge-syntax|ege-stress|ege-punctuation)-[12]$/.test(id);
  return (
    Number(retained(b.id)) - Number(retained(a.id)) ||
    a.id.localeCompare(b.id, "en")
  );
});

export const publishedTopics = topics.filter(
  (topic) => topic.status === "published",
);
export const exercisesFor = (topicId: string, exam?: string) =>
  exercises.filter(
    (exercise) =>
      exercise.topicId === topicId && (!exam || exercise.exam === exam),
  );
const loaded = new Map<string, Promise<Lesson>>();
export function lessonFor(topicId: string): Promise<Lesson> {
  if (!loaded.has(topicId)) loaded.set(topicId, lessonLoaders[topicId]());
  return loaded.get(topicId)!;
}
