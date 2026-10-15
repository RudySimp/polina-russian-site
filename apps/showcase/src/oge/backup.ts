import type { PracticeSession } from "./model";
import { parseSession } from "./storage";
import { sessionLimits, serializedSessionBytes } from "./session-limits";

export const backupMaxBytes = 20_000_000;
export const backupMaxSessions = 200;
export type BackupPart = { json: string; sessionCount: number; bytes: number };
const encoder = new TextEncoder();
type BackupEntry = { session: string; reproduction: string; bytes: number };
function backupEntry(session: PracticeSession, index: number): BackupEntry {
  const json = JSON.stringify(session);
  const sessionBytes = serializedSessionBytes(json);
  if (sessionBytes > backupMaxBytes)
    throw Error(
      "Работа «" +
        session.title +
        "» превышает лимит одного файла 20 МБ. Скачивание не начато; исходная работа остаётся в браузере.",
    );
  if (json.length > sessionLimits.maxSerializedChars)
    throw Error(
      "Работа «" +
        session.title +
        "» слишком большая для восстановления: максимум 3 млн символов в одной работе. Данные работы не изменены.",
    );
  if (!parseSession(json))
    throw Error(
      "Работа " +
        (index + 1) +
        " не прошла проверку. Резервная копия не создана; данные работ не изменены.",
    );
  const reproduction = JSON.stringify(reproductionFor(session));
  return {
    session: json,
    reproduction,
    bytes: sessionBytes + encoder.encode(reproduction).byteLength,
  };
}
function backupJson(entries: BackupEntry[], exportedAt: string) {
  return (
    JSON.stringify({
      format: "polina-oge-backup",
      version: 1,
      exportedAt,
    }).slice(0, -1) +
    ',"reproduction":[' +
    entries.map((entry) => entry.reproduction).join(",") +
    '],"sessions":[' +
    entries.map((entry) => entry.session).join(",") +
    "]}"
  );
}
export function exportSessions(sessions: PracticeSession[]) {
  if (!sessions.length || sessions.length > backupMaxSessions)
    throw Error(
      "В одном резервном файле должно быть от 1 до 200 работ. Для всей истории подготовьте копию по частям.",
    );
  const json = backupJson(sessions.map(backupEntry), new Date().toISOString());
  if (encoder.encode(json).byteLength > backupMaxBytes)
    throw Error(
      "Резервная копия превышает 20 МБ. Подготовьте копию всей истории по частям; данные работ не изменены.",
    );
  return json;
}
/** Each independently importable v1 file obeys both the session and UTF-8 limits. */
export function prepareBackupParts(sessions: PracticeSession[]): BackupPart[] {
  if (!sessions.length) throw Error("Нет работ для резервной копии.");
  const exportedAt = new Date().toISOString(),
    baseBytes = encoder.encode(backupJson([], exportedAt)).byteLength;
  const parts: BackupPart[] = [];
  let entries: BackupEntry[] = [],
    bytes = baseBytes;
  const finish = () => {
    const json = backupJson(entries, exportedAt);
    parts.push({
      json,
      sessionCount: entries.length,
      bytes: encoder.encode(json).byteLength,
    });
    entries = [];
    bytes = baseBytes;
  };
  for (const [index, session] of sessions.entries()) {
    const entry = backupEntry(session, index);
    if (baseBytes + entry.bytes > backupMaxBytes)
      throw Error(
        "Работа «" +
          session.title +
          "» превышает лимит одного файла 20 МБ. Скачивание не начато; исходная работа остаётся в браузере.",
      );
    const additional = entry.bytes + (entries.length ? 2 : 0);
    if (
      entries.length >= backupMaxSessions ||
      bytes + additional > backupMaxBytes
    )
      finish();
    bytes += entry.bytes + (entries.length ? 2 : 0);
    entries.push(entry);
  }
  if (entries.length) finish();
  return parts;
}
export function importSessions(raw: string): PracticeSession[] {
  if (
    raw.length > backupMaxBytes ||
    serializedSessionBytes(raw) > backupMaxBytes
  )
    throw new Error("Резервный файл слишком большой (максимум 20 МБ).");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Файл не содержит корректного JSON.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("format" in value) ||
    value.format !== "polina-oge-backup" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("sessions" in value) ||
    !Array.isArray(value.sessions) ||
    value.sessions.length < 1 ||
    value.sessions.length > backupMaxSessions
  )
    throw new Error(
      "Неизвестная структура или версия резервной копии. Исходные работы не изменены.",
    );
  return value.sessions.map((entry, n) => {
    const session = parseSession(JSON.stringify(entry));
    if (!session)
      throw new Error(
        `Работа ${n + 1} не прошла проверку структуры, редакций или связей. Импорт не начат.`,
      );
    return session;
  });
}
function downloadBackupJson(json: string, filename: string) {
  const objectUrl = URL.createObjectURL(
    new Blob([json], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
export function downloadBackup(sessions: PracticeSession[]) {
  downloadBackupJson(
    exportSessions(sessions),
    "polina-oge-" + new Date().toISOString().slice(0, 10) + ".json",
  );
}
export function downloadBackupPart(
  part: BackupPart,
  index: number,
  total: number,
) {
  if (
    part.sessionCount < 1 ||
    part.sessionCount > backupMaxSessions ||
    encoder.encode(part.json).byteLength > backupMaxBytes
  )
    throw Error("Часть резервной копии превышает допустимые границы.");
  downloadBackupJson(
    part.json,
    "polina-oge-" +
      new Date().toISOString().slice(0, 10) +
      "-part-" +
      index +
      "-of-" +
      total +
      ".json",
  );
}
export function sessionAnswerText(session: PracticeSession) {
  return [
    session.title,
    ...session.items.map((item, n) => {
      const id = item.kind === "exercise" ? item.exercise.id : item.writing.id;
      const title =
        item.kind === "exercise" ? item.exercise.title : item.writing.title;
      const prompt =
        item.kind === "writing"
          ? (item.writing.prompts.find(
              (p) => p.id === session.selectedPrompts[id],
            ) ?? item.writing.prompts[0])
          : undefined;
      return `${n + 1}. ${title}${prompt ? `\n${prompt.label}: ${prompt.text}` : ""}\n${session.answers[id] || "Без ответа"}`;
    }),
  ].join("\n\n");
}

export function reproductionFor(session: PracticeSession) {
  return {
    format: "polina-oge-generation",
    snapshotId: session.id,
    title: session.title,
    originVariantId: session.originVariantId,
    version: 1,
    specificationId: session.specificationId,
    catalogVersion: session.catalogVersion ?? "legacy-snapshot",
    generationVersion: session.generationVersion ?? 1,
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
    texts: session.texts.map((t) => ({ id: t.id, revision: t.revision })),
    audio: session.audio.map((a) => ({ id: a.id, revision: a.revision })),
    selectedPrompts: session.selectedPrompts,
  };
}
export function downloadGenerationCode(session: PracticeSession) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(reproductionFor(session), null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "polina-oge-code-" + session.id.slice(0, 8) + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
