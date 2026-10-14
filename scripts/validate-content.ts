import { vowelExerciseIssues } from "./lib/content-integrity";
import { lessons } from "../apps/showcase/src/content/library";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { policySchema } from "../src/lib/grading";
import {
  exercises,
  topics,
  skills,
  sections,
  type Exercise,
  type Lesson,
} from "../apps/showcase/src/content/registry";
import { routes } from "../apps/showcase/src/routes";
import { existsSync, readFileSync } from "node:fs";
import materialData from "../apps/showcase/src/oge/materials.json" with { type: "json" };
import activityData from "../apps/showcase/src/oge/activities.json" with { type: "json" };
import {
  specification,
  taskLines,
  testLines,
  lineFor,
} from "../apps/showcase/src/oge/specification";
import {
  gradeExercise,
  validateVariant,
} from "../apps/showcase/src/oge/engine";
import type {
  AudioMaterial,
  SourceText,
  WritingAssignment,
  ExamVariant,
  InteractiveActivity,
} from "../apps/showcase/src/oge/model";
const materials = materialData as {
  texts: SourceText[];
  audio: AudioMaterial[];
  writing: WritingAssignment[];
  variants: ExamVariant[];
};

const text = z.string().trim().min(1);
const numbers = z.array(z.number().int().positive()).min(1);
const interactiveSchema = z.object({
  kind: z.enum([
    "punctuation",
    "foundation",
    "spelling",
    "stress",
    "mistake",
    "comparison",
  ]),
  title: text,
  instruction: text,
  examples: z
    .array(
      z.object({
        label: text,
        text,
        expected: numbers,
        tokens: z.array(text).optional(),
        options: z.array(text).optional(),
        explanation: text,
      }),
    )
    .min(1),
});
const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["paragraph", "rule", "warning", "summary"]),
    title: text.optional(),
    text,
  }),
  z.object({
    type: z.literal("example"),
    title: text,
    text,
    steps: z.array(text).min(1),
  }),
  z.object({
    type: z.literal("comparison"),
    title: text,
    items: z.array(z.object({ text, explanation: text })).min(2),
  }),
  z.object({
    type: z.literal("steps"),
    title: text,
    items: z.array(text).min(1),
  }),
  z.object({
    type: z.literal("table"),
    title: text,
    headers: z.array(text).min(2),
    rows: z.array(z.array(text).min(2)).min(1),
  }),
  z.object({ type: z.literal("interactive"), data: interactiveSchema }),
  z.object({
    type: z.literal("checkpoint"),
    title: text,
    question: text,
    options: z.array(text).min(2),
    answer: z.number().int().positive(),
    explanation: text,
  }),
]);
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function unique(values: string[], label: string) {
  ensure(
    new Set(values).size === values.length,
    `${label}: повторяющиеся значения`,
  );
}
export function validateContent(
  bank: Exercise[] = exercises,
  library: Lesson[] = lessons,
) {
  for (const [values, label] of [
    [topics.map((t) => t.id), "Темы ID"],
    [topics.map((t) => t.slug), "Темы slug"],
    [bank.map((e) => e.id), "Упражнения ID"],
    [bank.map((e) => e.slug), "Упражнения slug"],
    [library.map((l) => l.id), "Уроки ID"],
    [skills.map((s) => s.id), "Навыки ID"],
    [routes, "Маршруты"],
  ] as [string[], string][])
    unique(values, label);
  const sourceMethods = new Set([
    "project-original",
    "local-original-import",
    "original-explanation-from-reference",
  ]);
  for (const topic of topics) {
    ensure(
      sections.some((section) => section.id === topic.sectionId),
      `${topic.id}: раздел не найден`,
    );
    if (topic.status === "published") {
      ensure(
        library.filter((lesson) => lesson.topicId === topic.id).length === 1,
        `${topic.id}: нужен один непустой урок`,
      );
      ensure(
        ["izlozhenie", "sochinenie"].includes(topic.id)
          ? materials.writing.filter(
              (w) => w.line === (topic.id === "izlozhenie" ? 1 : 13),
            ).length >= 5
          : bank.filter((exercise) => exercise.topicId === topic.id).length >=
              10,
        `${topic.id}: менее 10 заданий`,
      );
    }
  }
  for (const lesson of library) {
    ensure(
      lesson.objectives.length >= 2 && lesson.sections.length >= 5,
      `${lesson.id}: неполный урок`,
    );
    ensure(
      topics.some(
        (topic) => topic.id === lesson.topicId && topic.status === "published",
      ),
      `${lesson.id}: тема не опубликована`,
    );
    unique(
      lesson.sections.map((section) => section.id),
      `${lesson.id}: разделы`,
    );
    ensure(lesson.provenance.length > 0, `${lesson.id}: нет источника`);
    for (const id of lesson.relatedTopicIds)
      ensure(
        topics.some((topic) => topic.id === id && topic.status === "published"),
        `${lesson.id}: связанная тема ${id} не найдена`,
      );
    for (const section of lesson.sections) {
      ensure(
        section.title &&
          /^[a-z0-9-]+$/.test(section.id) &&
          section.blocks.length,
        `${lesson.id}: пустой раздел`,
      );
      for (const block of section.blocks) {
        blockSchema.parse(block);
        if (block.type === "table")
          for (const row of block.rows)
            ensure(
              row.length === block.headers.length,
              `${lesson.id}: таблица имеет разное число столбцов`,
            );
        if (block.type === "checkpoint")
          ensure(
            block.answer <= block.options.length,
            `${lesson.id}: ответ самопроверки вне вариантов`,
          );
        if (block.type === "interactive")
          for (const example of block.data.examples) {
            unique(
              example.expected.map(String),
              `${lesson.id}: ответ интерактива`,
            );
            const limit =
              block.data.kind === "stress"
                ? example.text.length
                : block.data.kind === "punctuation"
                  ? (example.tokens?.length ?? 0) - 1
                  : (example.tokens?.length ?? example.options?.length ?? 0);
            ensure(
              example.expected.every((number) => number <= limit),
              `${lesson.id}: позиция интерактива вне границ`,
            );
            if (block.data.kind === "stress")
              ensure(
                example.expected.length === 1 &&
                  /[аеёиоуыэюя]/iu.test(example.text[example.expected[0] - 1]),
                `${lesson.id}: ударение не на гласной`,
              );
          }
      }
    }
  }
  for (const exercise of bank) {
    ensure(
      exercise.reviewStatus === "checked-demo" &&
        exercise.provenance.teacherApproval === "pending",
      `${exercise.id}: редакторский статус`,
    );
    ensure(
      exercise.prompt &&
        exercise.explanation &&
        exercise.hint &&
        exercise.steps.length >= 2,
      `${exercise.id}: нет условия/разбора/подсказки`,
    );
    if (exercise.taskLine === 7)
      ensure(
        vowelExerciseIssues(exercise).length === 0,
        `${exercise.id}: ${vowelExerciseIssues(exercise).join("; ")}`,
      );
    const topic = topics.find((topic) => topic.id === exercise.topicId);
    ensure(
      topic?.status === "published" &&
        topic.slug === exercise.topicSlug &&
        topic.title === exercise.topicTitle,
      `${exercise.id}: неверная тема`,
    );
    ensure(
      topic.examTags.some((exam) => exam === exercise.exam),
      `${exercise.id}: неверный экзамен`,
    );
    const skill = skills.find((skill) => skill.id === exercise.skillId);
    ensure(
      skill?.topicId === topic.id && skill.exam === exercise.exam,
      `${exercise.id}: навык относится к другому экзамену/теме`,
    );
    policySchema.parse(exercise.policy);
    ensure(
      ["digits_sequence", "short_text"].includes(exercise.responseKind),
      `${exercise.id}: тип ответа`,
    );
    ensure(
      [
        "digits",
        "text",
        "single",
        "multiple",
        "words",
        "matching",
        "punctuation",
      ].includes(exercise.input),
      `${exercise.id}: интерфейс ответа`,
    );
    ensure(
      exercise.answers.length &&
        exercise.answers.every(
          (answer) => gradeExercise(answer, exercise).status === "correct",
        ),
      `${exercise.id}: ключ не проходит политику`,
    );
    unique(exercise.options, `${exercise.id}: варианты`);
    if (exercise.options.length)
      ensure(
        exercise.optionExplanations.length === exercise.options.length,
        `${exercise.id}: нет разбора каждого варианта`,
      );
    if (exercise.responseKind === "digits_sequence" && exercise.options.length)
      ensure(
        exercise.answers.every((answer) =>
          [...answer].every(
            (digit) => Number(digit) <= exercise.options.length,
          ),
        ),
        `${exercise.id}: номер ответа отсутствует`,
      );
    ensure(
      exercise.source.sourceTitle &&
        exercise.source.author &&
        exercise.source.licenseNote &&
        exercise.source.rightsStatus !== "unknown",
      `${exercise.id}: источник и права`,
    );
    ensure(
      exercise.provenance.rightsBasis &&
        exercise.provenance.reviewNote &&
        sourceMethods.has(exercise.provenance.method),
      `${exercise.id}: происхождение`,
    );
    ensure(
      routes.includes(`/practice/${exercise.slug}/`) &&
        routes.includes(`/theory/${exercise.topicSlug}/`),
      `${exercise.id}: сломанная связь`,
    );
    if (exercise.taskLine)
      ensure(
        exercise.exam === "OGE" &&
          testLines.some((line) => line.number === exercise.taskLine) &&
          exercise.examModel.status === "project" &&
          exercise.examModel.year === 2027,
        `${exercise.id}: неподтверждённая экзаменационная линия`,
      );
    if (exercise.taskLine) {
      const line = lineFor(exercise.taskLine)!;
      ensure(
        line.response === exercise.responseKind &&
          line.input === exercise.input &&
          line.orderMatters === exercise.policy.orderMatters,
        `${exercise.id}: формат линии`,
      );
      ensure(
        exercise.reviewStages?.some((s) => s.stage === "answer-checked") &&
          exercise.reviewStages?.some((s) => s.stage === "explanation-checked"),
        `${exercise.id}: этапы предметной проверки`,
      );
    }
    if (exercise.sourceTextId)
      ensure(
        materials.texts.some((t) => t.id === exercise.sourceTextId),
        `${exercise.id}: нет общего текста`,
      );
  }
  unique(
    materials.texts.map((t) => t.id),
    "Исходные тексты",
  );
  unique(
    materials.audio.map((a) => a.id),
    "Аудио",
  );
  unique(
    materials.writing.map((w) => w.id),
    "Письменные работы",
  );
  unique(
    materials.variants.map((v) => v.id),
    "Варианты",
  );
  for (const line of testLines)
    ensure(
      bank.filter((e) => e.exam === "OGE" && e.taskLine === line.number)
        .length >= 20,
      `Линия ${line.number}: менее 20 проверенных заданий`,
    );
  ensure(
    taskLines.length === 13 && specification.durationMinutes === 235,
    "Экзаменационная модель",
  );
  for (const sourceText of materials.texts)
    ensure(
      sourceText.paragraphs.length &&
        sourceText.paragraphs.every((p) => p.trim()) &&
        sourceText.rightsBasis,
      `${sourceText.id}: текст или права`,
    );
  for (const audio of materials.audio) {
    ensure(
      materials.texts.some((t) => t.id === audio.textId),
      `${audio.id}: текст аудио`,
    );
    const path = `apps/showcase/public${audio.path}`;
    ensure(existsSync(path), `${audio.id}: аудиофайл отсутствует`);
    const bytes = readFileSync(path);
    ensure(
      (audio.path.endsWith(".mp3")
        ? bytes.toString("ascii", 0, 3) === "ID3" ||
          (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WAVE") && bytes.length > 1000000,
      `${audio.id}: некорректная запись`,
    );
    ensure(
      audio.durationSeconds >= 180 &&
        audio.durationSeconds <= 240 &&
        audio.kind === "original-synthesized" &&
        audio.attribution,
      `${audio.id}: параметры озвучки`,
    );
  }
  for (const writing of materials.writing)
    ensure(
      materials.texts.some((t) => t.id === writing.sourceTextId) &&
        writing.prompts.length === (writing.line === 13 ? 3 : 1) &&
        writing.checklist.length >= 3 &&
        writing.analysis,
      `${writing.id}: неполная письменная работа`,
    );
  ensure(
    materials.variants.length >= 5,
    "Недостаточно фиксированных полных вариантов",
  );
  for (const variant of materials.variants)
    validateVariant(variant, { ...materials, exercises: bank });
  const activities = activityData as InteractiveActivity[];
  unique(
    activities.map((a) => a.id),
    "Тренажёры",
  );
  ensure(activities.length >= 5, "Недостаточно разных механик");
  for (const activity of activities) {
    ensure(
      activity.situations.length >= 5 &&
        topics.some((t) => t.id === activity.topicId),
      `${activity.id}: ситуации или теория`,
    );
    unique(
      activity.situations.map((s) => s.id),
      `${activity.id}: ситуации`,
    );
    for (const situation of activity.situations) {
      ensure(
        situation.instruction &&
          situation.text &&
          situation.explanation &&
          situation.details.length &&
          situation.fields.some((f) => f.expected.length),
        `${situation.id}: неполная ситуация`,
      );
      unique(
        situation.fields.map((f) => f.id),
        `${situation.id}: поля`,
      );
      for (const field of situation.fields)
        if (field.options)
          ensure(
            field.expected.every((a) => field.options!.includes(a)),
            `${situation.id}: ответ вне выбора`,
          );
    }
  }
  return {
    lessons: library.length,
    topics: topics.filter((topic) => topic.status === "published").length,
    exercises: bank.length,
    imported: bank.filter(
      (exercise) => exercise.provenance.method === "local-original-import",
    ).length,
    routes: routes.length,
    oge: bank.filter((e) => e.exam === "OGE").length,
    fixedVariants: materials.variants.length,
    games: activities.length,
    situations: activities.reduce((n, a) => n + a.situations.length, 0),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log("Контент проверен:", validateContent());
