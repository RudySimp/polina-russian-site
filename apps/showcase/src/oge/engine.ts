import type { ExerciseSummary } from "../content/catalog";
import catalogVersion from "../content/catalog-version.json" with { type: "json" };
import { gradeAnswer, type Grade } from "../../../../src/lib/grading";
import type { Exercise } from "../content/model";
import type {
  AudioMaterial,
  ExamVariant,
  PracticeSession,
  SourceText,
  WorkItem,
  WritingAssignment,
} from "./model";
import { specification, testLines, lineFor } from "./specification";
import { vowelExerciseIssues } from "../../../../scripts/lib/content-integrity";

export type Materials = {
  exercises: Exercise[];
  texts: SourceText[];
  audio: AudioMaterial[];
  writing: WritingAssignment[];
};
export type Selection = {
  lines?: number[];
  topicId?: string;
  skillId?: string;
  level?: string;
  count: number | "all";
  only?: "new" | "errors";
  seenIds?: string[];
  errorIds?: string[];
  seenWritingIds?: string[];
  seenTextIds?: string[];
  seenAudioIds?: string[];
};
export function shuffled<T>(values: T[], seed: string): T[] {
  let state = 2166136261;
  for (const char of seed)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const random = () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...values];
  for (let n = result.length - 1; n > 0; n--) {
    const k = Math.floor(random() * (n + 1));
    [result[n], result[k]] = [result[k], result[n]];
  }
  return result;
}
export function eligible(exercise: Exercise) {
  return (
    exercise.exam === "OGE" &&
    exercise.examModel.year === specification.year &&
    exercise.examModel.status === specification.status &&
    exercise.reviewStatus === "checked-demo" &&
    !!exercise.prompt?.trim() &&
    !!exercise.explanation?.trim() &&
    !!exercise.provenance?.rightsBasis?.trim() &&
    exercise.source.rightsStatus !== "unknown" &&
    ["answer-checked", "explanation-checked", "publication-approved"].every(
      (stage) =>
        exercise.reviewStages?.some(
          (review) =>
            review.stage === stage &&
            review.by.trim() &&
            Number.isFinite(Date.parse(review.at)),
        ),
    ) &&
    (exercise.taskLine !== 7 || vowelExerciseIssues(exercise).length === 0) &&
    (!exercise.publicationReview ||
      (exercise.publicationReview.revision === exercise.revision &&
        [
          exercise.publicationReview.condition,
          exercise.publicationReview.key,
          exercise.publicationReview.alternatives,
          exercise.publicationReview.explanation,
          exercise.publicationReview.rights,
        ].every(Boolean))) &&
    !!exercise.answers.length &&
    exercise.answers.every(
      (answer) => gradeExercise(answer, exercise).status === "correct",
    )
  );
}
export function answerPositions(exercise: Exercise): number[] {
  if (exercise.options.length) return exercise.options.map((_, n) => n + 1);
  return [
    ...new Set(
      [
        ...((exercise.text ?? "") + exercise.prompt).matchAll(/\((\d+)\)/gu),
      ].map((m) => Number(m[1])),
    ),
  ];
}
export function gradeExercise(answer: string, exercise: Exercise): Grade {
  if (exercise.responseKind === "digits_sequence") {
    const value = exercise.policy.allowDigitSeparators
      ? answer.replace(/[ ,]/gu, "").trim()
      : answer.trim();
    const positions = answerPositions(exercise);
    if (
      /^[1-9]+$/u.test(value) &&
      positions.length &&
      [...value].some((char) => !positions.includes(Number(char)))
    )
      return {
        status: "format_error",
        score: 0,
        maxScore: exercise.maxScore,
        message: `В условии доступны только позиции ${positions.join(", ")}. Укажите их номера.`,
      };
    if (
      exercise.input === "matching" &&
      value.length !== (exercise.rules?.length ?? 3)
    )
      return {
        status: "format_error",
        score: 0,
        maxScore: exercise.maxScore,
        message: `Запишите ${exercise.rules?.length ?? 3} цифры в порядке правил А–Б–В.`,
      };
  }
  const line =
    exercise.exam === "OGE" ? lineFor(exercise.taskLine ?? 0) : undefined;
  if (line?.response === "short_text" && !/^[а-яё\s-]+$/iu.test(answer.trim()))
    return {
      status: "format_error",
      score: 0,
      maxScore: exercise.maxScore,
      message: "Введите ответ русскими буквами, без цифр и знаков препинания.",
    };
  if (line?.number === 8 && /\s/u.test(answer.trim()))
    return {
      status: "format_error",
      score: 0,
      maxScore: exercise.maxScore,
      message: "В этом задании требуется одно слово.",
    };
  if (line && [9, 12].includes(line.number))
    return gradeAnswer(answer.replace(/\s/gu, ""), {
      ...exercise,
      answers: exercise.answers.map((a) => a.replace(/\s/gu, "")),
    });
  return gradeAnswer(answer, exercise);
}
export function selectPractice(
  bank: Exercise[],
  selection: Selection,
  seed: string,
): Exercise[] {
  const pool = bank.filter(
    (e) =>
      eligible(e) &&
      (!selection.lines?.length || selection.lines.includes(e.taskLine ?? 0)) &&
      (!selection.topicId || e.topicId === selection.topicId) &&
      (!selection.skillId ||
        e.skillId === selection.skillId ||
        e.skillIds?.includes(selection.skillId)) &&
      (!selection.level || e.level === selection.level) &&
      (selection.only !== "new" || !selection.seenIds?.includes(e.id)) &&
      (selection.only !== "errors" || selection.errorIds?.includes(e.id)),
  );
  const count = selection.count === "all" ? pool.length : selection.count;
  if (!Number.isInteger(count) || count < 1 || count > pool.length)
    throw new Error(
      `По этим условиям доступно ${pool.length} заданий. Уменьшите размер подборки или измените фильтры.`,
    );
  // Round-robin through shuffled skills keeps a mixed practice from concentrating on one topic.
  const groups = new Map<string, Exercise[]>();
  for (const e of shuffled(pool, seed))
    groups.set(e.skillId, [...(groups.get(e.skillId) ?? []), e]);
  const ordered: Exercise[] = [];
  while (ordered.length < pool.length)
    for (const group of groups.values()) {
      const item = group.shift();
      if (item) ordered.push(item);
    }
  return ordered.slice(0, count);
}
export function validateVariant(
  variant: ExamVariant,
  materials: Materials,
  validation: { mode?: "publication" | "snapshot" } = {},
): void {
  const fail = (message: string): never => {
    throw new Error(`${variant.id}: ${message}`);
  };
  if (variant.specificationId !== specification.id)
    fail("несовместимая экзаменационная модель");
  if (
    variant.status !== "published" ||
    variant.reviewStage !== "publication-approved"
  )
    fail("работа не допущена к публикации");
  if (
    new Set(variant.assignments.map((ref) => ref.id)).size !==
    variant.assignments.length
  )
    fail("повтор задания");
  const items = variant.assignments.map((ref) => {
    const e = materials.exercises.find(
      (e) => e.id === ref.id && e.revision === ref.revision,
    );
    if (
      !e ||
      (validation.mode !== "snapshot" && !eligible(e)) ||
      e.format !== "exam-model"
    )
      return fail(`задание ${ref.id}: отсутствует проверенная версия`);
    const line = lineFor(e.taskLine ?? 0);
    if (
      !line ||
      line.response !== e.responseKind ||
      line.input !== e.input ||
      line.orderMatters !== e.policy.orderMatters
    )
      fail(`задание ${ref.id}: формат не соответствует линии`);
    return e;
  });
  if (
    items.length !== testLines.length ||
    testLines.some(
      (line) => items.filter((e) => e.taskLine === line.number).length !== 1,
    )
  )
    fail("нужны все линии 2–12 ровно по одному разу");
  for (const group of ["syntax", "reading"] as const) {
    const grouped = items.filter(
      (e) => lineFor(e.taskLine!)?.textGroup === group,
    );
    const ids = new Set(grouped.map((e) => e.sourceTextId));
    if (ids.size !== 1 || ids.has(undefined))
      fail(`несогласованный общий текст ${group}`);
  }
  for (const e of items)
    if (
      e.sourceTextId &&
      (!variant.sourceTextIds.includes(e.sourceTextId) ||
        !materials.texts.some((t) => t.id === e.sourceTextId && t.rightsBasis))
    )
      fail("нет исходного текста или прав");
  const writings = variant.writingIds.map((id) =>
    materials.writing.find((w) => w.id === id),
  );
  if (variant.kind === "full") {
    if (
      writings.length !== 2 ||
      !writings.some((w) => w?.line === 1) ||
      !writings.some((w) => w?.line === 13)
    )
      fail("нет изложения или сочинения");
    const summary = writings.find((w) => w?.line === 1)!;
    const essay = writings.find((w) => w?.line === 13)!;
    if (
      !materials.audio.some(
        (a) =>
          a.id === summary.audioId &&
          a.textId === summary.sourceTextId &&
          a.path &&
          a.durationSeconds > 0,
      )
    )
      fail("нет аудиозаписи изложения");
    if (
      essay.sourceTextId !==
        items.find((e) => e.taskLine === 10)?.sourceTextId ||
      essay.prompts.length !== 3
    )
      fail("сочинение не согласовано с текстом");
    for (const w of writings)
      if (
        !w ||
        !variant.sourceTextIds.includes(w.sourceTextId) ||
        !materials.texts.some((t) => t.id === w.sourceTextId && t.rightsBasis)
      )
        fail("нет текста письменной части");
  } else if (writings.length)
    fail("в тестовой части не должно быть письменных заданий");
}
type CatalogMaterials = Omit<Materials, "exercises"> & {
  exercises: ExerciseSummary[];
};
function buildVariant(
  materials: Materials | CatalogMaterials,
  kind: "full" | "test",
  seed: string,
  selection: Pick<
    Selection,
    | "only"
    | "seenIds"
    | "errorIds"
    | "level"
    | "seenWritingIds"
    | "seenTextIds"
    | "seenAudioIds"
  > = {},
  full = true,
): ExamVariant {
  const bank = materials.exercises
    .filter(
      (e) =>
        (full
          ? eligible(e as Exercise)
          : "generationEligible" in e && e.generationEligible === true) &&
        e.format === "exam-model" &&
        (!selection.level || e.level === selection.level) &&
        (selection.only !== "new" || !selection.seenIds?.includes(e.id)) &&
        (selection.only !== "errors" || selection.errorIds?.includes(e.id)),
    )
    .sort((a, b) => a.id.localeCompare(b.id, "en") || a.revision - b.revision);
  const usedText = (id: string) => {
    const text = materials.texts.find((t) => t.id === id);
    return (
      selection.only === "new" &&
      (selection.seenTextIds?.includes(id) ||
        selection.seenTextIds?.includes(`${id}@${text?.revision}`))
    );
  };
  const usedWriting = (writing: WritingAssignment) =>
    selection.only === "new" &&
    (selection.seenWritingIds?.includes(writing.id) ||
      selection.seenWritingIds?.includes(`${writing.id}@${writing.revision}`) ||
      usedText(writing.sourceTextId));
  const selected: (Exercise | ExerciseSummary)[] = [];
  for (const group of ["syntax", "reading"] as const) {
    const numbers = testLines
      .filter((line) => line.textGroup === group)
      .map((line) => line.number);
    const ids = [
      ...new Set(
        bank
          .filter((e) => numbers.includes(e.taskLine ?? 0))
          .map((e) => e.sourceTextId),
      ),
    ].filter((id): id is string => !!id);
    const compatible = ids.filter(
      (id) =>
        !usedText(id) &&
        numbers.every((n) =>
          bank.some((e) => e.taskLine === n && e.sourceTextId === id),
        ) &&
        (group !== "reading" ||
          kind !== "full" ||
          materials.writing.some(
            (w) => w.line === 13 && w.sourceTextId === id && !usedWriting(w),
          )),
    );
    const textId = shuffled(compatible, `${seed}:${group}`)[0];
    if (!textId)
      throw new Error(
        `Не хватает согласованных заданий ${numbers.join(", ")} с общим текстом. Измените фильтры или выберите тематическую тренировку.`,
      );
    for (const n of numbers)
      selected.push(
        shuffled(
          bank.filter((e) => e.taskLine === n && e.sourceTextId === textId),
          `${seed}:${n}`,
        )[0],
      );
  }
  for (const line of testLines.filter((line) => !line.textGroup)) {
    const e = shuffled(
      bank.filter((e) => e.taskLine === line.number),
      `${seed}:${line.number}`,
    )[0];
    if (!e)
      throw new Error(
        `Не хватает проверенных заданий № ${line.number}. Измените фильтры или выберите тематическую тренировку.`,
      );
    selected.push(e);
  }
  const reading = selected.find((e) => e.taskLine === 10)!.sourceTextId;
  const summary = shuffled(
    materials.writing.filter(
      (w) =>
        w.line === 1 &&
        !usedWriting(w) &&
        materials.audio.some(
          (a) =>
            a.id === w.audioId &&
            (selection.only !== "new" ||
              (!selection.seenAudioIds?.includes(a.id) &&
                !selection.seenAudioIds?.includes(`${a.id}@${a.revision}`))),
        ),
    ),
    `${seed}:summary`,
  )[0];
  const essay = materials.writing.find(
    (w) => w.line === 13 && w.sourceTextId === reading,
  );
  if (kind === "full" && (!summary || !essay))
    throw new Error(
      "Для полного варианта не хватает аудиозаписи изложения или задания сочинения. Доступна тестовая часть.",
    );
  const writing = kind === "full" ? [summary!, essay!] : [];
  const result: ExamVariant = {
    id: `generated-${seed}`,
    seed,
    number: 0,
    revision: 1,
    specificationId: specification.id,
    title:
      kind === "full"
        ? "Случайный учебный вариант ОГЭ"
        : "Случайная тестовая часть ОГЭ",
    kind,
    assignments: selected
      .sort((a, b) => a.taskLine! - b.taskLine!)
      .map((e) => ({ id: e.id, revision: e.revision })),
    sourceTextIds: [
      ...new Set([
        ...selected
          .map((e) => e.sourceTextId)
          .filter((id): id is string => !!id),
        ...writing.map((w) => w.sourceTextId),
      ]),
    ],
    writingIds: writing.map((w) => w.id),
    status: "published",
    reviewStage: "publication-approved",
    teacherApproval: "pending",
  };
  if (full) validateVariant(result, materials as Materials);
  return result;
}
export function generateVariant(
  materials: Materials,
  kind: "full" | "test",
  seed: string,
  selection: Parameters<typeof buildVariant>[3] = {},
) {
  return buildVariant(materials, kind, seed, selection, true);
}
/** A plan is checked against complete conditions before a work can be saved. */
export function generateVariantMetadata(
  materials: CatalogMaterials,
  kind: "full" | "test",
  seed: string,
  selection: Parameters<typeof buildVariant>[3] = {},
) {
  return buildVariant(materials, kind, seed, selection, false);
}
export function createSession(
  items: WorkItem[],
  materials: Materials,
  options: Pick<PracticeSession, "title" | "kind" | "mode" | "seed"> & {
    variant?: ExamVariant;
    timed?: boolean;
  },
  now = new Date().toISOString(),
): PracticeSession {
  const ids = items.map((item) =>
    item.kind === "exercise"
      ? item.exercise.sourceTextId
      : item.writing.sourceTextId,
  );
  const audioIds = items.flatMap((item) =>
    item.kind === "writing" && item.writing.audioId
      ? [item.writing.audioId]
      : [],
  );
  return structuredClone({
    schemaVersion: 1,
    catalogVersion: catalogVersion.version,
    generationVersion: 2,
    id: crypto.randomUUID(),
    title: options.title,
    kind: options.kind,
    mode: options.mode,
    specificationId: specification.id,
    seed: options.seed,
    items,
    texts: materials.texts.filter((t) => ids.includes(t.id)),
    audio: materials.audio.filter((a) => audioIds.includes(a.id)),
    answers: {},
    checkedIds: [],
    selectedPrompts: {},
    startedAt: now,
    updatedAt: now,
    activeIndex: 0,
    audioPlays: {},
    audioLastEndedAt: {},
    audioCompletedPlays: {},
    audioPositions: {},
    originVariantId: options.variant?.id,
    ...(options.timed
      ? { durationMinutes: specification.durationMinutes }
      : {}),
  });
}
export function sessionFromVariant(
  variant: ExamVariant,
  materials: Materials,
  mode: "learn" | "control",
  generated = false,
): PracticeSession {
  validateVariant(variant, materials);
  const items: WorkItem[] = variant.assignments.map((ref) => ({
    kind: "exercise",
    exercise: materials.exercises.find(
      (e) => e.id === ref.id && e.revision === ref.revision,
    )!,
  }));
  for (const id of variant.writingIds)
    items.push({
      kind: "writing",
      writing: materials.writing.find((w) => w.id === id)!,
    });
  items.sort((a, b) => itemLine(a) - itemLine(b));
  return createSession(items, materials, {
    title: variant.title,
    kind: `${generated ? "generated" : "fixed"}-${variant.kind}`,
    mode,
    seed: variant.seed ?? variant.id,
    variant,
    timed: mode === "control" && variant.kind === "full",
  });
}
export const itemId = (item: WorkItem) =>
  item.kind === "exercise" ? item.exercise.id : item.writing.id;
export const itemLine = (item: WorkItem) =>
  item.kind === "exercise" ? (item.exercise.taskLine ?? 0) : item.writing.line;
export const wordCount = (text: string) =>
  (
    text
      .replace(/(?:\p{Lu}\.\s*){1,2}(\p{Lu}\p{Ll}+)/gu, "$1")
      .match(/\p{L}+(?:[-’']\p{L}+)*/gu) ?? []
  ).length;
export function remainingSeconds(session: PracticeSession, now = Date.now()) {
  return session.durationMinutes === undefined
    ? undefined
    : Math.max(
        0,
        Math.ceil(
          (Date.parse(session.startedAt) +
            session.durationMinutes * 60000 -
            now) /
            1000,
        ),
      );
}
export function writingStatus(
  session: PracticeSession,
  writing: WritingAssignment,
  answer: string,
): "skipped" | "insufficient" | "expert" | "reviewed" {
  if (!answer.trim()) return "skipped";
  if (wordCount(answer) < specification.writing.minWords) return "insufficient";
  const promptId = session.selectedPrompts[writing.id] ?? writing.prompts[0].id;
  const review = session.writingReviews?.[`${writing.id}:${promptId}`];
  const limits =
    writing.line === 1
      ? { ИК1: 2, ИК2: 2, ИК3: 2 }
      : { СК1: 1, СК2: 4, СК3: 2, СК4: 1 };
  const checked =
    review?.role === "expert" &&
    !!review.reviewer?.trim() &&
    !!review.reviewedAt &&
    Number.isFinite(Date.parse(review.reviewedAt)) &&
    (!review.promptId || review.promptId === promptId) &&
    Object.entries(limits).every(
      ([id, max]) =>
        Number.isInteger(review.scores[id]) &&
        review.scores[id] >= 0 &&
        review.scores[id] <= max,
    );
  return checked ? "reviewed" : "expert";
}
export function resultsFor(session: PracticeSession) {
  return session.items.map((item) => {
    const answer = session.answers[itemId(item)] ?? "";
    const grade =
      item.kind === "exercise" && answer.trim()
        ? gradeExercise(answer, item.exercise)
        : undefined;
    return {
      item,
      answer,
      grade,
      status:
        item.kind === "writing"
          ? writingStatus(session, item.writing, answer)
          : !answer.trim()
            ? "skipped"
            : grade!.status,
    };
  });
}
