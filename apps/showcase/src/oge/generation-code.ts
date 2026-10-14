import { z } from "zod";
import catalogVersion from "../content/catalog-version.json";
import { loadExercises } from "../content/load";
import {
  createSession,
  eligible,
  validateVariant,
  type Materials,
} from "./engine";
import { loadOriginals } from "./materials";
import type { ExamVariant, PracticeSession, WorkItem } from "./model";
import { readSessionDurably } from "./repository";
import { specification } from "./specification";

export const generationCodeMaxBytes = 1_000_000;
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/u);
const ref = z.object({ id, revision: z.number().int().positive() }).strict();
const references = z.array(ref).max(1000);
const codeSchema = z
  .object({
    format: z.literal("polina-oge-generation"),
    version: z.literal(1),
    specificationId: z.literal("oge-ru-2027-project"),
    catalogVersion: z.string().min(1).max(100),
    generationVersion: z.union([z.literal(1), z.literal(2)]),
    seed: z.string().min(1).max(1000),
    kind: z.enum([
      "fixed-full",
      "fixed-test",
      "generated-full",
      "generated-test",
      "practice",
    ]),
    mode: z.enum(["learn", "control"]),
    snapshotId: z.uuid().optional(),
    title: z.string().trim().min(1).max(50000).optional(),
    originVariantId: id.optional(),
    assignments: z
      .array(ref.extend({ kind: z.enum(["exercise", "writing"]) }))
      .min(1)
      .max(1000),
    texts: references,
    audio: references,
    selectedPrompts: z.record(id, z.string().min(1).max(200)),
  })
  .strict();
type Code = z.infer<typeof codeSchema>;
function sameRefs(
  a: { id: string; revision: number; kind?: string }[],
  b: { id: string; revision: number; kind?: string }[],
) {
  return (
    a.length === b.length &&
    a.every(
      (ref, n) =>
        ref.id === b[n].id &&
        ref.revision === b[n].revision &&
        (ref.kind === undefined || ref.kind === b[n].kind),
    )
  );
}
function parse(raw: string): Code {
  if (
    raw.length > generationCodeMaxBytes ||
    new TextEncoder().encode(raw).byteLength > generationCodeMaxBytes
  )
    throw Error("Код состава слишком большой: максимум 1 МБ.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error("Код состава должен содержать корректный JSON.");
  }
  const parsed = codeSchema.safeParse(value);
  if (!parsed.success)
    throw Error(
      "Неизвестный формат кода состава или неверные поля модели, режима и редакций. Используйте файл кода, скачанный из работы.",
    );
  const code = parsed.data;
  for (const refs of [code.assignments, code.texts, code.audio])
    if (new Set(refs.map((ref) => ref.id)).size !== refs.length)
      throw Error(
        "В коде состава повторяется идентификатор задания, текста или аудио.",
      );
  if (Object.keys(code.selectedPrompts).length > 1000)
    throw Error("Слишком много выбранных письменных тем.");
  return code;
}
function checkPrompts(code: Code, items: WorkItem[]) {
  for (const [writingId, promptId] of Object.entries(code.selectedPrompts)) {
    const item = items.find(
      (item) => item.kind === "writing" && item.writing.id === writingId,
    );
    if (
      item?.kind !== "writing" ||
      !item.writing.prompts.some((prompt) => prompt.id === promptId)
    )
      throw Error(
        "Выбранная письменная тема отсутствует в сохранённой редакции задания.",
      );
  }
}
function archiveMatches(code: Code, session: PracticeSession) {
  return (
    session.specificationId === code.specificationId &&
    (session.catalogVersion ?? "legacy-snapshot") === code.catalogVersion &&
    (session.generationVersion ?? 1) === code.generationVersion &&
    session.seed === code.seed &&
    session.kind === code.kind &&
    (!code.originVariantId ||
      code.originVariantId === session.originVariantId) &&
    sameRefs(
      code.assignments,
      session.items.map((item) => ({
        kind: item.kind,
        id: item.kind === "exercise" ? item.exercise.id : item.writing.id,
        revision:
          item.kind === "exercise"
            ? item.exercise.revision
            : item.writing.revision,
      })),
    ) &&
    sameRefs(code.texts, session.texts) &&
    sameRefs(code.audio, session.audio)
  );
}
function restart(code: Code, session: PracticeSession): PracticeSession {
  checkPrompts(code, session.items);
  const now = new Date().toISOString();
  return {
    ...structuredClone(session),
    id: crypto.randomUUID(),
    title: code.title ?? session.title,
    mode: code.mode,
    catalogVersion: code.catalogVersion,
    generationVersion: code.generationVersion,
    selectedPrompts: { ...code.selectedPrompts },
    answers: {},
    checkedIds: [],
    writingReviews: {},
    startedAt: now,
    updatedAt: now,
    completedAt: undefined,
    endedByTimeout: undefined,
    activeIndex: 0,
    audioPlays: {},
    audioPositions: {},
    audioCompletedPlays: {},
    audioLastEndedAt: {},
    durationMinutes:
      code.mode === "control" && code.kind.endsWith("-full")
        ? specification.durationMinutes
        : undefined,
  };
}
const oldCodeMessage =
  "Эта редакция банка или алгоритма отсутствует на сайте, и подходящий сохранённый снимок не найден. Восстановите полную резервную копию работы: один код состава не содержит старые условия.";
/** Restores a recipe without saving or replacing any existing local work. */
export async function restoreGenerationCode(
  raw: string,
): Promise<PracticeSession> {
  const code = parse(raw);
  if (code.snapshotId) {
    const archived = await readSessionDurably(code.snapshotId);
    if (archived) {
      if (!archiveMatches(code, archived))
        throw Error(
          "Код не совпадает с сохранённым снимком работы: отличаются состав, редакции или модель. Используйте исходный код или полную резервную копию.",
        );
      return restart(code, archived);
    }
  }
  if (
    code.catalogVersion !== catalogVersion.version ||
    code.generationVersion !== 2
  )
    throw Error(oldCodeMessage);
  const [originals, conditions] = await Promise.all([
    loadOriginals(),
    loadExercises(
      code.assignments
        .filter((ref) => ref.kind === "exercise")
        .map((ref) => ref.id),
    ),
  ]);
  const items: WorkItem[] = code.assignments.map((ref) => {
    if (ref.kind === "exercise") {
      const exercise = conditions.find(
        (item) => item.id === ref.id && item.revision === ref.revision,
      );
      if (!exercise || !eligible(exercise))
        throw Error(
          "Не найдена проверенная редакция задания " +
            ref.id +
            ". Используйте полную резервную копию.",
        );
      return { kind: "exercise", exercise };
    }
    const writing = originals.writing.find(
      (item) => item.id === ref.id && item.revision === ref.revision,
    );
    if (!writing || !writing.prompts.length || !writing.analysis.trim())
      throw Error(
        "Не найдена редакция письменного задания " +
          ref.id +
          ". Используйте полную резервную копию.",
      );
    return { kind: "writing", writing };
  });
  const texts = code.texts.map((ref) => {
    const text = originals.texts.find(
      (item) => item.id === ref.id && item.revision === ref.revision,
    );
    if (!text || !text.rightsBasis.trim() || !text.paragraphs.length)
      throw Error(
        "Не найдена редакция исходного текста " +
          ref.id +
          ". Используйте полную резервную копию.",
      );
    return text;
  });
  const audio = code.audio.map((ref) => {
    const material = originals.audio.find(
      (item) => item.id === ref.id && item.revision === ref.revision,
    );
    if (
      !material ||
      !/^\/audio\/[a-z0-9-]+\.(?:wav|mp3)$/u.test(material.path) ||
      material.durationSeconds <= 0 ||
      !texts.some((text) => text.id === material.textId)
    )
      throw Error(
        "Не найдена согласованная редакция аудиозаписи " +
          ref.id +
          ". Используйте полную резервную копию.",
      );
    return material;
  });
  for (const item of items) {
    const sourceTextId =
      item.kind === "exercise"
        ? item.exercise.sourceTextId
        : item.writing.sourceTextId;
    if (sourceTextId && !texts.some((text) => text.id === sourceTextId))
      throw Error("В коде отсутствует исходный текст одного из заданий.");
    if (
      item.kind === "writing" &&
      item.writing.line === 1 &&
      !audio.some(
        (material) =>
          material.id === item.writing.audioId &&
          material.textId === sourceTextId,
      )
    )
      throw Error("Для изложения в коде отсутствует согласованное аудио.");
  }
  checkPrompts(code, items);
  const materials: Materials = {
    exercises: conditions,
    writing: items.flatMap((item) =>
      item.kind === "writing" ? [item.writing] : [],
    ),
    texts,
    audio,
  };
  const exerciseRefs = code.assignments.filter(
      (ref) => ref.kind === "exercise",
    ),
    writingIds = code.assignments
      .filter((ref) => ref.kind === "writing")
      .map((ref) => ref.id);
  const matchingOrigin = originals.variants.find(
    (variant) =>
      (!code.originVariantId || variant.id === code.originVariantId) &&
      sameRefs(
        variant.assignments.map((ref) => ({ ...ref, kind: "exercise" })),
        exerciseRefs,
      ) &&
      variant.writingIds.length === writingIds.length &&
      variant.writingIds.every((id) => writingIds.includes(id)) &&
      variant.sourceTextIds.length === texts.length &&
      variant.sourceTextIds.every((id) => texts.some((text) => text.id === id)),
  );
  if (code.kind.startsWith("fixed-") && !matchingOrigin)
    throw Error(
      "Код не совпадает с опубликованным фиксированным вариантом. Используйте исходный код или полную резервную копию.",
    );
  if (code.kind !== "practice") {
    const variant: ExamVariant = {
      id: matchingOrigin?.id ?? "restored-" + code.seed,
      number: matchingOrigin?.number ?? 0,
      revision: 1,
      specificationId: code.specificationId,
      title:
        code.title ?? matchingOrigin?.title ?? "Восстановленный состав ОГЭ",
      kind: code.kind.endsWith("-full") ? "full" : "test",
      assignments: exerciseRefs,
      sourceTextIds: texts.map((text) => text.id),
      writingIds,
      status: "published",
      reviewStage: "publication-approved",
      teacherApproval: "pending",
      seed: code.seed,
    };
    validateVariant(variant, materials);
  }
  const session = createSession(items, materials, {
    title: code.title ?? matchingOrigin?.title ?? "Восстановленная работа ОГЭ",
    kind: code.kind,
    mode: code.mode,
    seed: code.seed,
    timed: code.mode === "control" && code.kind.endsWith("-full"),
    variant: matchingOrigin,
  });
  // Retain exactly the text/audio references explicitly supplied in the code, including harmless context carried by a practice snapshot.
  session.texts = structuredClone(texts);
  session.audio = structuredClone(audio);
  session.selectedPrompts = { ...code.selectedPrompts };
  return session;
}
