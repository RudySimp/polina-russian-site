import { describe, expect, it } from "vitest";
import {
  defaultPolicy,
  gradeAnswer,
  gradeSubmission,
  normalize,
  recommendedExercises,
  topicMetrics,
} from "../src/lib/grading";
import { exercises } from "../apps/showcase/src/content";
describe("Проверка кратких ответов", () => {
  const punctuation = exercises[0];
  it("принимает допустимый порядок цифр и отклоняет неверный ответ", () => {
    expect(gradeAnswer("31", punctuation).status).toBe("correct");
    expect(gradeAnswer("2", punctuation).status).toBe("incorrect");
  });
  it("не превращает ошибку формата в верный ответ", () => {
    for (const answer of ["", "113", "1,3", "1 3", "0", "а", "１３"])
      expect(gradeAnswer(answer, punctuation).status).toBe("format_error");
  });
  it("сохраняет пробел внутри словесного ответа", () => {
    const item = {
      responseKind: "short_text" as const,
      answers: ["не высокий"],
      policy: defaultPolicy,
      maxScore: 1,
    };
    expect(gradeAnswer(" НЕ   ВЫСОКИЙ ", item).status).toBe("correct");
    expect(gradeAnswer("невысокий", item).status).toBe("incorrect");
  });
  it("не подменяет ё и регистр без явного разрешения", () => {
    const item = {
      responseKind: "short_text" as const,
      answers: ["не лёгкий"],
      policy: defaultPolicy,
      maxScore: 1,
    };
    expect(gradeAnswer("не легкий", item).status).toBe("incorrect");
    expect(
      gradeAnswer("не легкий", {
        ...item,
        policy: { ...defaultPolicy, allowYoAsE: true },
      }).status,
    ).toBe("correct");
    expect(
      normalize("звонИт", "short_text", {
        ...defaultPolicy,
        caseSensitive: true,
      }),
    ).toBe("звонИт");
  });
  it("учитывает порядок и несколько допустимых ответов", () => {
    expect(
      gradeAnswer("31", {
        ...punctuation,
        policy: { ...punctuation.policy, orderMatters: true },
      }).status,
    ).toBe("incorrect");
    expect(
      gradeAnswer("24", { ...punctuation, answers: ["13", "24"] }).status,
    ).toBe("correct");
  });
  it("включает ответ, ожидаемый результат, объяснение и точную тему", () => {
    const [result] = gradeSubmission([punctuation], { [punctuation.id]: "2" });
    expect(result).toMatchObject({
      status: "incorrect",
      answer: "2",
      expected: ["13"],
      topicSlug: "odnorodnye",
      score: 0,
    });
    expect(result.explanation).toContain("Одна запятая");
  });
  it("все эталоны демобанка проходят собственную политику", () => {
    for (const item of exercises)
      for (const answer of item.answers)
        expect(gradeAnswer(answer, item).status).toBe("correct");
  });
});
describe("Повторение и прогресс", () => {
  const item = exercises[0];
  const attempt = (answer: string) => ({
    results: gradeSubmission([item], { [item.id]: answer }),
  });
  it("не делает вывода об освоении по одной попытке", () => {
    expect(topicMetrics([attempt("2")])[0]).toMatchObject({
      total: 1,
      errors: 1,
      priority: 0,
    });
  });
  it("успешное повторение уменьшает приоритет, сохраняя ошибку", () => {
    const before = topicMetrics([attempt("2"), attempt("2")])[0];
    const after = topicMetrics([attempt("2"), attempt("2"), attempt("13")])[0];
    expect(after.priority).toBeLessThan(before.priority);
    expect(after.errors).toBe(2);
    expect(after.correct).toBe(1);
  });
  it("предлагает другую задачу той же темы", () => {
    const suggested = recommendedExercises(exercises, [
      attempt("2"),
      attempt("13"),
    ]);
    expect(suggested[0].topicId).toBe(item.topicId);
    expect(suggested[0].id).not.toBe(item.id);
  });
});
