import { describe, expect, it } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import { createSession } from "../apps/showcase/src/oge/engine";
import {
  backupMaxBytes,
  exportSessions,
  importSessions,
  prepareBackupParts,
} from "../apps/showcase/src/oge/backup";
function work(large = false, items = 1) {
  const source = exercises.find((exercise) => exercise.taskLine === 8)!;
  const entries = Array.from({ length: items }, (_, index) => ({
    kind: "exercise" as const,
    exercise: {
      ...source,
      id: source.id + "-fixture-" + index,
      ...(large ? { prompt: "я".repeat(49000) } : {}),
    },
  }));
  return createSession(
    entries,
    {
      texts: [],
      audio: [],
      exercises: entries.map((entry) => entry.exercise),
      writing: [],
    },
    {
      title: "Синтетическая проверка резервной копии",
      kind: "practice",
      mode: "learn",
      seed: "backup-boundary",
    },
  );
}

describe("Восстановимые границы резервных файлов", () => {
  it("201 работа разбивается на 200 и 1, каждая часть восстанавливается без потерь", () => {
    const source = work(),
      works = Array.from({ length: 201 }, () => ({
        ...source,
        id: crypto.randomUUID(),
      }));
    expect(() => exportSessions(works)).toThrow("200");
    const parts = prepareBackupParts(works);
    expect(parts.map((part) => part.sessionCount)).toEqual([200, 1]);
    expect(
      parts.flatMap((part) =>
        importSessions(part.json).map((session) => session.id),
      ),
    ).toEqual(works.map((session) => session.id));
    expect(parts.every((part) => part.bytes <= backupMaxBytes)).toBe(true);
    expect(
      parts.every(
        (part) => new TextEncoder().encode(part.json).byteLength === part.bytes,
      ),
    ).toBe(true);
    expect(parts[0].json.includes("\n")).toBe(false);
  });
  it("лимит UTF-8 учитывает большой текст и делит меньше 200 работ по байтам", () => {
    const source = work(true, 36),
      works = Array.from({ length: 6 }, () => ({
        ...source,
        id: crypto.randomUUID(),
      }));
    expect(() => exportSessions(works)).toThrow("20 МБ");
    const parts = prepareBackupParts(works);
    expect(parts.length).toBeGreaterThan(1);
    expect(
      parts.map((part) => part.sessionCount).reduce((a, b) => a + b, 0),
    ).toBe(6);
    expect(parts.every((part) => part.bytes <= backupMaxBytes)).toBe(true);
    expect(
      parts.flatMap((part) =>
        importSessions(part.json).map((session) => session.id),
      ),
    ).toEqual(works.map((session) => session.id));
  });
  it("слишком большая одиночная работа не получает невосстановимый экспорт", () => {
    const oversized = work(true, 210);
    expect(() => exportSessions([oversized])).toThrow("20 МБ");
    expect(() => prepareBackupParts([oversized])).toThrow("20 МБ");
  });
  it("отдельный предел импортера на размер одной работы не обходится копией по частям", () => {
    const oversized = work(true, 70);
    expect(() => exportSessions([oversized])).toThrow("3 млн символов");
    expect(() => prepareBackupParts([oversized])).toThrow("3 млн символов");
  });
  it("пустой или структурно повреждённый экспорт отклоняется до скачивания", () => {
    expect(() => exportSessions([])).toThrow("1 до 200");
    expect(() => prepareBackupParts([])).toThrow("Нет работ");
    const invalid = { ...work(), activeIndex: 999 };
    expect(() => exportSessions([invalid])).toThrow("не прошла проверку");
  });
});
