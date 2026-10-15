import { z } from "zod";
import { gameDraftSchema, gameRecordSchema } from "../oge/game-storage";
import { storageKey } from "../progress";

export const progressBackupMaxBytes = 20_000_000;
const lessonPrefix = "polina-lesson-state-v2:";
const draftPrefix = "polina-oge-game-drafts-v2:";
const positionPrefix = "polina-oge-game-position-v2:";
const recordKey = "polina-oge-games-v2";
const historicKey = "polina-oge-games-v1";
const short = z.string().max(1000);
const positive = z.number().int().nonnegative();
const result = z.looseObject({
  answer: z.string().max(100),
  status: z.enum(["correct", "incorrect", "format_error"]),
  exerciseId: short,
});
const attempts = z
  .array(
    z.looseObject({
      id: short,
      createdAt: z.iso.datetime(),
      exerciseId: short,
      revision: positive,
      skillId: short,
      repeat: z.boolean(),
      results: z.array(result).length(1),
    }),
  )
  .max(1000);
const historic = z
  .array(
    z.looseObject({
      id: short.optional(),
      activityId: short,
      situationId: short,
      createdAt: z.iso.datetime(),
    }),
  )
  .max(20000);
const reading = z.object({
  read: z.array(short).max(1000),
  last: short.optional(),
});
const checkpoint = z.object({
  selected: positive.max(100),
  checked: z.boolean(),
});
const interactive = z.object({
  index: positive.max(10000),
  cases: z.record(
    short,
    z.object({
      selected: z.array(positive.min(1).max(100)).max(100),
      checked: z.boolean(),
      checks: positive,
    }),
  ),
});
const writingMicrotask = z.object({
  text: z.string().max(4000),
  firstAnswer: z.string().max(4000).optional(),
  firstRecordedAt: z.iso.datetime().optional(),
  revealed: z.boolean(),
  assisted: z.boolean(),
  selfReviewed: z.boolean(),
});
const lesson = z.union([
  writingMicrotask,
  positive.max(10000),
  reading,
  checkpoint,
  interactive,
]);
const entry = z.object({
  key: z.string().min(1).max(1000),
  value: z.string().max(progressBackupMaxBytes),
});
const envelope = z.object({
  format: z.literal("polina-guest-progress"),
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  entries: z.array(entry).max(5000),
});
export type ProgressBackup = z.infer<typeof envelope>;
type StorageAccess = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
function allowed(key: string) {
  return (
    key === storageKey ||
    key === recordKey ||
    key === historicKey ||
    key.startsWith(lessonPrefix) ||
    key.startsWith(draftPrefix) ||
    key.startsWith(positionPrefix)
  );
}
function validateValue(key: string, raw: string) {
  if (!allowed(key))
    throw Error("В файле есть данные, не относящиеся к учебному прогрессу.");
  if (key.startsWith(positionPrefix)) {
    if (!/^[a-z0-9:_-]{1,1000}$/i.test(raw))
      throw Error("Повреждена позиция тренажёра.");
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error("Повреждена запись учебного прогресса.");
  }
  const schema =
    key === storageKey
      ? attempts
      : key === recordKey
        ? z.array(gameRecordSchema).max(20000)
        : key === historicKey
          ? historic
          : key.startsWith(draftPrefix)
            ? gameDraftSchema
            : lesson;
  if (
    !schema.safeParse(value).success ||
    (key.startsWith(lessonPrefix) && raw.length >= 100000)
  )
    throw Error("Запись учебного прогресса не прошла проверку структуры.");
  if (key.startsWith(draftPrefix)) {
    const draft = gameDraftSchema.parse(value);
    if (
      key !==
      draftPrefix +
        draft.activityId +
        ":" +
        draft.situationId +
        ":" +
        draft.revision
    )
      throw Error("Черновик тренажёра относится к другому упражнению.");
  }
  if (key === recordKey)
    for (const record of z.array(gameRecordSchema).parse(value)) {
      if (
        record.snapshot.situation.id !== record.situationId ||
        (record.snapshot.situation.revision ?? 1) !== record.revision
      )
        throw Error("Редакция результата тренажёра не совпадает со снимком.");
    }
}
export function parseProgressBackup(raw: string): ProgressBackup {
  if (
    raw.length > progressBackupMaxBytes ||
    bytes(raw) > progressBackupMaxBytes
  )
    throw Error("Файл прогресса превышает 20 МБ.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Error("Не удалось прочитать JSON учебного прогресса.");
  }
  const checked = envelope.safeParse(parsed);
  if (!checked.success)
    throw Error(
      "Это не резервная копия учебного прогресса. Копии работ восстанавливаются отдельной кнопкой.",
    );
  const keys = new Set<string>();
  for (const item of checked.data.entries) {
    if (keys.has(item.key))
      throw Error("В файле повторяется запись прогресса.");
    keys.add(item.key);
    validateValue(item.key, item.value);
  }
  return checked.data;
}
export function exportProgress(storage: StorageAccess): string {
  const entries: ProgressBackup["entries"] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key || !allowed(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) entries.push({ key, value });
  }
  if (!entries.length)
    throw Error(
      "Пока нет отметок уроков, отдельных попыток или результатов тренажёров для копии.",
    );
  entries.sort((a, b) => a.key.localeCompare(b.key));
  const raw = JSON.stringify({
    format: "polina-guest-progress",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    entries,
  });
  parseProgressBackup(raw);
  return raw;
}
export function restoreProgress(storage: StorageAccess, raw: string) {
  const backup = parseProgressBackup(raw);
  const plan: { key: string; value: string; previous: string | null }[] = [];
  let skipped = 0;
  for (const item of backup.entries) {
    const previous = storage.getItem(item.key);
    if (previous === item.value) {
      skipped++;
      continue;
    }
    if (previous !== null) {
      if (![storageKey, recordKey, historicKey].includes(item.key)) {
        skipped++;
        continue;
      }
      validateValue(item.key, previous);
      const existing = JSON.parse(previous) as { id?: string }[];
      const incoming = JSON.parse(item.value) as { id?: string }[];
      const ids = new Set(existing.filter((v) => v.id).map((v) => v.id));
      const additions = incoming.filter((v) =>
        v.id
          ? !ids.has(v.id)
          : !existing.some((old) => JSON.stringify(old) === JSON.stringify(v)),
      );
      if (!additions.length) {
        skipped++;
        continue;
      }
      if (item.key === storageKey && existing.length + additions.length > 1000)
        throw Error(
          "Объединённая история превышает 1000 отдельных попыток. Сохраните обе копии: импорт не начат, текущие результаты не изменены.",
        );
      const combined = [...existing, ...additions];
      const value = JSON.stringify(combined);
      validateValue(item.key, value);
      plan.push({ key: item.key, value, previous });
    } else plan.push({ ...item, previous });
  }
  const written: typeof plan = [];
  try {
    for (const item of plan) {
      storage.setItem(item.key, item.value);
      written.push(item);
    }
  } catch {
    let rollbackFailed = false;
    for (const item of written.reverse())
      try {
        if (item.previous === null) storage.removeItem(item.key);
        else storage.setItem(item.key, item.previous);
      } catch {
        rollbackFailed = true;
      }
    throw Error(
      rollbackFailed
        ? "Запись прервана, часть отметок могла восстановиться. Исходный файл копии сохранён; проверьте результаты после обновления страницы."
        : "Не удалось сохранить прогресс. Изменения отменены; освободите место в браузере или разрешите локальное хранение.",
    );
  }
  return { restored: plan.length, skipped };
}
export function downloadProgress(storage: StorageAccess) {
  const url = URL.createObjectURL(
    new Blob([exportProgress(storage)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download =
    "polina-guest-progress-" + new Date().toISOString().slice(0, 10) + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
