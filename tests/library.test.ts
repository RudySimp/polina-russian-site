import { lessons } from "../apps/showcase/src/content/library";
import { describe, expect, it } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import { validateContent } from "../scripts/validate-content";
import { matchesSearch } from "../apps/showcase/src/lib/search";
import {
  nextExercise,
  recommendations,
} from "../apps/showcase/src/lib/recommendations";
import {
  createAttempt,
  localMetrics,
  readAttempts,
} from "../apps/showcase/src/progress";

describe("Целостность библиотеки и поиск", () => {
  it("проверяет весь опубликованный банк вместе с уроками", () => {
    expect(validateContent()).toMatchObject({
      lessons: 8,
      topics: 8,
      exercises: 80,
      imported: 48,
    });
  });
  it("не допускает повторяющиеся маршруты заданий и неверный экзамен навыка", () => {
    const duplicate = structuredClone(exercises);
    duplicate[1].slug = duplicate[0].slug;
    expect(() => validateContent(duplicate)).toThrow("повторяющиеся");
    const crossExam = structuredClone(exercises);
    crossExam[0].skillId = "OGE:syntax.foundation";
    expect(() => validateContent(crossExam)).toThrow("другому экзамену");
  });
  it("отклоняет ключ вне вариантов и ударение на согласной", () => {
    const wrongKey = structuredClone(exercises);
    wrongKey[0].answers = ["9"];
    expect(() => validateContent(wrongKey)).toThrow("номер ответа отсутствует");
    const wrongStress = structuredClone(lessons);
    const block = wrongStress
      .flatMap((l) => l.sections)
      .flatMap((s) => s.blocks)
      .find((b) => b.type === "interactive" && b.data.kind === "stress");
    if (block?.type !== "interactive")
      throw new Error("Нет орфоэпического интерактива");
    block.data.examples[0].expected = [1];
    expect(() => validateContent(exercises, wrongStress)).toThrow(
      "не на гласной",
    );
  });
  it("ищет короткое НЕ как слово, поддерживает ё/е и несколько слов", () => {
    expect(matchesSearch("не", ["НЕ с прилагательными"])).toBe(true);
    expect(matchesSearch("не", ["Непроверяемые гласные"])).toBe(false);
    expect(matchesSearch("прием слов", ["Приёмы анализа словосочетания"])).toBe(
      true,
    );
    expect(matchesSearch("основа пунктуация", ["Грамматическая основа"])).toBe(
      false,
    );
  });
});

describe("Повторение по банку и независимые результаты", () => {
  const first = exercises.find((e) => e.id === "ege-punctuation-1")!;
  it("проходит весь навык без повторения и честно завершает подборку", () => {
    let current = first;
    const attempts = [];
    const visited = new Set<string>();
    for (;;) {
      expect(visited.has(current.id)).toBe(false);
      expect(current.exam).toBe("EGE");
      expect(current.skillId).toBe(first.skillId);
      visited.add(current.id);
      attempts.push(
        createAttempt(current, current.answers[0], visited.size > 1),
      );
      const next = nextExercise(current, attempts);
      if (!next) break;
      current = next;
    }
    expect(visited.size).toBe(10);
    expect(nextExercise(current, attempts)).toBeUndefined();
  });
  it("не рекомендует другой экзамен, использованное задание или уже исправленную ошибку", () => {
    const oge = exercises.find((e) => e.exam === "OGE")!;
    const attempts = [
      createAttempt(first, "2", false),
      createAttempt(oge, "9", false),
    ];
    const ege = recommendations(attempts, "EGE");
    expect(ege).toHaveLength(1);
    expect(ege[0].skillId).toBe(first.skillId);
    expect(ege[0].exam).toBe("EGE");
    expect(ege[0].id).not.toBe(first.id);
    expect(
      recommendations([...attempts, createAttempt(first, "13", true)], "EGE"),
    ).toEqual([]);
  });
  it("сохраняет старую историю и считает повторы отдельно от разных заданий", () => {
    const old = {
      ...createAttempt(first, "2", false),
      skillId: "punctuation.homogeneous",
    };
    const attempts = readAttempts({
      getItem: () => JSON.stringify([old, createAttempt(first, "13", true)]),
    });
    expect(attempts[0].skillId).toBe(first.skillId);
    expect(localMetrics(attempts)[0]).toMatchObject({
      total: 2,
      correct: 1,
      independent: 1,
    });
  });
  it("не принимает неизвестные ревизии и форматные ошибки из подменённой истории", () => {
    const attempt = createAttempt(first, "2", false);
    const raw = [
      { ...attempt, revision: 999 },
      { ...attempt, results: [{ ...attempt.results[0], answer: "1,3" }] },
    ];
    expect(readAttempts({ getItem: () => JSON.stringify(raw) })).toEqual([]);
  });
});
