import index from "./exercise-index.json" with { type: "json" };
import type { Exercise } from "./model.ts";
import { topics, sections, skills, sectionTitle } from "./topics.ts";
export { topics, sections, skills, sectionTitle };
export type { Topic, Exercise, Exam } from "./model.ts";
export type ExerciseSummary = Pick<
  Exercise,
  | "id"
  | "slug"
  | "revision"
  | "title"
  | "topicTitle"
  | "topicId"
  | "exam"
  | "skillId"
  | "skillIds"
  | "rulePaths"
  | "originCategory"
  | "subtopic"
  | "taskLine"
  | "format"
  | "level"
  | "sourceTextId"
> & {
  searchText?: string;
  provenanceMethod?: string;
  generationEligible?: boolean;
};
export const exerciseIndex = index as ExerciseSummary[];
export const publishedTopics = topics.filter(
  (topic) => topic.status === "published",
);
export const exerciseSummariesFor = (topicId: string, exam?: string) =>
  exerciseIndex.filter(
    (e) => e.topicId === topicId && (!exam || e.exam === exam),
  );
