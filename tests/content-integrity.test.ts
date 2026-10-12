import { describe, expect, it } from "vitest";
import vowels from "../apps/showcase/src/content/exercises/glasnye-v-tekste.json";
import forms from "../apps/showcase/src/content/exercises/formy-slov.json";
import phrases from "../apps/showcase/src/content/exercises/slovosochetaniya.json";
import reading from "../apps/showcase/src/content/lessons/analiz-teksta.json";
import type { Exercise, Lesson } from "../apps/showcase/src/content/model";
import { gradeExercise } from "../apps/showcase/src/oge/engine";
import {
  numberedGapIssues,
  vowelExerciseIssues,
} from "../scripts/lib/content-integrity";

describe("Final published spelling conditions", () => {
  it("rejects detached markers, duplicate/missing positions and unnumbered gaps", () => {
    for (const text of [
      "гн…тся(1)т",
      "гн…(1)тся у алле…(1)",
      "алле…(2)",
      "гн…тся",
    ]) {
      expect(numberedGapIssues(text).length, text).toBeGreaterThan(0);
    }
    expect(numberedGapIssues("У алле…(1) гн…(2)тся рябины.", ["2"])).toEqual(
      [],
    );
    expect(numberedGapIssues("Гн…(1)тся.", ["2"]).length).toBeGreaterThan(0);
  });
  it("checks every final line-7 condition against its per-position explanation", () => {
    for (const exercise of vowels)
      expect(vowelExerciseIssues(exercise), exercise.id).toEqual([]);
  });
  it.each([
    [
      "013",
      [
        "осеннем",
        "медленно",
        "кружились",
        "скамейке",
        "забытая",
        "природе",
        "аллеи",
        "гнутся",
        "алеют",
      ],
      "ееиеяеиую",
      "37",
    ],
    [
      "016",
      [
        "аллеи",
        "гнутся",
        "алеют",
        "дорожки",
        "тянулись",
        "поздними",
        "вечеру",
        "загорелись",
        "прояснилось",
      ],
      "иуюиуиуои",
      "257",
    ],
  ] as const)(
    "restores the nine independently reviewed forms in %s",
    (suffix, expected, letters, key) => {
      const exercise = vowels.find(
        (item) => item.id === `oge-glasnye-v-tekste-${suffix}`,
      )!;
      const restored = [
        ...exercise.text.matchAll(/([А-ЯЁа-яё]+)…\((\d+)\)([А-ЯЁа-яё]*)/gu),
      ].map((gap) =>
        `${gap[1]}${letters[Number(gap[2]) - 1]}${gap[3]}`.toLowerCase(),
      );
      expect(restored).toEqual(expected);
      expect(exercise.answers).toEqual([key]);
      expect(exercise.revision).toBeGreaterThanOrEqual(2);
    },
  );
});

describe("Reading evidence rather than assumptions", () => {
  const lesson = reading as Lesson;
  const interactive = lesson.sections
    .flatMap((s) => s.blocks)
    .find((block) => block.type === "interactive")!;
  const cases =
    interactive.type === "interactive" ? interactive.data.examples : [];
  it.each([
    [0, "Не подтверждено"], // helping with paint does not establish sole authorship
    [1, "Не подтверждено"], // discovery time does not establish emergence time
    [2, "Противоречит"], // actually admitted, despite the initial intention
    [3, "Не подтверждено"], // checking a map does not establish a ban on research
    [4, "Не подтверждено"], // no request does not establish an offer/refusal
  ] as const)(
    "keeps independently interpreted logical case %i",
    (index, conclusion) => {
      const item = cases[index];
      expect(item.options?.[item.expected[0] - 1]).toBe(conclusion);
    },
  );
  it("explains appearance and observation separately and versions the correction", () => {
    expect(cases[1].explanation).toMatch(/обнаружения.*появления/u);
    expect(cases[1].explanation).toMatch(/раньше/u);
    expect(lesson.revision).toBeGreaterThanOrEqual(2);
  });
});

describe("Normative alternatives and required grammatical operations", () => {
  const lookup = (collection: unknown[], id: string) =>
    (collection as Exercise[]).find((x) => x.id === id)!;
  it.each(["легче", "полегче", " Полегче "])(
    "accepts the normative comparative %s",
    (answer) => {
      const exercise = lookup(forms, "oge-formy-slov-020");
      expect(gradeExercise(answer, exercise).status).toBe("correct");
      expect(exercise.revision).toBeGreaterThanOrEqual(2);
    },
  );
  it.each(["легчее", "более легче", "лёгкая"])(
    "rejects %s with a grammatical or task-based reason",
    (answer) => {
      expect(
        gradeExercise(answer, lookup(forms, "oge-formy-slov-020")).status,
      ).not.toBe("correct");
    },
  );
  it.each([
    ["002", "двумстам", "двухстам"],
    ["005", "носок", "носк"],
    ["009", "ляг", "ляжь"],
    ["015", "чулок", "чулков"],
    ["028", "печем", "пекём"],
    ["036", "бухгалтеры", "бухгалтера"],
    ["039", "сотри", "стерий"],
    ["043", "полутора", "полтора"],
  ])(
    "checks the independent norm for line-8 case %s",
    (suffix, correct, wrong) => {
      const exercise = lookup(forms, `oge-formy-slov-${suffix}`);
      expect(gradeExercise(correct, exercise).status).toBe("correct");
      expect(gradeExercise(wrong, exercise).status).not.toBe("correct");
    },
  );
  it.each([
    ["001", "шкатулка деревянная", "шкатулка из дерева"],
    ["004", "со старанием работал", "работал старательно"],
    ["009", "не спеша шёл", "шёл без спешки"],
    ["014", "стена из кирпичей", "кирпичная стена"],
    ["052", "не колеблясь ответил", "ответил без колебаний"],
  ])(
    "accepts meaningful reordered line-9 case %s while requiring a changed relation",
    (suffix, correct, wrong) => {
      const exercise = lookup(phrases, `oge-slovosochetaniya-${suffix}`);
      expect(gradeExercise(correct, exercise).status).toBe("correct");
      expect(gradeExercise(wrong, exercise).status).not.toBe("correct");
    },
  );
});
