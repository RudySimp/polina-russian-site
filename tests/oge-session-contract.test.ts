import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import { createSession } from "../apps/showcase/src/oge/engine";
import {
  advanceSession,
  parseSession,
  saveSession,
  validateSessionSnapshot,
} from "../apps/showcase/src/oge/storage";
import {
  sessionLimits,
  serializedSessionBytes,
} from "../apps/showcase/src/oge/session-limits";

function work(count = 1) {
  const actual = exercises.find((e) => e.taskLine === 8)!;
  const keys = [
    "id",
    "revision",
    "title",
    "prompt",
    "exam",
    "responseKind",
    "answers",
    "policy",
    "maxScore",
    "topicId",
    "topicSlug",
    "topicTitle",
    "skillId",
    "explanation",
    "hint",
    "options",
    "optionExplanations",
    "steps",
    "input",
    "instruction",
    "taskLine",
    "examModel",
    "source",
    "provenance",
    "reviewStatus",
  ];
  const compact = Object.fromEntries(
    keys.map((key) => [key, actual[key as keyof typeof actual]]),
  );
  const entries = Array.from({ length: count }, (_, index) => ({
    kind: "exercise" as const,
    exercise: {
      ...compact,
      id: "contract-fixture-" + index,
      title: "Синтетический пример",
      prompt: "Исправьте форму слова.",
      explanation: "Проверяется сохранность снимка.",
      hint: "Вспомните форму слова.",
      options: [],
      optionExplanations: [],
      steps: [],
    // A deliberate projection of the historical snapshot schema, checked by parseSession below.
    } as unknown as typeof actual,
  }));
  return createSession(
    entries,
    {
      texts: [],
      audio: [],
      exercises: entries.map((e) => e.exercise),
      writing: [],
    },
    {
      title: "Синтетическая проверка контракта",
      kind: "practice",
      mode: "learn",
      seed: "contract",
    },
  );
}
function memory(fail = false) {
  const values = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => {
    if (fail) throw new DOMException("Full", "QuotaExceededError");
    values.set(key, value);
  });
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem,
    removeItem: (key: string) => values.delete(key),
    key: (number: number) => [...values.keys()][number] ?? null,
    get length() {
      return values.size;
    },
  };
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent });
  vi.stubGlobal("BroadcastChannel", undefined);
  return { storage, values, setItem, dispatchEvent };
}
function paddedWork(character = "a") {
  const session = work(70);
  let remaining =
    sessionLimits.maxSerializedChars - JSON.stringify(session).length;
  for (const item of session.items) {
    if (item.kind !== "exercise") continue;
    const addition = Math.min(
      sessionLimits.maxFieldChars - item.exercise.prompt.length,
      remaining,
    );
    item.exercise.prompt += character.repeat(addition);
    remaining -= addition;
  }
  if (remaining) throw Error("Insufficient field capacity");
  return session;
}
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("Единый контракт первоначального снимка ОГЭ", () => {
  it("1000 допустимых заданий читаются, 1001 отклоняется до открытия IDB и любого локального сохранения", async () => {
    const { values, setItem, dispatchEvent } = memory();
    const open = vi.fn(() => {
      throw Error("Must never open for invalid snapshot");
    });
    vi.stubGlobal("indexedDB", { open });
    const valid = work(sessionLimits.maxItems);
    const invalid = work(sessionLimits.maxItems + 1);
    expect(JSON.stringify(invalid).length).toBeLessThan(
      sessionLimits.maxSerializedChars,
    );
    expect(parseSession(validateSessionSnapshot(valid))?.items).toHaveLength(
      sessionLimits.maxItems,
    );
    expect(parseSession(JSON.stringify(invalid))).toBeUndefined();
    const { saveSessionDurably } =
      await import("../apps/showcase/src/oge/repository");
    await expect(saveSessionDurably(invalid)).rejects.toMatchObject({
      code: "invalid",
    });
    expect(open).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it("ровно 3 млн символов допустимы, превышение на один отклоняется даже при 70 заданиях", async () => {
    const { setItem, dispatchEvent } = memory();
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    const valid = paddedWork();
    const invalid = structuredClone(valid);
    const item = invalid.items.find(
      (i) =>
        i.kind === "exercise" &&
        i.exercise.prompt.length < sessionLimits.maxFieldChars,
    )!;
    if (item.kind === "exercise") item.exercise.prompt += "a";
    expect(JSON.stringify(valid).length).toBe(sessionLimits.maxSerializedChars);
    expect(parseSession(validateSessionSnapshot(valid))).toBeDefined();
    expect(JSON.stringify(invalid).length).toBe(
      sessionLimits.maxSerializedChars + 1,
    );
    expect(invalid.items.length).toBeLessThan(sessionLimits.maxItems);
    const { saveSessionDurably } =
      await import("../apps/showcase/src/oge/repository");
    await expect(saveSessionDurably(invalid)).rejects.toMatchObject({
      code: "invalid",
    });
    expect(open).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it("байтовый контракт сохраняет допустимый v1 с многобайтным текстом, поле ограничено отдельно", () => {
    const legacy = paddedWork("漢");
    const raw = validateSessionSnapshot(legacy);
    expect(raw.length).toBe(sessionLimits.maxSerializedChars);
    expect(serializedSessionBytes(raw)).toBeGreaterThan(6_000_000);
    expect(serializedSessionBytes(raw)).toBeLessThanOrEqual(
      sessionLimits.maxSerializedBytes,
    );
    expect(parseSession(raw)).toBeDefined();
    expect(serializedSessionBytes("я🙂")).toBe(6);
    const single = work();
    const item = single.items[0];
    if (item.kind !== "exercise") throw Error("Exercise required");
    item.exercise.prompt = "я".repeat(sessionLimits.maxFieldChars);
    expect(parseSession(validateSessionSnapshot(single))).toBeDefined();
    item.exercise.prompt += "я";
    expect(() => validateSessionSnapshot(single)).toThrow("не прошла проверку");
  });
  it("семантически некорректный снимок также отклоняется до fallback и не объявляется сохранённым", async () => {
    const { setItem, dispatchEvent } = memory();
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    const invalid = work();
    if (invalid.items[0].kind === "exercise")
      invalid.items[0].exercise.sourceTextId = "missing-text";
    const { saveSessionDurably } =
      await import("../apps/showcase/src/oge/repository");
    await expect(saveSessionDurably(invalid)).rejects.toMatchObject({
      code: "invalid",
    });
    expect(open).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it("отказ IDB сохраняет допустимую работу в LS; последующий ввод не сериализует immutable условия", async () => {
    const { storage, values, dispatchEvent } = memory();
    vi.stubGlobal("indexedDB", undefined);
    const session = work();
    const { saveSessionDurably, readSessionDurably } =
      await import("../apps/showcase/src/oge/repository");
    await saveSessionDurably(session);
    const raw = values.get("polina-oge-work-v1:" + session.id);
    expect(await readSessionDurably(session.id)).toEqual(session);
    const id =
      session.items[0].kind === "exercise" ? session.items[0].exercise.id : "";
    const next = advanceSession(session, { answers: { [id]: "Новый ответ" } });
    // An immutable field getter catches a regression that serializes all conditions on typing.
    Object.defineProperty(next, "items", {
      get: () => {
        throw Error("Must use accepted snapshot on draft write");
      },
    });
    await saveSessionDurably(next, session.updatedAt);
    expect(values.get("polina-oge-work-v1:" + session.id)).toBe(raw);
    expect((await readSessionDurably(session.id))?.answers[id]).toBe(
      "Новый ответ",
    );
    expect(storage.length).toBe(3);
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });
  it("двойной отказ остаётся unavailable, настоящий конфликт остаётся conflict и сохраняет прежние ответы", async () => {
    const failed = memory(true);
    vi.stubGlobal("indexedDB", undefined);
    const { saveSessionDurably } =
      await import("../apps/showcase/src/oge/repository");
    await expect(saveSessionDurably(work())).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(failed.dispatchEvent).not.toHaveBeenCalled();
    const { storage, dispatchEvent } = memory();
    const session = work(),
      id =
        session.items[0].kind === "exercise"
          ? session.items[0].exercise.id
          : "";
    saveSession(storage, session);
    const remote = advanceSession(session, {
      answers: { [id]: "Текст другой вкладки" },
    });
    saveSession(storage, remote, session.updatedAt);
    const local = advanceSession(session, { answers: { [id]: "Мой текст" } });
    await expect(
      saveSessionDurably(local, session.updatedAt),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(
      (await import("../apps/showcase/src/oge/storage")).readSession(
        storage,
        session.id,
      )?.answers[id],
    ).toBe("Текст другой вкладки");
    expect(local.answers[id]).toBe("Мой текст");
  });
});
