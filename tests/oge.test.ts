import { describe, expect, it } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import data from "../apps/showcase/src/oge/materials.json" with { type: "json" };
import games from "../apps/showcase/src/oge/activities.json" with { type: "json" };
import type {
  ExamVariant,
  InteractiveActivity,
} from "../apps/showcase/src/oge/model";
import {
  createSession,
  generateVariant,
  gradeExercise,
  itemId,
  remainingSeconds,
  resultsFor,
  selectPractice,
  sessionFromVariant,
  validateVariant,
  wordCount,
  type Materials,
} from "../apps/showcase/src/oge/engine";
import {
  advanceSession,
  listSessions,
  parseSession,
  readSession,
  saveSession,
} from "../apps/showcase/src/oge/storage";
import { checkActivity } from "../apps/showcase/src/oge/GamePages";
const materials = { ...data, exercises } as unknown as Materials;
const variants = data.variants as ExamVariant[];
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    key: (n: number) => [...values.keys()][n] ?? null,
    get length() {
      return values.size;
    },
  };
}
describe("Экзаменационные линии и согласованные варианты ОГЭ", () => {
  it("учитывает порядок АБВ в №4, набор цифр в №5 и формат русского слова", () => {
    const matching = exercises.find((e) => e.taskLine === 4)!,
      punctuation = exercises.find((e) => e.taskLine === 5)!,
      word = exercises.find((e) => e.taskLine === 8)!;
    expect(gradeExercise(matching.answers[0], matching).status).toBe("correct");
    expect(
      gradeExercise([...matching.answers[0]].reverse().join(""), matching)
        .status,
    ).toBe("incorrect");
    expect(
      gradeExercise([...punctuation.answers[0]].reverse().join(""), punctuation)
        .status,
    ).toBe("correct");
    expect(gradeExercise("ответ 2", word).status).toBe("format_error");
    expect(gradeExercise("два слова", word).status).toBe("format_error");
    expect(gradeExercise("чужойответ", word).status).toBe("incorrect");
  });
  it("проверяет полноту фиксированных работ и связанные тексты 2–3,10–13", () => {
    for (const variant of variants) {
      validateVariant(variant, materials);
      const session = sessionFromVariant(variant, materials, "control");
      expect(session.items).toHaveLength(13);
      expect(session.durationMinutes).toBe(235);
      expect(session.audio).toHaveLength(1);
      expect(parseSession(JSON.stringify(session))).toBeDefined();
    }
    const missing = structuredClone(variants[0]);
    missing.assignments.pop();
    expect(() => validateVariant(missing, materials)).toThrow("все линии");
    const incompatible = structuredClone(materials);
    const ref = variants[0].assignments.find(
      (r) => incompatible.exercises.find((e) => e.id === r.id)?.taskLine === 3,
    )!;
    incompatible.exercises.find((e) => e.id === ref.id)!.sourceTextId =
      "syntax-news";
    expect(() => validateVariant(variants[0], incompatible)).toThrow(
      "несогласованный",
    );
    expect(() =>
      validateVariant(variants[0], { ...materials, audio: [] }),
    ).toThrow("аудиозаписи");
  });
  it("формирует 100 полных и 100 тестовых работ без повторов и со стабильным seed", () => {
    const compositions = new Set<string>();
    for (let n = 0; n < 100; n++)
      for (const kind of ["full", "test"] as const) {
        const variant = generateVariant(materials, kind, `seed-${n}`);
        validateVariant(variant, materials);
        expect(sessionFromVariant(variant, materials, "learn", true).seed).toBe(
          `seed-${n}`,
        );
        expect(variant.assignments).toHaveLength(11);
        expect(new Set(variant.assignments.map((r) => r.id)).size).toBe(11);
        expect(variant.writingIds).toHaveLength(kind === "full" ? 2 : 0);
        expect(generateVariant(materials, kind, `seed-${n}`)).toEqual(variant);
        compositions.add(variant.assignments.map((r) => r.id).join(","));
      }
    expect(compositions.size).toBeGreaterThan(100);
  }, 20000);
  it("явно отказывает при нехватке заданий и не подставляет выполненное при фильтре новых", () => {
    expect(() =>
      generateVariant(
        { ...materials, exercises: exercises.filter((e) => e.taskLine !== 7) },
        "full",
        "missing",
      ),
    ).toThrow("№ 7");
    expect(() =>
      generateVariant(materials, "test", "errors", {
        only: "errors",
        errorIds: [],
      }),
    ).toThrow("Не хватает");
    const pool = exercises.filter((e) => e.taskLine === 8),
      seen = pool.slice(0, -2).map((e) => e.id);
    expect(() =>
      selectPractice(pool, { count: 5, only: "new", seenIds: seen }, "new"),
    ).toThrow("доступно 2");
    expect(
      selectPractice(pool, { count: "all", only: "new", seenIds: seen }, "new"),
    ).toHaveLength(2);
  });
});
describe("Снимки работ, сохранение и результаты", () => {
  it("сохраняет разные работы независимо, проверяет версии и не доверяет повреждённому снимку", () => {
    const store = storage(),
      a = sessionFromVariant(variants[0], materials, "control"),
      b = sessionFromVariant(variants[1], materials, "learn");
    const first = a.items.find((i) => i.kind === "exercise")!,
      id = itemId(first);
    a.answers[id] = "1";
    saveSession(store, a);
    saveSession(store, b);
    expect(listSessions(store)).toHaveLength(2);
    expect(readSession(store, a.id)?.answers[id]).toBe("1");
    expect(readSession(store, b.id)?.answers).toEqual({});
    if (first.kind !== "exercise") throw Error("Нет упражнения");
    const saved = readSession(store, a.id)!;
    first.exercise.answers = ["9"];
    expect(saved.items.find((i) => itemId(i) === id)).not.toEqual(first);
    const corrupt = structuredClone(b);
    corrupt.items[1] = corrupt.items[0];
    expect(parseSession(JSON.stringify(corrupt))).toBeUndefined();
    const missing = structuredClone(b);
    missing.audio = [];
    expect(parseSession(JSON.stringify(missing))).toBeUndefined();
    expect(parseSession("{bad")).toBeUndefined();
    expect(
      parseSession(JSON.stringify({ ...b, specificationId: "other" })),
    ).toBeUndefined();
  });
  it("предотвращает перезапись другой вкладки и сообщает о недоступном хранилище", () => {
    const store = storage(),
      a = sessionFromVariant(variants[0], materials, "control");
    saveSession(store, a);
    const b = advanceSession(a, {
      answers: { [itemId(a.items[0])]: "Черновик" },
    });
    saveSession(store, b, a.updatedAt);
    expect(() =>
      saveSession(store, advanceSession(a, { activeIndex: 1 }), a.updatedAt),
    ).toThrow("другой вкладке");
    expect(readSession(store, a.id)?.answers).toEqual(b.answers);
    expect(() =>
      saveSession(
        {
          ...store,
          setItem: () => {
            throw Error("quota");
          },
        },
        b,
      ),
    ).toThrow("не сохранил");
  });
  it("восстанавливает таймер от начальной даты и не продлевает его при обновлении", () => {
    const session = sessionFromVariant(variants[0], materials, "control");
    const start = Date.parse(session.startedAt);
    expect(remainingSeconds(session, start)).toBe(235 * 60);
    const resumed = parseSession(
      JSON.stringify(advanceSession(session, { activeIndex: 3 })),
    )!;
    expect(remainingSeconds(resumed, start + 20 * 60000)).toBe(215 * 60);
    expect(remainingSeconds(resumed, start + 236 * 60000)).toBe(0);
    expect(
      remainingSeconds(sessionFromVariant(variants[0], materials, "learn")),
    ).toBeUndefined();
  });
  it("разделяет предметные ошибки, формат, пропуски и экспертные ответы", () => {
    const items = exercises
      .filter((e) => e.taskLine === 5)
      .slice(0, 4)
      .map((exercise) => ({ kind: "exercise" as const, exercise }));
    const writing = materials.writing.find((w) => w.line === 13)!;
    const session = createSession(
      [...items, { kind: "writing", writing }],
      materials,
      { title: "Разбор", kind: "practice", mode: "control", seed: "results" },
    );
    session.answers[itemId(items[0])] = items[0].exercise.answers[0];
    session.answers[itemId(items[1])] =
      items[1].exercise.answers[0] === "1" ? "2" : "1";
    session.answers[itemId(items[2])] = "1,2";
    session.answers[writing.id] = "Письменный ответ";
    expect(resultsFor(session).map((r) => r.status)).toEqual([
      "correct",
      "incorrect",
      "format_error",
      "skipped",
      "insufficient",
    ]);
    session.answers[writing.id] = Array(70).fill("слово").join(" ");
    expect(resultsFor(session).at(-1)?.status).toBe("expert");
    session.answers[writing.id] = "";
    expect(resultsFor(session).at(-1)?.status).toBe("skipped");
  });
  it("считает слова, не включая числа; инициалы с фамилией и дефисное слово считаются единицей", () => {
    expect(
      wordCount("А. С. Пушкин родился в 1799 году. Кто-то читал его стихи."),
    ).toBe(8);
    expect(wordCount("123 + 7")).toBe(0);
  });
});
describe("Действия в семи тренажёрах", () => {
  it("все 35 ситуаций принимают редакторские ключи и отклоняют другое действие", () => {
    for (const activity of games as InteractiveActivity[])
      for (const situation of activity.situations) {
        const answers = Object.fromEntries(
          situation.fields
            .filter((f) => f.expected.length)
            .map((f) => [f.id, f.expected[0]]),
        );
        expect(
          checkActivity(situation, answers).every((r) => r.correct),
          situation.id,
        ).toBe(true);
        const field = situation.fields.find((f) => f.expected.length)!;
        answers[field.id] = "ошибочное действие";
        expect(
          checkActivity(situation, answers).every((r) => r.correct),
          situation.id,
        ).toBe(false);
      }
  });
  it("свободное сжатие не получает автоматическую предметную оценку", () => {
    const situation = (games as InteractiveActivity[]).find(
      (a) => a.kind === "compression",
    )!.situations[0];
    expect(
      checkActivity(situation, {
        essential: situation.fields[0].expected[0],
        draft: "Любой свободный текст",
      }).map((r) => r.field.id),
    ).toEqual(["essential"]);
  });
});
