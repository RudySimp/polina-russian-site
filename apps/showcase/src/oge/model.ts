import type { Exercise } from "../content/model";

export type ReviewStage =
  | "extracted"
  | "needs-review"
  | "answer-checked"
  | "explanation-checked"
  | "method-approved"
  | "publication-approved";
export type ExamTaskLine = {
  number: number;
  title: string;
  topicIds: string[];
  response: "digits_sequence" | "short_text" | "extended";
  input: "digits" | "text" | "matching" | "writing";
  orderMatters: boolean;
  maxScore: number;
  minLength: number;
  maxLength: number;
  textGroup?: "syntax" | "reading";
};
export type ExamSpecification = {
  id: string;
  exam: "OGE";
  year: number;
  status: "project" | "approved";
  checkedAt: string;
  durationMinutes: number;
  sourceUrl: string;
  lines: ExamTaskLine[];
  writing: {
    minWords: number;
    summaryMax: number;
    essayMax: number;
    literacyMax: number;
    audioPlays: number;
    pauseMinutes: number;
  };
};
export type SourceText = {
  id: string;
  revision: number;
  title: string;
  paragraphs: string[];
  kind: "syntax" | "reading" | "summary";
  authorship: string;
  rightsBasis: string;
  reviewNote: string;
};
export type ExerciseRef = { id: string; revision: number };
export type AudioMaterial = {
  id: string;
  revision: number;
  textId: string;
  path: string;
  durationSeconds: number;
  kind: "original-synthesized";
  attribution: string;
  transcript: string;
};
export type WritingAssignment = {
  id: string;
  revision: number;
  line: 1 | 13;
  title: string;
  sourceTextId: string;
  audioId?: string;
  prompts: { id: string; label: string; text: string }[];
  checklist: string[];
  microtopics?: string[];
  analysis: string;
};
export type ExamVariant = {
  id: string;
  number: number;
  revision: number;
  specificationId: string;
  title: string;
  kind: "full" | "test";
  assignments: ExerciseRef[];
  sourceTextIds: string[];
  writingIds: string[];
  status: "published";
  reviewStage: "publication-approved";
  teacherApproval: "pending";
  seed?: string;
};
export type WorkKind =
  | "fixed-full"
  | "fixed-test"
  | "generated-full"
  | "generated-test"
  | "practice";
export type WorkItem =
  | { kind: "exercise"; exercise: Exercise }
  | { kind: "writing"; writing: WritingAssignment };
export type PracticeSession = {
  schemaVersion: 1;
  catalogVersion?: string;
  generationVersion?: 1 | 2;
  id: string;
  title: string;
  kind: WorkKind;
  mode: "learn" | "control";
  specificationId: string;
  seed: string;
  items: WorkItem[];
  texts: SourceText[];
  audio: AudioMaterial[];
  answers: Record<string, string>;
  checkedIds: string[];
  selectedPrompts: Record<string, string>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  durationMinutes?: number;
  activeIndex: number;
  audioPlays: Record<string, number>;
  audioLastEndedAt: Record<string, string>;
  audioCompletedPlays: Record<string, number>;
  audioPositions: Record<string, number>;
  originVariantId?: string;
  writingReviews?: Record<string, WritingReview>;
  endedByTimeout?: boolean;
};
export type WritingReview = {
  contentAccepted?: boolean;
  checks: number[];
  note: string;
  role: "self" | "expert";
  scores: Record<string, number>;
  reviewer?: string;
  reviewedAt?: string;
  promptId?: string;
};
export type GeneratedVariant = PracticeSession & {
  kind: "generated-full" | "generated-test";
};
export type InteractiveActivity = {
  id: string;
  title: string;
  description: string;
  topicId: string;
  skillId: string;
  kind:
    | "foundation"
    | "punctuation"
    | "correction"
    | "phrase"
    | "matching"
    | "spelling"
    | "compression";
  situations: ActivitySituation[];
};
export type ActivitySituation = {
  id: string;
  revision?: number;
  skillIds?: string[];
  hint?: string;
  title: string;
  instruction: string;
  text: string;
  tokens?: string[];
  fields: {
    id: string;
    label: string;
    options?: string[];
    expected: string[];
    explanation?: string;
  }[];
  explanation: string;
  details: string[];
};
