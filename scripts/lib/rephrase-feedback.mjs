import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const normalize = (value) =>
  value.trim().toLocaleLowerCase("ru").replace(/ё/gu, "е");
export function rephraseFeedbackMetadata(exercise, entry) {
  assert.equal(
    exercise.taskLine,
    9,
    exercise.id + ": explicit rephrase metadata requires line 9",
  );
  assert.equal(
    exercise.revision,
    entry.revision,
    exercise.id + ": recheck feedback after a revision change",
  );
  assert.equal(
    createHash("sha256").update(exercise.prompt).digest("hex"),
    entry.promptSha256,
    exercise.id + ": recheck feedback after a condition change",
  );
  assert(
    exercise.prompt.includes("«" + entry.sourcePhrase + "»"),
    exercise.id + ": original phrase is absent",
  );
  assert.equal(exercise.id, entry.id, exercise.id + ": feedback ID mismatch");
  const genitive = {
    согласование: "согласования",
    управление: "управления",
    примыкание: "примыкания",
  };
  assert(
    exercise.prompt.includes(
      "построенное на основе " + genitive[entry.fromRelation],
    ),
    exercise.id + ": source relation does not match the condition",
  );
  assert(
    exercise.prompt.includes("со связью " + entry.toRelation + "."),
    exercise.id + ": requested relation does not match the condition",
  );
  const head = normalize(entry.headWord);
  assert(
    normalize(entry.sourcePhrase).split(/\s+/u).includes(head),
    exercise.id + ": head word missing from source phrase",
  );
  for (const answer of exercise.answers) {
    assert(
      normalize(answer).split(/\s+/u).includes(head),
      exercise.id + ": approved answer loses the head word",
    );
    assert.notEqual(
      normalize(answer).replace(/\s/gu, ""),
      normalize(entry.sourcePhrase).replace(/\s/gu, ""),
      exercise.id + ": unchanged phrase must not be an accepted answer",
    );
  }
  assert.notEqual(
    entry.fromRelation,
    entry.toRelation,
    exercise.id + ": transformation must change the relation",
  );
  return {
    requiredWords: [entry.headWord],
    unchangedPhrase: entry.sourcePhrase,
    transformation: { from: entry.fromRelation, to: entry.toRelation },
  };
}
