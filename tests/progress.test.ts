import { describe, expect, it } from "vitest";
import { exercises } from "../apps/showcase/src/content";
import {
  createAttempt,
  readAttempts,
  confidence,
} from "../apps/showcase/src/progress";
describe("Локальная история", () => {
  it("не ломается при недоступном или повреждённом хранилище", () => {
    expect(
      readAttempts({
        getItem: () => {
          throw new Error("Запрещено");
        },
      }),
    ).toEqual([]);
    expect(readAttempts({ getItem: () => "oops" })).toEqual([]);
    expect(
      readAttempts({ getItem: () => '[null, {}, {"results": []}]' }),
    ).toEqual([]);
  });
  it("сохраняет версию, навык и статус повторной попытки", () => {
    const attempt = createAttempt(exercises[0], "2", true);
    expect(attempt).toMatchObject({
      revision: 1,
      skillId: "EGE:punctuation.homogeneous",
      repeat: true,
      misconceptionId: "single-conjunction-comma",
    });
    expect(
      readAttempts({ getItem: () => JSON.stringify([attempt]) })[0].results[0]
        .status,
    ).toBe("incorrect");
  });
  it("не доверяет подменённым оценкам в localStorage", () => {
    const attempt = createAttempt(exercises[0], "2", false);
    attempt.results[0].status = "correct";
    expect(
      readAttempts({ getItem: () => JSON.stringify([attempt]) })[0].results[0]
        .status,
    ).toBe("incorrect");
  });
  it("сообщает о недостаточной выборке", () => {
    expect(confidence(2)).toContain("недостаточно");
  });
});
