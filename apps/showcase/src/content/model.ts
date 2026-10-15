import type { Snapshot } from "../../../../src/lib/grading";

export type Exam = "OGE" | "EGE";
export type Level = "basic" | "standard" | "advanced";
export type Section = { id: string; title: string; order: number };
export type Topic = {
  id: string;
  slug: string;
  title: string;
  sectionId: string;
  description: string;
  keywords: string[];
  examTags: Exam[];
  skillIds: string[];
  status: "planned" | "published";
  order: number;
};
export type Provenance = {
  sourceId: string;
  filename?: string;
  sourceNumber?: number;
  paragraph?: number;
  pages?: number[];
  sourceSha256?: string;
  pageReferences?: { pdfPage: number; printedPage?: number; section: string }[];
  importedAt?: string;
  method:
    | "project-original"
    | "local-original-import"
    | "original-explanation-from-reference";
  rightsBasis: string;
  reviewNote: string;
  reviewedAt: string;
  teacherApproval: "pending";
};
export type Interactive = {
  kind:
    | "punctuation"
    | "foundation"
    | "spelling"
    | "stress"
    | "mistake"
    | "comparison";
  title: string;
  instruction: string;
  examples: {
    label: string;
    text: string;
    tokens?: string[];
    expected: number[];
    options?: string[];
    explanation: string;
    optionExplanations?: string[];
    subject?: string;
    predicate?: string;
  }[];
};
export type LessonBlock =
  | {
      type: "paragraph" | "rule" | "warning" | "summary";
      title?: string;
      text: string;
    }
  | {
      type: "example";
      title: string;
      text: string;
      steps: string[];
      counterexample?: string;
    }
  | {
      type: "comparison";
      title: string;
      items: { text: string; explanation: string }[];
    }
  | { type: "steps"; title: string; items: string[] }
  | { type: "table"; title: string; headers: string[]; rows: string[][] }
  | { type: "interactive"; data: Interactive }
  | {
      type: "checkpoint";
      title: string;
      question: string;
      options: string[];
      answer: number;
      explanation: string;
    };
export type Lesson = {
  id: string;
  topicId: string;
  revision: number;
  objectives: string[];
  sections: { id: string; title: string; blocks: LessonBlock[] }[];
  provenance: Provenance[];
  relatedTopicIds: string[];
};
export type Exercise = Snapshot & {
  skillIds?: string[];
  elements?: {
    position: number;
    skillIds: string[];
    rulePath: string;
    errorType: string;
  }[];
  /** Rule index is zero-based (А=0); position is the correct sentence number. */
  ruleElements?: {
    ruleIndex: number;
    position: number;
    skillIds: string[];
    rulePath: string;
    errorType: string;
  }[];
  shortAnswerConstraints?: { requiredWords: string[] };
  rulePaths?: string[];
  originCategory?: "official" | "author-model" | "learning";
  publicationReview?: {
    revision: number;
    by: string;
    at: string;
    mode: "checked-demo" | "method-approved";
    condition: boolean;
    key: boolean;
    alternatives: boolean;
    explanation: boolean;
    rights: boolean;
  };
  sourceTextId?: string;
  reviewStages?: {
    stage: import("../oge/model").ReviewStage;
    at: string;
    by: string;
  }[];
  subtopic?: string;
  slug: string;
  skillId: string;
  misconceptionId: string;
  instruction: string;
  options: string[];
  optionExplanations: string[];
  steps: string[];
  hint: string;
  formatLabel: string;
  input:
    | "digits"
    | "text"
    | "single"
    | "multiple"
    | "words"
    | "matching"
    | "punctuation";
  text?: string;
  rules?: string[];
  level: Level;
  taskLine?: number;
  format: "exam-model" | "learning";
  examModel: {
    year: number;
    status: "approved" | "project";
    sourceUrl: string;
  };
  provenance: Provenance;
  reviewStatus: "checked-demo";
};
