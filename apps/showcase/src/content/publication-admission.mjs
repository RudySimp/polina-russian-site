import legacy from "./legacy-admission.json" with { type: "json" };
const revisions = new Map(legacy.map((entry) => [entry.id, entry.revision]));
export function publicationAdmission(exercise) {
  const review = exercise.publicationReview;
  if (!review)
    return revisions.get(exercise.id) === exercise.revision
      ? "legacy-editorial"
      : null;
  if (
    review.revision !== exercise.revision ||
    !review.by?.trim() ||
    !Number.isFinite(Date.parse(review.at)) ||
    !["checked-demo", "method-approved"].includes(review.mode) ||
    ![
      review.condition,
      review.key,
      review.alternatives,
      review.explanation,
      review.rights,
    ].every((value) => value === true)
  )
    return null;
  if (
    review.mode === "method-approved" &&
    exercise.provenance?.teacherApproval !== "approved"
  )
    return null;
  return review.mode === "method-approved"
    ? "method-approved"
    : "revision-reviewed";
}
export function admissionPayload(exercise) {
  return JSON.stringify(
    Object.fromEntries(
      [
        "id",
        "revision",
        "prompt",
        "text",
        "rules",
        "options",
        "answers",
        "policy",
        "explanation",
        "optionExplanations",
        "steps",
        "instruction",
        "sourceTextId",
        "source",
        "provenance",
      ]
        .filter((key) => exercise[key] !== undefined)
        .map((key) => [key, exercise[key]]),
    ),
  );
}
