import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => {
  const flags = { failed: true },
    calls = { collection: 0, lesson: 0, originals: 0, activities: 0 };
  return {
    flags,
    calls,
    collection: vi.fn(async () => {
      calls.collection++;
      if (flags.failed) throw Error("offline exercise");
      return [{ id: "case-1", exam: "OGE", taskLine: 2 }];
    }),
    lesson: vi.fn(async () => {
      calls.lesson++;
      if (flags.failed) throw Error("offline lesson");
      return { topicId: "lesson-1", title: "Loaded lesson" };
    }),
  };
});
vi.mock("../apps/showcase/src/content/exercise-loaders", () => ({
  collections: [{ ids: ["case-1"], lines: [2], load: state.collection }],
}));
vi.mock("../apps/showcase/src/content/lesson-loaders", () => ({
  lessonLoaders: { "lesson-1": state.lesson },
}));
vi.mock("../apps/showcase/src/oge/materials.json", () => ({
  get default() {
    state.calls.originals++;
    if (state.flags.failed) throw Error("offline originals");
    return {
      texts: [],
      audio: [],
      writing: [],
      variants: [{ number: 1, assignments: [{ id: "case-1" }] }],
    };
  },
}));
vi.mock("../apps/showcase/src/oge/activities.json", () => ({
  get default() {
    state.calls.activities++;
    if (state.flags.failed) throw Error("offline activities");
    return [{ id: "activity-1" }];
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.flags.failed = true;
  for (const name of Object.keys(state.calls) as (keyof typeof state.calls)[])
    state.calls[name] = 0;
});

describe("Стабильные отклонённые обещания для React use и явного восстановления", () => {
  it("адрес, строка, подборка и весь банк сохраняют одну ошибку без повторных запросов", async () => {
    const loader = await import("../apps/showcase/src/content/load");
    const exercise = loader.loadExercise("case-1"),
      line = loader.loadLine(2),
      batch = loader.loadExercises(["case-1"]),
      all = loader.loadAllExercises();
    const results = await Promise.allSettled([exercise, line, batch, all]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(loader.loadExercise("case-1")).toBe(exercise);
      expect(loader.loadLine(2)).toBe(line);
      expect(loader.loadExercises(["case-1"])).toBe(batch);
      expect(loader.loadAllExercises()).toBe(all);
    }
    expect(state.calls.collection).toBe(1);
    state.flags.failed = false;
    loader.resetContentLoaders();
    await expect(loader.loadExercise("case-1")).resolves.toMatchObject({
      id: "case-1",
    });
    expect(state.calls.collection).toBe(2);
  });
  it("ошибка урока остаётся тем же thenable до явного сброса", async () => {
    const loader = await import("../apps/showcase/src/content/lesson-load");
    const first = loader.lessonFor("lesson-1");
    await expect(first).rejects.toThrow("offline lesson");
    for (let attempt = 0; attempt < 10; attempt++)
      expect(loader.lessonFor("lesson-1")).toBe(first);
    expect(state.calls.lesson).toBe(1);
    state.flags.failed = false;
    loader.resetLessonLoads();
    await expect(loader.lessonFor("lesson-1")).resolves.toMatchObject({
      topicId: "lesson-1",
    });
    expect(state.calls.lesson).toBe(2);
  });
  it("неизвестный урок тоже не создаёт новое отклонённое обещание на каждом рендере", async () => {
    const loader = await import("../apps/showcase/src/content/lesson-load");
    const first = loader.lessonFor("missing");
    await expect(first).rejects.toThrow("не найден");
    expect(loader.lessonFor("missing")).toBe(first);
    expect(state.calls.lesson).toBe(0);
  });
  it("оригиналы, фиксированный вариант, тренажёры и общий материал сохраняют ошибки до сброса зависимостей", async () => {
    const loader = await import("../apps/showcase/src/oge/materials");
    const originals = loader.loadOriginals(),
      fixed = loader.loadFixedVariant(1),
      activities = loader.loadActivities(),
      materials = loader.loadMaterials();
    const results = await Promise.allSettled([
      originals,
      fixed,
      activities,
      materials,
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    const calls = { ...state.calls };
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(loader.loadOriginals()).toBe(originals);
      expect(loader.loadFixedVariant(1)).toBe(fixed);
      expect(loader.loadActivities()).toBe(activities);
      expect(loader.loadMaterials()).toBe(materials);
    }
    expect(state.calls).toEqual(calls);
    state.flags.failed = false;
    loader.resetMaterialLoads();
    await expect(loader.loadFixedVariant(1)).resolves.toMatchObject({
      exercises: [{ id: "case-1" }],
    });
    await expect(loader.loadActivities()).resolves.toEqual([
      { id: "activity-1" },
    ]);
    await expect(loader.loadMaterials()).resolves.toMatchObject({
      exercises: [{ id: "case-1" }],
    });
    expect(state.calls.collection).toBe(2);
  });
});
