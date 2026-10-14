import { describe, expect, it } from "vitest";
import data from "../apps/showcase/src/oge/materials.json" with { type: "json" };
import { createSession, type Materials } from "../apps/showcase/src/oge/engine";
import { literacyEligibility } from "../apps/showcase/src/oge/writing-review";
import {
  essayCriteria,
  summaryCriteria,
} from "../apps/showcase/src/oge/writing-rubric";
import type { PracticeSession } from "../apps/showcase/src/oge/model";

function work(summaryWords: number, essayWords: number): PracticeSession {
  const materials = { ...data, exercises: [] } as unknown as Materials;
  const writing = [
    materials.writing.find((item) => item.line === 1)!,
    materials.writing.find((item) => item.line === 13)!,
  ];
  const session = createSession(
    writing.map((writing) => ({ kind: "writing" as const, writing })),
    materials,
    { title: "Грамотность", kind: "practice", mode: "learn", seed: "review" },
  );
  session.answers = {
    [writing[0].id]: "слово ".repeat(summaryWords),
    [writing[1].id]: "слово ".repeat(essayWords),
  };
  session.writingReviews = {};
  for (const item of writing) {
    const promptId = item.prompts[0].id;
    const criteria = item.line === 1 ? summaryCriteria : essayCriteria;
    session.writingReviews[item.id + ":" + promptId] = {
      checks: [],
      note: "",
      scores: Object.fromEntries(
        criteria.map((c) => [c.code, c.levels.length - 1]),
      ),
      role: "expert",
      reviewer: "Учебный проверяющий",
      reviewedAt: new Date().toISOString(),
      promptId,
      contentAccepted: true,
    };
  }
  return session;
}
describe("Грамотность: считаются только явно зачтённые человеком письменные работы", () => {
  it("несколько сочинений в тематической подборке не объединяются в один экзаменационный лист грамотности", () => {
    const session = work(0, 70);
    const essay = session.items[1];
    if (essay.kind !== "writing") throw Error("fixture");
    const extra = { ...essay.writing, id: essay.writing.id + "-extra" };
    session.items.push({ kind: "writing", writing: extra });
    session.answers[extra.id] = "слово ".repeat(70);
    const promptId = extra.prompts[0].id;
    session.writingReviews![extra.id + ":" + promptId] = {
      ...session.writingReviews![essay.writing.id + ":" + promptId],
    };
    expect(literacyEligibility(session)).toEqual({
      total: 140,
      acceptedCount: 2,
      eligible: false,
    });
  });
  it("две зачтённые работы по 70 слов дают 140; две работы с суммой 139 недостаточны", () => {
    expect(literacyEligibility(work(70, 70))).toEqual({
      total: 140,
      acceptedCount: 2,
      eligible: true,
    });
    expect(literacyEligibility(work(70, 69))).toEqual({
      total: 70,
      acceptedCount: 1,
      eligible: false,
    });
  });
  it("если зачтено только сочинение, 139 слов не позволяют оценивать грамотность; 140 позволяют", () => {
    const session = work(70, 139);
    const summary = session.items[0];
    if (summary.kind !== "writing") throw Error("fixture");
    const key = summary.writing.id + ":" + summary.writing.prompts[0].id;
    session.writingReviews![key].contentAccepted = false;
    expect(literacyEligibility(session)).toEqual({
      total: 139,
      acceptedCount: 1,
      eligible: false,
    });
    const essay = session.items[1];
    if (essay.kind !== "writing") throw Error("fixture");
    session.answers[essay.writing.id] += "слово";
    expect(literacyEligibility(session)).toEqual({
      total: 140,
      acceptedCount: 1,
      eligible: true,
    });
  });
  it("сырой длинный ответ, самооценка или снятая фиксация оценки не означают зачтённого содержания", () => {
    const session = work(140, 140);
    const reviews = Object.values(session.writingReviews!);
    reviews[0].role = "self";
    reviews[1].reviewedAt = undefined;
    expect(literacyEligibility(session)).toEqual({
      total: 0,
      acceptedCount: 0,
      eligible: false,
    });
  });
  it("решение по другой теме и неполный оценочный лист не применяются к текущей работе", () => {
    const session = work(140, 140);
    const reviews = Object.values(session.writingReviews!);
    reviews[0].scores = {};
    reviews[1].promptId = "13.2";
    expect(literacyEligibility(session)).toEqual({
      total: 0,
      acceptedCount: 0,
      eligible: false,
    });
  });
});
