import { z } from "zod";
import { policySchema } from "../../../../src/lib/grading";
import type { PracticeSession } from "./model";
import { gradeExercise, itemId, validateVariant } from "./engine";
import { lineFor } from "./specification";

const prefix = "polina-oge-work-v1:";
const text = z.string().max(50000);
const exerciseSchema = z
  .object({
    id: z.string(),
    revision: z.number().int().positive(),
    title: text,
    prompt: text,
    exam: z.literal("OGE"),
    responseKind: z.enum(["short_text", "digits_sequence"]),
    answers: z.array(z.string()).min(1),
    policy: policySchema,
    maxScore: z.number(),
    topicId: z.string(),
    topicSlug: z.string(),
    topicTitle: text,
    skillId: z.string(),
    explanation: text,
    hint: text,
    options: z.array(text),
    optionExplanations: z.array(text),
    steps: z.array(text),
    input: z.string(),
    instruction: text,
    taskLine: z.number().int().min(2).max(12),
    examModel: z.object({
      year: z.number(),
      status: z.string(),
      sourceUrl: z.string(),
    }),
    source: z
      .object({ sourceTitle: text, author: text, licenseNote: text })
      .passthrough(),
    provenance: z.object({ rightsBasis: text }).passthrough(),
    reviewStatus: z.literal("checked-demo"),
  })
  .passthrough();
const writingSchema = z
  .object({
    id: z.string(),
    revision: z.number().int().positive(),
    line: z.union([z.literal(1), z.literal(13)]),
    title: text,
    sourceTextId: z.string(),
    prompts: z.array(z.object({ id: z.string(), label: text, text })).min(1),
    checklist: z.array(text),
    analysis: text,
  })
  .passthrough();
const schema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  title: text,
  kind: z.enum([
    "fixed-full",
    "fixed-test",
    "generated-full",
    "generated-test",
    "practice",
  ]),
  mode: z.enum(["learn", "control"]),
  specificationId: z.literal("oge-ru-2027-project"),
  seed: z.string(),
  items: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("exercise"), exercise: exerciseSchema }),
        z.object({ kind: z.literal("writing"), writing: writingSchema }),
      ]),
    )
    .min(1)
    .max(1000),
  texts: z.array(
    z.object({
      id: z.string(),
      revision: z.number(),
      title: text,
      paragraphs: z.array(text),
      kind: z.enum(["syntax", "reading", "summary"]),
      authorship: text,
      rightsBasis: text,
      reviewNote: text,
    }),
  ),
  audio: z.array(
    z.object({
      id: z.string(),
      revision: z.number(),
      textId: z.string(),
      path: z.string().regex(/^\/audio\/[a-z0-9-]+\.wav$/),
      durationSeconds: z.number().positive(),
      kind: z.literal("original-synthesized"),
      attribution: text,
      transcript: text,
    }),
  ),
  answers: z.record(z.string(), text),
  checkedIds: z.array(z.string()),
  selectedPrompts: z.record(z.string(), z.string()),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  durationMinutes: z.number().int().positive().max(300).optional(),
  activeIndex: z.number().int().nonnegative(),
  audioPlays: z.record(z.string(), z.number().int().nonnegative()),
  audioLastEndedAt: z.record(z.string(), z.iso.datetime()),
  originVariantId: z.string().optional(),
  audioCompletedPlays: z.record(z.string(), z.number().int().nonnegative()),
  audioPositions: z.record(z.string(), z.number().nonnegative()),
});
type LocalStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
export function parseSession(raw: string | null): PracticeSession | undefined {
  if (!raw || raw.length > 3_000_000) return undefined;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    if (!result.success) return undefined;
    const session = result.data as PracticeSession;
    const ids = session.items.map(itemId);
    if (
      new Set(ids).size !== ids.length ||
      session.activeIndex >= ids.length ||
      session.checkedIds.some((id) => !ids.includes(id))
    )
      return undefined;
    if (Object.keys(session.answers).some((id) => !ids.includes(id)))
      return undefined;
    if (
      Date.parse(session.updatedAt) < Date.parse(session.startedAt) ||
      (session.completedAt &&
        Date.parse(session.completedAt) < Date.parse(session.startedAt))
    )
      return undefined;
    if (
      new Set(session.texts.map((t) => t.id)).size !== session.texts.length ||
      new Set(session.audio.map((a) => a.id)).size !== session.audio.length
    )
      return undefined;
    for (const item of session.items) {
      const source =
        item.kind === "exercise"
          ? item.exercise.sourceTextId
          : item.writing.sourceTextId;
      if (source && !session.texts.some((t) => t.id === source))
        return undefined;
      if (item.kind === "exercise") {
        const e = item.exercise,
          line = lineFor(e.taskLine!);
        if (
          !line ||
          e.examModel.year !== 2027 ||
          e.examModel.status !== "project" ||
          e.input !== line.input ||
          e.responseKind !== line.response ||
          e.policy.orderMatters !== line.orderMatters ||
          e.answers.some((a) => gradeExercise(a, e).status !== "correct")
        )
          return undefined;
      } else {
        const writing = item.writing;
        if (
          (writing.line === 13 && writing.prompts.length !== 3) ||
          (writing.line === 1 &&
            !session.audio.some(
              (a) =>
                a.id === writing.audioId && a.textId === writing.sourceTextId,
            ))
        )
          return undefined;
        if (
          session.selectedPrompts[writing.id] &&
          !writing.prompts.some(
            (p) => p.id === session.selectedPrompts[writing.id],
          )
        )
          return undefined;
      }
    }
    if (
      Object.keys(session.selectedPrompts).some(
        (id) =>
          !session.items.some(
            (i) => i.kind === "writing" && i.writing.id === id,
          ),
      )
    )
      return undefined;
    if (session.kind !== "practice") {
      const variant = {
        id: session.id,
        number: 0,
        revision: 1,
        specificationId: session.specificationId,
        title: session.title,
        kind: session.kind.endsWith("full")
          ? ("full" as const)
          : ("test" as const),
        assignments: session.items.flatMap((i) =>
          i.kind === "exercise"
            ? [{ id: i.exercise.id, revision: i.exercise.revision }]
            : [],
        ),
        sourceTextIds: session.texts.map((t) => t.id),
        writingIds: session.items.flatMap((i) =>
          i.kind === "writing" ? [i.writing.id] : [],
        ),
        status: "published" as const,
        reviewStage: "publication-approved" as const,
        teacherApproval: "pending" as const,
      };
      validateVariant(variant, {
        texts: session.texts,
        audio: session.audio,
        exercises: session.items.flatMap((i) =>
          i.kind === "exercise" ? [i.exercise] : [],
        ),
        writing: session.items.flatMap((i) =>
          i.kind === "writing" ? [i.writing] : [],
        ),
      });
    }
    return session;
  } catch {
    return undefined;
  }
}
export function readSession(
  storage: LocalStorage,
  id: string,
): PracticeSession | undefined {
  try {
    const result = parseSession(storage.getItem(prefix + id));
    return result?.id === id ? result : undefined;
  } catch {
    return undefined;
  }
}
export function listSessions(storage: LocalStorage): PracticeSession[] {
  try {
    const results: PracticeSession[] = [];
    for (let n = 0; n < storage.length; n++) {
      const key = storage.key(n);
      if (key?.startsWith(prefix)) {
        const session = parseSession(storage.getItem(key));
        if (session) results.push(session);
      }
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}
export function saveSession(
  storage: LocalStorage,
  session: PracticeSession,
  previousUpdatedAt?: string,
): void {
  const existing = readSession(storage, session.id);
  if (existing && previousUpdatedAt && existing.updatedAt !== previousUpdatedAt)
    throw new Error(
      "Эта работа изменена в другой вкладке. Обновите страницу, чтобы продолжить с последним сохранённым черновиком. Текст текущего ответа можно скопировать перед обновлением.",
    );
  const raw = JSON.stringify(session);
  if (!parseSession(raw))
    throw new Error(
      "Черновик не прошёл проверку целостности. Скопируйте ответы перед закрытием страницы.",
    );
  try {
    storage.setItem(prefix + session.id, raw);
  } catch {
    throw new Error(
      "Браузер не сохранил черновик: хранилище недоступно или заполнено. Скопируйте ответы перед закрытием страницы; старые работы можно удалить в результатах.",
    );
  }
}
export function deleteSession(storage: LocalStorage, id: string) {
  storage.removeItem(prefix + id);
}
export function advanceSession(
  session: PracticeSession,
  patch: Partial<PracticeSession>,
): PracticeSession {
  return {
    ...session,
    ...patch,
    updatedAt: new Date(
      Math.max(Date.now(), Date.parse(session.updatedAt) + 1),
    ).toISOString(),
  };
}
