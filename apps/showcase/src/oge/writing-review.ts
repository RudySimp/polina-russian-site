import type { PracticeSession, WritingAssignment } from "./model";
import { wordCount } from "./engine";
import { essayCriteria, summaryCriteria } from "./writing-rubric";

/** Content acceptance is a named human decision, separate from word count and marks. */
export function acceptedWritingWords(
  session: PracticeSession,
  writing: WritingAssignment,
): number {
  const promptId = session.selectedPrompts[writing.id] ?? writing.prompts[0].id;
  const review = session.writingReviews?.[writing.id + ":" + promptId];
  const count = wordCount(session.answers[writing.id] ?? "");
  const criteria = writing.line === 1 ? summaryCriteria : essayCriteria;
  if (
    count < 70 ||
    !review?.contentAccepted ||
    review.role !== "expert" ||
    !review.reviewer?.trim() ||
    review.promptId !== promptId ||
    !review.reviewedAt ||
    !Number.isFinite(Date.parse(review.reviewedAt)) ||
    Date.parse(review.reviewedAt) < Date.parse(session.startedAt) ||
    criteria.some(
      (criterion) =>
        !Number.isInteger(review.scores[criterion.code]) ||
        review.scores[criterion.code] < 0 ||
        review.scores[criterion.code] >= criterion.levels.length,
    )
  )
    return 0;
  return count;
}
export function literacyEligibility(session: PracticeSession) {
  const counts = session.items
    .flatMap((item) =>
      item.kind === "writing"
        ? [acceptedWritingWords(session, item.writing)]
        : [],
    )
    .filter((count) => count > 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const pair = [1, 13].every(
    (line) =>
      session.items.filter(
        (item) => item.kind === "writing" && item.writing.line === line,
      ).length <= 1,
  );
  return {
    total,
    acceptedCount: counts.length,
    eligible: pair && total >= 140,
  };
}
