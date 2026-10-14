import { z } from "zod";
import { policySchema } from "../../../../src/lib/grading";
import type { PracticeSession } from "./model";
import { gradeExercise, itemId, validateVariant } from "./engine";
import { lineFor } from "./specification";
import {
  summaryCriteria,
  essayCriteria,
  literacyCriteria,
  literacyReviewId,
} from "./writing-rubric";

export const sessionKeyPrefix = "polina-oge-work-v1:";
const prefix = sessionKeyPrefix;
export class SessionStorageError extends Error {
  constructor(
    public readonly code: "conflict" | "unavailable" | "invalid",
    message: string,
    public readonly remote?: PracticeSession,
  ) {
    super(message);
    this.name = "SessionStorageError";
  }
}
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
  catalogVersion: z.string().max(100).optional(),
  generationVersion: z.union([z.literal(1), z.literal(2)]).optional(),
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
      path: z.string().regex(/^\/audio\/[a-z0-9-]+\.(?:wav|mp3)$/),
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
  writingReviews: z
    .record(
      z.string(),
      z.object({
        checks: z.array(z.number().int().nonnegative()).max(50),
        note: text,
        role: z.enum(["self", "expert"]),
        scores: z.record(z.string(), z.number().int().nonnegative().max(4)),
        reviewer: z.string().max(200).optional(),
        reviewedAt: z.iso.datetime().optional(),
        promptId: z.string().optional(),
        contentAccepted: z.boolean().optional(),
      }),
    )
    .optional(),
  endedByTimeout: z.boolean().optional(),
});
export type LocalStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
const statePrefix = "polina-oge-state-v2:";
const indexPrefix = "polina-oge-index-v2:";
export const sessionStateKeyPrefix = statePrefix;
const snapshotCache = new Map<
  string,
  { raw: string; session: PracticeSession }
>();
const mutableSchema = schema.pick({
  answers: true,
  checkedIds: true,
  selectedPrompts: true,
  updatedAt: true,
  completedAt: true,
  activeIndex: true,
  audioPlays: true,
  audioLastEndedAt: true,
  audioCompletedPlays: true,
  audioPositions: true,
  writingReviews: true,
  endedByTimeout: true,
});
export function sessionState(session: PracticeSession) {
  return mutableSchema.parse(session);
}
export type SessionSummary = Pick<
  PracticeSession,
  "id" | "title" | "kind" | "mode" | "startedAt" | "updatedAt" | "completedAt"
> & {
  historyVersion: 2;
  itemCount: number;
  answerCount: number;
  originVariantId?: string;
  exerciseRefs: {
    id: string;
    revision: number;
    sourceTextId?: string;
    answered: boolean;
    checked: boolean;
    status?: "correct" | "incorrect" | "format_error";
  }[];
  writingRefs: {
    id: string;
    revision: number;
    sourceTextId: string;
    answered: boolean;
  }[];
  textRefs: { id: string; revision: number }[];
  audioRefs: {
    id: string;
    revision: number;
    textId: string;
    played: boolean;
  }[];
};
export function sessionSummary(session: PracticeSession): SessionSummary {
  return {
    historyVersion: 2,
    id: session.id,
    title: session.title,
    kind: session.kind,
    mode: session.mode,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
    itemCount: session.items.length,
    answerCount: Object.values(session.answers).filter((answer) =>
      answer.trim(),
    ).length,
    originVariantId: session.originVariantId,
    exerciseRefs: session.items.flatMap((item) => {
      if (item.kind !== "exercise") return [];
      const answer = session.answers[item.exercise.id] ?? "";
      const checked =
        !!session.completedAt || session.checkedIds.includes(item.exercise.id);
      return [
        {
          id: item.exercise.id,
          revision: item.exercise.revision,
          sourceTextId: item.exercise.sourceTextId,
          answered: !!answer.trim(),
          checked,
          ...(checked && answer.trim()
            ? { status: gradeExercise(answer, item.exercise).status }
            : {}),
        },
      ];
    }),
    writingRefs: session.items.flatMap((item) =>
      item.kind === "writing"
        ? [
            {
              id: item.writing.id,
              revision: item.writing.revision,
              sourceTextId: item.writing.sourceTextId,
              answered: !!session.answers[item.writing.id]?.trim(),
            },
          ]
        : [],
    ),
    textRefs: session.texts.map((text) => ({
      id: text.id,
      revision: text.revision,
    })),
    audioRefs: session.audio.map((audio) => ({
      id: audio.id,
      revision: audio.revision,
      textId: audio.textId,
      played: !!session.audioPlays[audio.id],
    })),
  };
}
const summarySchema = schema
  .pick({
    id: true,
    title: true,
    kind: true,
    mode: true,
    startedAt: true,
    updatedAt: true,
    completedAt: true,
  })
  .extend({
    historyVersion: z.literal(2),
    itemCount: z.number().int().min(1).max(1000),
    answerCount: z.number().int().nonnegative().max(1000),
    originVariantId: z.string().optional(),
    exerciseRefs: z
      .array(
        z.object({
          id: z.string(),
          revision: z.number().int().positive(),
          sourceTextId: z.string().optional(),
          answered: z.boolean(),
          checked: z.boolean(),
          status: z.enum(["correct", "incorrect", "format_error"]).optional(),
        }),
      )
      .max(1000),
    writingRefs: z
      .array(
        z.object({
          id: z.string(),
          revision: z.number().int().positive(),
          sourceTextId: z.string(),
          answered: z.boolean(),
        }),
      )
      .max(1000),
    textRefs: z
      .array(
        z.object({ id: z.string(), revision: z.number().int().positive() }),
      )
      .max(1000),
    audioRefs: z
      .array(
        z.object({
          id: z.string(),
          revision: z.number().int().positive(),
          textId: z.string(),
          played: z.boolean(),
        }),
      )
      .max(1000),
  });
/** A compact cache is trusted only when it matches the current history format. */
export function parseSessionSummary(
  value: unknown,
): SessionSummary | undefined {
  const parsed = summarySchema.safeParse(value);
  if (!parsed.success) return undefined;
  const summary = parsed.data;
  if (
    summary.itemCount !==
      summary.exerciseRefs.length + summary.writingRefs.length ||
    summary.answerCount > summary.itemCount ||
    Date.parse(summary.updatedAt) < Date.parse(summary.startedAt)
  )
    return undefined;
  return summary;
}

function snapshot(raw: string | null): PracticeSession | undefined {
  if (!raw) return undefined;
  const key = raw.slice(0, 500);
  const cached = snapshotCache.get(key);
  if (cached?.raw === raw) return cached.session;
  const session = parseSession(raw);
  if (session) {
    if (snapshotCache.size >= 100)
      snapshotCache.delete(snapshotCache.keys().next().value!);
    snapshotCache.set(key, { raw, session });
  }
  return session;
}
export function applySessionState(
  base: PracticeSession,
  value: unknown,
): PracticeSession | undefined {
  const parsed = mutableSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const state = parsed.data;
  const ids = base.items.map(itemId);
  if (
    state.activeIndex >= ids.length ||
    Object.keys(state.answers).some((id) => !ids.includes(id)) ||
    state.checkedIds.some((id) => !ids.includes(id)) ||
    Date.parse(state.updatedAt) < Date.parse(base.startedAt) ||
    (state.completedAt &&
      Date.parse(state.completedAt) < Date.parse(base.startedAt))
  )
    return undefined;
  for (const [id, prompt] of Object.entries(state.selectedPrompts))
    if (
      !base.items.some(
        (item) =>
          item.kind === "writing" &&
          item.writing.id === id &&
          item.writing.prompts.some((p) => p.id === prompt),
      )
    )
      return undefined;
  if (!validReviews(base, state.writingReviews)) return undefined;
  return { ...base, ...state };
}
function validReviews(
  base: PracticeSession,
  reviews: PracticeSession["writingReviews"],
) {
  for (const [id, review] of Object.entries(reviews ?? {})) {
    const writing = base.items.find(
      (item) =>
        item.kind === "writing" &&
        (item.writing.id === id ||
          (review.promptId && id === `${item.writing.id}:${review.promptId}`)),
    );
    if (id !== literacyReviewId && writing?.kind !== "writing") return false;
    const criteria =
      id === literacyReviewId
        ? literacyCriteria
        : writing?.kind === "writing" && writing.writing.line === 1
          ? summaryCriteria
          : essayCriteria;
    if (
      Object.entries(review.scores).some(([code, score]) => {
        const criterion = criteria.find((item) => item.code === code);
        return !criterion || score >= criterion.levels.length;
      })
    )
      return false;
    if (
      writing?.kind === "writing" &&
      (review.checks.some((n) => n >= writing.writing.checklist.length) ||
        (review.promptId &&
          !writing.writing.prompts.some((p) => p.id === review.promptId)))
    )
      return false;
    if (
      review.reviewedAt &&
      Date.parse(review.reviewedAt) < Date.parse(base.startedAt)
    )
      return false;
  }
  return true;
}
function readSessionStrict(storage: LocalStorage, id: string) {
  const base = snapshot(storage.getItem(prefix + id));
  if (base?.id !== id) return undefined;
  const raw = storage.getItem(statePrefix + id);
  if (!raw) return base;
  try {
    const entry = JSON.parse(raw);
    // A legacy application may have written a newer complete snapshot.
    if (entry.snapshotUpdatedAt !== base.updatedAt) return base;
    const applied = applySessionState(base, entry.state);
    if (!applied) throw new Error("Invalid mutable draft");
    return applied;
  } catch {
    throw new SessionStorageError(
      "invalid",
      "Сохранённые ответы повреждены. Исходная запись сохранена без изменений; восстановите резервную копию или доступную редакцию из IndexedDB.",
    );
  }
}
export function parseSession(raw: string | null): PracticeSession | undefined {
  if (!raw || raw.length > 3_000_000) return undefined;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    if (!result.success) return undefined;
    const session = result.data as PracticeSession;
    if (!validReviews(session, session.writingReviews)) return undefined;
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
    const result = readSessionStrict(storage, id);
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
        const session = readSession(storage, key.slice(prefix.length));
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
  let existing: PracticeSession | undefined;
  try {
    existing = readSessionStrict(storage, session.id);
  } catch (error) {
    if (error instanceof SessionStorageError) throw error;
    throw new SessionStorageError(
      "unavailable",
      "Хранилище недоступно для чтения. Последние ответы остаются на странице; повторите запись или скачайте копию.",
    );
  }
  if (
    existing &&
    ((previousUpdatedAt && existing.updatedAt !== previousUpdatedAt) ||
      existing.updatedAt > session.updatedAt)
  )
    throw new SessionStorageError(
      "conflict",
      "Эта работа изменена в другой вкладке. Ваш текущий текст остаётся на этой странице. Сохраните его отдельной работой или экспортируйте обе редакции.",
      existing,
    );
  const state = applySessionState(session, sessionState(session));
  const raw = existing ? undefined : JSON.stringify(session);
  if (!state || (raw && !parseSession(raw)))
    throw new SessionStorageError(
      "invalid",
      "Черновик не прошёл проверку целостности. Скопируйте ответы перед закрытием страницы.",
    );
  try {
    if (raw) storage.setItem(prefix + session.id, raw);
    else {
      const base = snapshot(storage.getItem(prefix + session.id))!;
      storage.setItem(
        statePrefix + session.id,
        JSON.stringify({
          snapshotUpdatedAt: base.updatedAt,
          state: sessionState(session),
        }),
      );
    }
  } catch {
    throw new SessionStorageError(
      "unavailable",
      "Браузер не сохранил черновик: хранилище недоступно или заполнено. Текущий текст остаётся на странице. Повторите сохранение, скопируйте ответы или скачайте резервный файл перед закрытием.",
    );
  }
  // The durable draft is already written. A failed optional index cannot make
  // that write appear to have failed, and the list can rebuild it from v1 data.
  try {
    storage.setItem(
      indexPrefix + session.id,
      JSON.stringify(sessionSummary(session)),
    );
  } catch {
    /* Rebuilt on demand. */
  }
}
export function deleteSession(storage: LocalStorage, id: string) {
  storage.removeItem(prefix + id);
  storage.removeItem(statePrefix + id);
  storage.removeItem(indexPrefix + id);
}
export function listSessionSummaries(storage: LocalStorage): SessionSummary[] {
  const summaries: SessionSummary[] = [];
  try {
    for (let n = 0; n < storage.length; n++) {
      const key = storage.key(n);
      if (!key?.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      let summary: SessionSummary | undefined;
      try {
        const raw = storage.getItem(indexPrefix + id);
        const value = raw ? JSON.parse(raw) : undefined;
        const stateRaw = storage.getItem(statePrefix + id);
        const stateTime = stateRaw
          ? JSON.parse(stateRaw)?.state?.updatedAt
          : undefined;
        const checked = parseSessionSummary(value);
        if (
          checked?.id === id &&
          (!stateTime || checked.updatedAt === stateTime)
        )
          summary = checked;
      } catch {
        /* A legacy record or damaged optional index is rebuilt. */
      }
      if (!summary) {
        const work = readSession(storage, id);
        if (work) {
          summary = sessionSummary(work);
          try {
            storage.setItem(indexPrefix + id, JSON.stringify(summary));
          } catch {
            /* An optional cache must not change readable works. */
          }
        }
      }
      if (summary) summaries.push(summary);
    }
  } catch {
    /* Return readable records without removing damaged ones. */
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
