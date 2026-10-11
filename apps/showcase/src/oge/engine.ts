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
    !!exercise.answers.length &&
    exercise.answers.every(
      (answer) => gradeExercise(answer, exercise).status === "correct",
    )
  );
}
export function gradeExercise(answer: string, exercise: Exercise): Grade {
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
      (!selection.skillId || e.skillId === selection.skillId) &&
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
    if (!e || !eligible(e) || e.format !== "exam-model")
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
export function generateVariant(
  materials: Materials,
  kind: "full" | "test",
  seed: string,
  selection: Pick<Selection, "only" | "seenIds" | "errorIds" | "level"> = {},
): ExamVariant {
  const bank = materials.exercises.filter(
    (e) =>
      eligible(e) &&
      e.format === "exam-model" &&
      (!selection.level || e.level === selection.level) &&
      (selection.only !== "new" || !selection.seenIds?.includes(e.id)) &&
      (selection.only !== "errors" || selection.errorIds?.includes(e.id)),
  );
  const selected: Exercise[] = [];
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
        numbers.every((n) =>
          bank.some((e) => e.taskLine === n && e.sourceTextId === id),
        ) &&
        (group !== "reading" ||
          kind !== "full" ||
          materials.writing.some(
            (w) => w.line === 13 && w.sourceTextId === id,
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
      (w) => w.line === 1 && materials.audio.some((a) => a.id === w.audioId),
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
  validateVariant(result, materials);
  return result;
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
          ? "expert"
          : !answer.trim()
            ? "skipped"
            : grade!.status,
    };
  });
}
