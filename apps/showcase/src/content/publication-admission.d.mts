import type { Exercise } from "./model";
export type AdmissionMode = "legacy-editorial" | "revision-reviewed" | "method-approved";
export function publicationAdmission(exercise: Pick<Exercise, "id" | "revision" | "publicationReview" | "provenance">): AdmissionMode | null;
export function admissionPayload(exercise: Exercise): string;
