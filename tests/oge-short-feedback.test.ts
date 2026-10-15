import feedbackEntries from "../content/oge-rephrase-feedback.json";
import { rephraseFeedbackMetadata } from "../scripts/lib/rephrase-feedback.mjs";
import { describe, it, expect } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import { shortAnswerFeedback } from "../apps/showcase/src/oge/rule-feedback";
import { gradeExercise } from "../apps/showcase/src/oge/engine";
const exercise = {
  ...exercises.find((e) => e.taskLine === 9)!,
  answers: ["кожаные перчатки", "перчатки кожаные"],
  shortAnswerConstraints: { requiredWords: ["перчатки"] },
};
describe("P1-11 explicit short-answer constraints", () => {
  it("names a literal missing main word without guessing a grammatical cause", () => {
    expect(shortAnswerFeedback(exercise, "кожаные рукавицы")).toContain(
      "главное слово «перчатки»",
    );
    expect(shortAnswerFeedback(exercise, "перчатки кожаный")).toBeUndefined();
  });
  it("accepts approved order and spacing without creating a literal-word diagnosis", () => {
    expect(gradeExercise("перчаткикожаные", exercise).status).toBe("correct");
    expect(shortAnswerFeedback(exercise, "перчаткикожаные")).toBeUndefined();
    expect(gradeExercise("перчатки кожаные", exercise).status).toBe("correct");
  });
  it("leaves historical and unannotated answers general", () => {
    expect(
      shortAnswerFeedback(
        { ...exercise, shortAnswerConstraints: undefined },
        "ошибочный ответ",
      ),
    ).toBeUndefined();
    expect(
      shortAnswerFeedback({ ...exercise, taskLine: 8 }, "ошибочный ответ"),
    ).toBeUndefined();
  });
});

describe("Reviewed phrase metadata stays bound to the exact condition", () => {
  it("recognizes an unchanged original, including official compact input, for every annotated condition", () => {
    for (const entry of feedbackEntries.entries) {
      const item = exercises.find((e) => e.id === entry.id)!;
      expect(gradeExercise(entry.sourcePhrase, item).status, entry.id).toBe(
        "incorrect",
      );
      expect(shortAnswerFeedback(item, entry.sourcePhrase), entry.id).toContain(
        "без преобразования",
      );
      expect(
        shortAnswerFeedback(item, entry.sourcePhrase.replaceAll(" ", "")),
        entry.id,
      ).toContain("без преобразования");
      for (const answer of item.answers) {
        expect(gradeExercise(answer, item).status, entry.id).toBe("correct");
        expect(shortAnswerFeedback(item, answer), entry.id).toBeUndefined();
      }
    }
  });
  it("guards condition and revision drift before attaching a literal diagnosis", () => {
    const entry = feedbackEntries.entries[0];
    const item = exercises.find((e) => e.id === entry.id)!;
    expect(() =>
      rephraseFeedbackMetadata(item, {
        ...entry,
        fromRelation: entry.toRelation,
      }),
    ).toThrow("source relation");
    expect(() =>
      rephraseFeedbackMetadata(item, {
        ...entry,
        toRelation: entry.fromRelation,
      }),
    ).toThrow("requested relation");
    expect(() =>
      rephraseFeedbackMetadata({ ...item, revision: item.revision + 1 }, entry),
    ).toThrow("revision");
    expect(() =>
      rephraseFeedbackMetadata(
        { ...item, prompt: item.prompt + " changed" },
        entry,
      ),
    ).toThrow("condition");
    expect(() =>
      rephraseFeedbackMetadata({ ...item, answers: ["другое слово"] }, entry),
    ).toThrow("head word");
  });
  it("moves a prepositional group together, rejecting the previously accepted reversed phrase", () => {
    const item = exercises.find((e) => e.id === "oge-slovosochetaniya-019")!;
    expect(item.revision).toBe(2);
    for (const answer of [
      "крепость из снега",
      "из снега крепость",
      "изснегакрепость",
    ])
      expect(gradeExercise(answer, item).status).toBe("correct");
    for (const answer of [
      "снега из крепость",
      "снегаизкрепость",
      "крепость в снегу",
    ])
      expect(gradeExercise(answer, item).status).toBe("incorrect");
    expect(item.publicationReview?.revision).toBe(2);
  });
});
