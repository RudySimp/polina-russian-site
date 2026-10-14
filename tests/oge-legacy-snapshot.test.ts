import { describe, expect, it } from "vitest";
import fs from "node:fs";
import type {
  ExamVariant,
  PracticeSession,
} from "../apps/showcase/src/oge/model";
import {
  eligible,
  validateVariant,
  type Materials,
} from "../apps/showcase/src/oge/engine";
import {
  parseSession,
  readSession,
  saveSession,
} from "../apps/showcase/src/oge/storage";
import {
  exportSessions,
  importSessions,
} from "../apps/showcase/src/oge/backup";
const raw = fs.readFileSync(
  "tests/fixtures/legacy-pre-audit-full.json",
  "utf8",
);
const legacy = JSON.parse(raw) as PracticeSession;
const old = legacy.items.find(
  (item) =>
    item.kind === "exercise" && item.exercise.id === "oge-glasnye-v-tekste-013",
);
if (old?.kind !== "exercise") throw Error("Actual baseline case required");
function materials(session = legacy): Materials {
  return {
    texts: session.texts,
    audio: session.audio,
    exercises: session.items.flatMap((item) =>
      item.kind === "exercise" ? [item.exercise] : [],
    ),
    writing: session.items.flatMap((item) =>
      item.kind === "writing" ? [item.writing] : [],
    ),
  };
}
const variant: ExamVariant = {
  id: legacy.id,
  number: 0,
  revision: 1,
  specificationId: legacy.specificationId,
  title: legacy.title,
  kind: "full",
  assignments: legacy.items.flatMap((item) =>
    item.kind === "exercise"
      ? [{ id: item.exercise.id, revision: item.exercise.revision }]
      : [],
  ),
  sourceTextIds: legacy.texts.map((text) => text.id),
  writingIds: legacy.items.flatMap((item) =>
    item.kind === "writing" ? [item.writing.id] : [],
  ),
  status: "published",
  reviewStage: "publication-approved",
  teacherApproval: "pending",
};
function memory() {
  const values = new Map<string, string>([
    ["polina-oge-work-v1:" + legacy.id, raw],
  ]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}
describe("Реальная исходная редакция 3b042ed в синтетическом старом снимке", () => {
  it("исторически повреждённый №7 остаётся недопущенным к новой публикации", () => {
    expect(old.exercise.revision).toBe(1);
    expect(old.exercise.text).toContain("гн…тся(8)т");
    expect(eligible(old.exercise)).toBe(false);
    expect(() => validateVariant(variant, materials())).toThrow(
      "отсутствует проверенная версия",
    );
    expect(() =>
      validateVariant(variant, materials(), { mode: "snapshot" }),
    ).not.toThrow();
  });
  it("старый полный снимок без catalog/generation сохраняет все исходные условия и WAV", () => {
    expect(legacy).not.toHaveProperty("catalogVersion");
    expect(legacy).not.toHaveProperty("generationVersion");
    const parsed = parseSession(raw)!;
    expect(parsed).toBeDefined();
    expect(parsed.items).toEqual(legacy.items);
    expect(parsed.audio).toEqual(legacy.audio);
    expect(parsed.audio[0].path).toBe("/audio/oge-reading.wav");
    expect(parsed.answers[old.exercise.id]).toBe(old.exercise.answers[0]);
    const store = memory();
    expect(readSession(store, legacy.id)?.items).toEqual(legacy.items);
    saveSession(
      store,
      { ...parsed, updatedAt: "2026-10-11T12:16:00.000Z" },
      parsed.updatedAt,
    );
    expect(store.getItem("polina-oge-work-v1:" + legacy.id)).toBe(raw);
    expect(readSession(store, legacy.id)?.items).toEqual(legacy.items);
  });
  it("экспорт и восстановление не подменяют старое условие, ключ или запись аудио", () => {
    const restored = importSessions(exportSessions([parseSession(raw)!]))[0];
    expect(restored.items).toEqual(legacy.items);
    expect(restored.answers).toEqual(legacy.answers);
    expect(restored.audio).toEqual(legacy.audio);
    expect(restored.texts).toEqual(legacy.texts);
    expect(restored).not.toHaveProperty("catalogVersion");
    expect(restored).not.toHaveProperty("generationVersion");
  });
  it("сохранённый снимок всё ещё требует полного состава и согласованных исходных текстов", () => {
    const missing = structuredClone(legacy);
    missing.items.splice(2, 1);
    expect(parseSession(JSON.stringify(missing))).toBeUndefined();
    const unlinked = structuredClone(legacy);
    unlinked.texts = unlinked.texts.filter((text) => text.kind !== "syntax");
    expect(parseSession(JSON.stringify(unlinked))).toBeUndefined();
    expect(() =>
      validateVariant(
        variant,
        { ...materials(), audio: [] },
        { mode: "snapshot" },
      ),
    ).toThrow("нет аудиозаписи");
  });
});
