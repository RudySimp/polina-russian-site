import type {
  PracticeSession,
  WritingAssignment,
  WritingReview,
  WordCountCorrection,
} from "./model";
import { wordCount } from "./word-count";
import {
  essayCriteria,
  summaryCriteria,
  literacyReviewId,
} from "./writing-rubric";

export function writingPromptId(
  session: PracticeSession,
  writing: WritingAssignment,
) {
  return session.selectedPrompts[writing.id] ?? writing.prompts[0].id;
}
export function currentWordCountCorrection(
  session: PracticeSession,
  writing: WritingAssignment,
  answer = session.answers[writing.id] ?? "",
): WordCountCorrection | undefined {
  const promptId = writingPromptId(session, writing);
  const correction =
    session.writingReviews?.[writing.id + ":" + promptId]?.wordCountCorrection;
  if (
    !correction ||
    correction.invalidatedAt ||
    correction.promptId !== promptId ||
    correction.writingRevision !== writing.revision ||
    correction.answerText !== answer ||
    !answer.trim() ||
    !Number.isInteger(correction.count) ||
    correction.count < 0 ||
    !correction.reason.trim() ||
    !correction.reviewer.trim() ||
    !Number.isFinite(Date.parse(correction.recordedAt)) ||
    Date.parse(correction.recordedAt) < Date.parse(session.startedAt)
  )
    return undefined;
  return correction;
}
export function writingWordCount(
  session: PracticeSession,
  writing: WritingAssignment,
  answer = session.answers[writing.id] ?? "",
) {
  return (
    currentWordCountCorrection(session, writing, answer)?.count ??
    wordCount(answer)
  );
}
/** New evaluations bind the exact answer. Legacy local sheets remain readable. */
export function reviewMatchesAnswer(
  session: PracticeSession,
  writing: WritingAssignment,
  review: WritingReview,
  answer = session.answers[writing.id] ?? "",
) {
  return (
    (!review.promptId ||
      review.promptId === writingPromptId(session, writing)) &&
    (review.writingRevision === undefined ||
      review.writingRevision === writing.revision) &&
    (review.answerText === undefined || review.answerText === answer) &&
    (review.reviewedWordCount === undefined
      ? !currentWordCountCorrection(session, writing, answer)
      : review.reviewedWordCount === writingWordCount(session, writing, answer))
  );
}
/** A change to the answer or theme invalidates all its old theme fixations. */
export function invalidateWritingReviews(
  session: PracticeSession,
  patch: Partial<PracticeSession>,
  changedAt: string,
): Partial<PracticeSession> {
  if (!patch.answers && !patch.selectedPrompts && !patch.writingReviews)
    return patch;
  const reviews = { ...(patch.writingReviews ?? session.writingReviews) };
  let changed = false;
  for (const item of session.items) {
    if (item.kind !== "writing") continue;
    const writing = item.writing;
    const beforePrompt = writingPromptId(session, writing);
    const afterPrompt = patch.selectedPrompts
      ? (patch.selectedPrompts[writing.id] ?? writing.prompts[0].id)
      : beforePrompt;
    const changedAnswer =
      patch.answers !== undefined &&
      (patch.answers[writing.id] ?? "") !== (session.answers[writing.id] ?? "");
    if (!changedAnswer && afterPrompt === beforePrompt) continue;
    for (const [key, review] of Object.entries(reviews)) {
      if (key !== writing.id && !key.startsWith(writing.id + ":")) continue;
      reviews[key] = {
        ...review,
        reviewedAt: undefined,
        ...(review.wordCountCorrection
          ? {
              wordCountCorrection: {
                ...review.wordCountCorrection,
                invalidatedAt: changedAt,
              },
            }
          : {}),
      };
    }
    changed = true;
  }
  const changedContentSheet =
    patch.writingReviews !== undefined &&
    Object.entries(patch.writingReviews).some(
      ([key, review]) =>
        key !== literacyReviewId && review !== session.writingReviews?.[key],
    );
  if ((changed || changedContentSheet) && reviews[literacyReviewId]) {
    reviews[literacyReviewId] = {
      ...reviews[literacyReviewId],
      reviewedAt: undefined,
    };
    changed = true;
  }
  return changed ? { ...patch, writingReviews: reviews } : patch;
}
/** Content acceptance is a named human decision, separate from word count and marks. */
export function acceptedWritingWords(
  session: PracticeSession,
  writing: WritingAssignment,
): number {
  const promptId = writingPromptId(session, writing);
  const review = session.writingReviews?.[writing.id + ":" + promptId];
  const count = writingWordCount(session, writing);
  const criteria = writing.line === 1 ? summaryCriteria : essayCriteria;
  if (
    count < 70 ||
    !review?.contentAccepted ||
    review.role !== "expert" ||
    !review.reviewer?.trim() ||
    review.promptId !== promptId ||
    !reviewMatchesAnswer(session, writing, review) ||
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
