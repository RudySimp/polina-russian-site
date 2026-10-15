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
