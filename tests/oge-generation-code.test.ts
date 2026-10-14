import { beforeEach, describe, expect, it, vi } from "vitest";
import data from "../apps/showcase/src/oge/materials.json" with { type: "json" };
import catalog from "../apps/showcase/src/content/catalog-version.json" with { type: "json" };
import { exercises } from "../apps/showcase/src/content/registry";
import {
  createSession,
  generateVariant,
  sessionFromVariant,
  type Materials,
} from "../apps/showcase/src/oge/engine";
import type { PracticeSession } from "../apps/showcase/src/oge/model";
const loaders = vi.hoisted(() => ({
  read: vi.fn(),
  originals: vi.fn(),
  exercises: vi.fn(),
}));
vi.mock("../apps/showcase/src/oge/repository", () => ({
  readSessionDurably: loaders.read,
}));
vi.mock("../apps/showcase/src/oge/materials", () => ({
  loadOriginals: loaders.originals,
}));
vi.mock("../apps/showcase/src/content/load", () => ({
  loadExercises: loaders.exercises,
}));
import {
  restoreGenerationCode,
  generationCodeMaxBytes,
} from "../apps/showcase/src/oge/generation-code";
const materials: Materials = { ...data, exercises } as unknown as Materials;
function full() {
  return sessionFromVariant(
    generateVariant(materials, "full", "code-transfer-seed"),
    materials,
    "control",
    true,
  );
}
function code(session: PracticeSession) {
  return {
    format: "polina-oge-generation",
    version: 1,
    specificationId: session.specificationId,
    catalogVersion: session.catalogVersion ?? "legacy-snapshot",
    generationVersion: session.generationVersion ?? 1,
    snapshotId: session.id,
    title: session.title,
    originVariantId: session.originVariantId,
    seed: session.seed,
    kind: session.kind,
    mode: session.mode,
    assignments: session.items.map((item) => ({
      kind: item.kind,
      id: item.kind === "exercise" ? item.exercise.id : item.writing.id,
      revision:
        item.kind === "exercise"
          ? item.exercise.revision
          : item.writing.revision,
    })),
    texts: session.texts.map((text) => ({
      id: text.id,
      revision: text.revision,
    })),
    audio: session.audio.map((audio) => ({
      id: audio.id,
      revision: audio.revision,
    })),
    selectedPrompts: { ...session.selectedPrompts },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  loaders.read.mockResolvedValue(undefined);
  loaders.originals.mockResolvedValue(data);
  loaders.exercises.mockImplementation(async (ids: string[]) =>
    exercises.filter((exercise) => ids.includes(exercise.id)),
  );
});
describe("Восстановление состава по коду", () => {
  it("один код текущего банка создаёт независимые работы с одинаковыми условиями, порядком, seed и редакциями", async () => {
    const original = full(),
      value = code(original);
    const a = await restoreGenerationCode(JSON.stringify(value)),
      b = await restoreGenerationCode(JSON.stringify(value));
    expect(a.id).not.toBe(original.id);
    expect(a.id).not.toBe(b.id);
    expect(a.items).toEqual(original.items);
    expect(b.items).toEqual(a.items);
    expect(a.texts).toEqual(original.texts);
    expect(a.audio).toEqual(original.audio);
    expect(a.seed).toBe(original.seed);
    expect(a.catalogVersion).toBe(catalog.version);
    expect(a.durationMinutes).toBe(235);
    expect(a.answers).toEqual({});
    expect(loaders.exercises).toHaveBeenCalledWith(
      original.items.flatMap((item) =>
        item.kind === "exercise" ? [item.exercise.id] : [],
      ),
    );
  });
  it("смешанная тематическая подборка сохраняет заданный порядок и выбранную письменную тему", async () => {
    const exercise = exercises.find((item) => item.taskLine === 8)!,
      writing = materials.writing.find((item) => item.line === 13)!;
    const session = createSession(
      [
        { kind: "writing", writing },
        { kind: "exercise", exercise },
      ],
      materials,
      {
        title: "Тема и форма",
        kind: "practice",
        mode: "learn",
        seed: "mixed-order",
      },
    );
    session.selectedPrompts[writing.id] = "13.2";
    const restored = await restoreGenerationCode(JSON.stringify(code(session)));
    expect(restored.items).toEqual(session.items);
    expect(restored.selectedPrompts).toEqual(session.selectedPrompts);
    expect(restored.durationMinutes).toBeUndefined();
  });
  it("старый каталог восстанавливается из своего снимка без загрузки или перепроверки нынешних условий", async () => {
    const old = full();
    old.catalogVersion = "archive-catalog-2026";
    old.generationVersion = 1;
    const original = old.items.find((item) => item.kind === "exercise")!;
    if (original.kind !== "exercise") throw Error("fixture");
    original.exercise.prompt =
      "Историческое условие, сохранённое до обновления банка";
    original.exercise.revision += 100;
    old.audio[0].path = old.audio[0].path.replace(".mp3", ".wav");
    old.audio[0].revision = 1;
    old.answers = { [original.exercise.id]: "Предыдущий ответ" };
    old.checkedIds = [original.exercise.id];
    old.activeIndex = 3;
    old.completedAt = new Date().toISOString();
    old.endedByTimeout = true;
    old.audioPlays = { [old.audio[0].id]: 2 };
    old.audioCompletedPlays = { [old.audio[0].id]: 2 };
    old.audioPositions = { [old.audio[0].id]: 30 };
    old.writingReviews = {
      $literacy: {
        checks: [],
        note: "Старая оценка",
        role: "expert",
        scores: { ГК1: 3 },
      },
    };
    const essay = old.items.find(
      (item) => item.kind === "writing" && item.writing.line === 13,
    )!;
    if (essay.kind !== "writing") throw Error("fixture");
    const value = code(old);
    value.selectedPrompts[essay.writing.id] = "13.2";
    loaders.read.mockResolvedValue(old);
    const restored = await restoreGenerationCode(JSON.stringify(value));
    expect(restored.items).toEqual(old.items);
    expect(restored.audio).toEqual(old.audio);
    expect(restored.id).not.toBe(old.id);
    expect(restored.selectedPrompts[essay.writing.id]).toBe("13.2");
    expect(restored.answers).toEqual({});
    expect(restored.checkedIds).toEqual([]);
    expect(restored.writingReviews).toEqual({});
    expect(restored.activeIndex).toBe(0);
    expect(restored.completedAt).toBeUndefined();
    expect(restored.endedByTimeout).toBeUndefined();
    expect(restored.audioPlays).toEqual({});
    expect(restored.audioCompletedPlays).toEqual({});
    expect(restored.audioPositions).toEqual({});
    expect(loaders.originals).not.toHaveBeenCalled();
    expect(loaders.exercises).not.toHaveBeenCalled();
    expect(old.answers[original.exercise.id]).toBe("Предыдущий ответ");
  });
  it("код другого состава не используется с найденным архивом", async () => {
    const old = full(),
      value = code(old);
    loaders.read.mockResolvedValue(old);
    value.assignments[0].revision++;
    await expect(restoreGenerationCode(JSON.stringify(value))).rejects.toThrow(
      "не совпадает",
    );
    expect(loaders.exercises).not.toHaveBeenCalled();
  });
  it("старый каталог без снимка требует полную резервную копию; новый банк не подставляется", async () => {
    const value = code(full());
    value.catalogVersion = "missing-older-catalog";
    await expect(restoreGenerationCode(JSON.stringify(value))).rejects.toThrow(
      "полную резервную копию",
    );
    expect(loaders.originals).not.toHaveBeenCalled();
    expect(loaders.exercises).not.toHaveBeenCalled();
    value.catalogVersion = catalog.version;
    value.generationVersion = 1;
    await expect(restoreGenerationCode(JSON.stringify(value))).rejects.toThrow(
      "алгоритма",
    );
  });
  it("неизвестная редакция задания, текста или аудио отклоняется вместо замены текущей", async () => {
    for (const field of ["assignments", "texts", "audio"] as const) {
      const value = code(full());
      value[field][0].revision += 100;
      await expect(
        restoreGenerationCode(JSON.stringify(value)),
      ).rejects.toThrow("редакци");
    }
  });
  it("неполный полный вариант и отсутствующий общий текст не становятся валидными работами", async () => {
    const value = code(full());
    value.assignments = value.assignments.filter(
      (ref) =>
        ref.kind !== "exercise" ||
        ref.id !== value.assignments.find((ref) => ref.kind === "exercise")!.id,
    );
    await expect(restoreGenerationCode(JSON.stringify(value))).rejects.toThrow(
      "все линии",
    );
    const missing = code(full());
    missing.texts = [];
    await expect(
      restoreGenerationCode(JSON.stringify(missing)),
    ).rejects.toThrow(/аудиозаписи|исходный текст/u);
  });
  it("неизвестная письменная тема и ключ темы тестового задания отклоняются", async () => {
    const value = code(full()),
      writing = value.assignments.find((ref) => ref.kind === "writing")!;
    value.selectedPrompts[writing.id] = "13.9";
    await expect(restoreGenerationCode(JSON.stringify(value))).rejects.toThrow(
      "письменная тема",
    );
    const other = code(full());
    other.selectedPrompts[
      other.assignments.find((ref) => ref.kind === "exercise")!.id
    ] = "13.1";
    await expect(restoreGenerationCode(JSON.stringify(other))).rejects.toThrow(
      "письменная тема",
    );
  });
  it("повторы, неподдерживаемая модель и превышение лимита проверяются до чтения хранилища", async () => {
    const repeated = code(full());
    repeated.assignments.push({ ...repeated.assignments[0] });
    await expect(
      restoreGenerationCode(JSON.stringify(repeated)),
    ).rejects.toThrow("повторяется");
    await expect(
      restoreGenerationCode(
        JSON.stringify({
          ...code(full()),
          specificationId: "unapproved-model",
        }),
      ),
    ).rejects.toThrow("формат");
    await expect(
      restoreGenerationCode("я".repeat(generationCodeMaxBytes / 2 + 1)),
    ).rejects.toThrow("1 МБ");
    expect(loaders.read).not.toHaveBeenCalled();
  });
  it("опубликованный фиксированный вариант сохраняет происхождение и самостоятельную новую попытку", async () => {
    const variant = data.variants[0];
    const session = sessionFromVariant(
      variant as unknown as Parameters<typeof sessionFromVariant>[0],
      materials,
      "learn",
    );
    const restored = await restoreGenerationCode(JSON.stringify(code(session)));
    expect(restored.originVariantId).toBe(variant.id);
    expect(restored.kind).toBe("fixed-full");
    expect(restored.seed).toBe(session.seed);
    expect(restored.items).toEqual(session.items);
  });
});
