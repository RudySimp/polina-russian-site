import type { PracticeSession } from "./model";
import { parseSession } from "./storage";

export const backupMaxBytes = 20_000_000;
export function exportSessions(sessions: PracticeSession[]) {
  return JSON.stringify(
    {
      format: "polina-oge-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      reproduction: sessions.map(reproductionFor),
      sessions,
    },
    null,
    2,
  );
}
export function importSessions(raw: string): PracticeSession[] {
  if (
    raw.length > backupMaxBytes ||
    new TextEncoder().encode(raw).byteLength > backupMaxBytes
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
    value.sessions.length > 200
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
export function downloadBackup(sessions: PracticeSession[]) {
  const objectUrl = URL.createObjectURL(
    new Blob([exportSessions(sessions)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `polina-oge-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
